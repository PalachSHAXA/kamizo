import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canApproveProtocol,
  canGenerateProtocol,
  isProtocolApproverRole,
  isProtocolGeneratorRole,
  isMeetingVoterRole,
  parseVoteChoice,
} from '../security';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (request: Request, env: any, params: Record<string, string>) => Promise<Response>>(),
  user: null as any,
  tenantId: null as string | null,
  events: [] as string[],
  ids: [] as string[],
}));

vi.mock('../helpers', () => ({
  route: (method: string, path: string, handler: any) => mocks.handlers.set(`${method} ${path}`, handler),
  getUser: vi.fn(async () => { mocks.events.push('auth'); return mocks.user; }),
  getTenantId: vi.fn(() => { mocks.events.push('tenant'); return mocks.tenantId; }),
  requireFeature: vi.fn(async () => { mocks.events.push('feature'); return { allowed: true }; }),
  getCached: vi.fn(() => null),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
  json: (data: unknown, status = 200) => Response.json(data, { status }),
  error: (message: string, status = 400) => Response.json({ error: message }, { status }),
  bilingualError: (ru: string, uz: string, status = 400) => Response.json({ error: ru, error_uz: uz }, { status }),
  generateId: vi.fn(() => mocks.ids.shift() || 'generated-id'),
  generateVoteHash: vi.fn(() => 'vote-hash'),
  createRequestLogger: vi.fn(() => ({ error: vi.fn() })),
}));

import { registerMeetingListRoutes } from '../crud-list';
import { registerProtocolRoutes } from '../protocol';
import { registerVotingRoutes } from '../voting';

type DbCall = { sql: string; params: unknown[]; method: 'first' | 'all' | 'run' };
type TransactionState = { snapshot: () => unknown; restore: (snapshot: unknown) => void };

function createDb(resolve: (call: DbCall) => unknown = () => null, transactionState?: TransactionState) {
  const calls: DbCall[] = [];
  let batchCount = 0;
  return {
    calls,
    get batchCount() { return batchCount; },
    prepare(sql: string) {
      let params: unknown[] = [];
      const execute = async (method: DbCall['method']) => {
        const call = { sql, params, method };
        calls.push(call);
        const result = resolve(call);
        if (method === 'all') return { results: result ?? [] };
        if (method === 'run') return result ?? { success: true, meta: { changes: 1 } };
        return result ?? null;
      };
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        first: () => execute('first'),
        all: () => execute('all'),
        run: () => execute('run'),
      };
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      batchCount += 1;
      const snapshot = transactionState?.snapshot();
      const results = [];
      try {
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        if (transactionState) transactionState.restore(snapshot);
        throw error;
      }
    },
  };
}

function handler(method: string, path: string) {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

function voteDb(options: { agendaExists?: boolean; existingVote?: { id: string; choice: string } | null } = {}) {
  const { agendaExists = true, existingVote = null } = options;
  return createDb(({ sql, method }) => {
    if (method === 'first' && sql.includes('FROM meetings')) {
      return { status: 'voting_open', require_otp: 1, building_id: 'building-1', allow_revote: 1 };
    }
    if (method === 'first' && sql.includes('FROM meeting_agenda_items')) {
      return agendaExists ? { id: 'agenda-1' } : null;
    }
    if (method === 'first' && sql.includes('FROM meeting_eligible_voters')) {
      return { id: 'eligible-1', apartment: '12', total_area: 64 };
    }
    if (method === 'first' && sql.includes('FROM meeting_vote_records')) return existingVote;
    return null;
  });
}

type VoteTransactionState = {
  vote: { id: string; choice: string; voteHash: string } | null;
  participants: string[];
  comments: string[];
  reconsiderationStatus: string;
};

function transactionalVoteDb(options: {
  existingVote?: { id: string; choice: string } | null;
  casLoses?: boolean;
  failComment?: boolean;
} = {}) {
  const state: VoteTransactionState = {
    vote: options.existingVote
      ? { ...options.existingVote, voteHash: 'old-vote-hash' }
      : null,
    participants: [],
    comments: [],
    reconsiderationStatus: options.existingVote ? 'pending' : 'none',
  };
  const snapshot = () => structuredClone(state);
  const restore = (saved: unknown) => Object.assign(state, saved);
  const db = createDb(({ sql, params, method }) => {
    if (method === 'first' && sql.includes('FROM meetings')) {
      return { status: 'voting_open', require_otp: 1, building_id: 'building-1', allow_revote: 1 };
    }
    if (method === 'first' && sql.includes('FROM meeting_agenda_items')) return { id: 'agenda-1' };
    if (method === 'first' && sql.includes('FROM meeting_eligible_voters')) {
      return { id: 'eligible-1', apartment: '12', total_area: 64 };
    }
    if (method === 'first' && sql.includes('FROM meeting_vote_records')) {
      return state.vote ? { id: state.vote.id, choice: state.vote.choice } : null;
    }
    if (method !== 'run') return null;

    if (sql.includes('INSERT INTO meeting_vote_records')) {
      if (options.casLoses) return { success: true, meta: { changes: 0 } };
      state.vote = { id: String(params[0]), choice: String(params[4]), voteHash: String(params[14]) };
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE meeting_vote_records')) {
      if (options.casLoses) return { success: true, meta: { changes: 0 } };
      state.vote = { id: String(params[6]), choice: String(params[0]), voteHash: String(params[2]) };
      return { success: true, meta: { changes: 1 } };
    }

    const isGuardedByNewVote = sql.includes('vote_hash = ?')
      && params.includes('vote-hash')
      && params.includes('tenant-1')
      && state.vote?.voteHash === 'vote-hash';
    if (sql.includes('meeting_participated_voters')) {
      if (isGuardedByNewVote) state.participants.push('user-1');
      return { success: true, meta: { changes: isGuardedByNewVote ? 1 : 0 } };
    }
    if (sql.includes('meeting_agenda_comments')) {
      if (options.failComment) throw new Error('comment insert failed');
      if (isGuardedByNewVote) state.comments.push(String(params[0]));
      return { success: true, meta: { changes: isGuardedByNewVote ? 1 : 0 } };
    }
    if (sql.includes('meeting_vote_reconsideration_requests')) {
      if (isGuardedByNewVote) state.reconsiderationStatus = 'vote_changed';
      return { success: true, meta: { changes: isGuardedByNewVote ? 1 : 0 } };
    }
    return null;
  }, { snapshot, restore });

  return { db, state };
}

function protocolDb(status: string, protocolId: string | null = 'protocol-old') {
  return createDb(({ sql, method }) => {
    if (method === 'first' && sql.includes('FROM meetings')) {
      return {
        id: 'meeting-1',
        number: 7,
        status,
        protocol_id: protocolId,
        building_address: '12 Test Street',
        format: 'online',
        organizer_name: 'Kamizo',
        total_area: 100,
        voted_area: 60,
        participated_count: 2,
        participation_percent: 60,
        quorum_reached: 1,
      };
    }
    if (method === 'first' && sql.includes('FROM meeting_protocols')) return { id: 'generated-id' };
    if (method === 'all') return [];
    return null;
  });
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'user-1', name: 'Resident One', role: 'resident', building_id: 'building-1' };
  mocks.tenantId = 'tenant-1';
  mocks.events = [];
  mocks.ids = ['generated-id'];
});

describe('meeting tenant context', () => {
  it.each([
    ['GET', '/api/meetings'],
    ['POST', '/api/meetings/:meetingId/agenda/:agendaItemId/vote'],
    ['GET', '/api/meetings/:meetingId/votes/me'],
    ['GET', '/api/meetings/:meetingId/stats'],
    ['POST', '/api/meetings/:id/generate-protocol'],
    ['POST', '/api/meetings/:id/approve-protocol'],
    ['GET', '/api/meetings/:meetingId/protocol'],
    ['GET', '/api/meetings/:meetingId/protocol/data'],
  ])('rejects sentinel tenant on %s %s before feature access or SQL', async (method, routePath) => {
    registerMeetingListRoutes();
    registerVotingRoutes();
    registerProtocolRoutes();
    mocks.tenantId = '__no_tenant__';
    const db = createDb(() => { throw new Error('SQL must not execute'); });
    const request = new Request('https://api.kamizo.uz/api/meetings/meeting-1', {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify({ choice: 'for' }) : undefined,
    });

    const response = await handler(method, routePath)(
      request,
      { DB: db },
      { id: 'meeting-1', meetingId: 'meeting-1', agendaItemId: 'agenda-1' },
    );

    expect(response.status).toBe(403);
    expect(mocks.events).toEqual(['auth', 'tenant']);
    expect(db.calls).toHaveLength(0);
  });
});

describe('meeting voting policy', () => {
  it('allows only owner roles to vote', () => {
    expect(isMeetingVoterRole('resident')).toBe(true);
    expect(isMeetingVoterRole('commercial_owner')).toBe(true);
    expect(isMeetingVoterRole('tenant')).toBe(false);
    expect(isMeetingVoterRole('executor')).toBe(false);
  });

  it('accepts only canonical vote choices', () => {
    expect(parseVoteChoice('for')).toBe('for');
    expect(parseVoteChoice('against')).toBe('against');
    expect(parseVoteChoice('abstain')).toBe('abstain');
    expect(parseVoteChoice('yes')).toBeNull();
    expect(parseVoteChoice(null)).toBeNull();
  });
});

describe('meeting protocol lifecycle policy', () => {
  it('checks protocol roles independently from lifecycle state', () => {
    expect(isProtocolGeneratorRole('admin')).toBe(true);
    expect(isProtocolGeneratorRole('manager')).toBe(true);
    expect(isProtocolGeneratorRole('resident')).toBe(false);
    expect(isProtocolApproverRole('director')).toBe(true);
    expect(isProtocolApproverRole('manager')).toBe(false);
  });

  it.each(['admin', 'director', 'manager'])('allows %s to generate after voting closes', (role) => {
    expect(canGenerateProtocol(role, 'voting_closed')).toBe(true);
    expect(canGenerateProtocol(role, 'results_published')).toBe(true);
  });

  it.each(['resident', 'executor'])('denies %s protocol generation', (role) => {
    expect(canGenerateProtocol(role, 'voting_closed')).toBe(false);
  });

  it('denies generation in invalid and terminal states', () => {
    expect(canGenerateProtocol('admin', 'voting_open')).toBe(false);
    expect(canGenerateProtocol('admin', 'protocol_generated')).toBe(false);
    expect(canGenerateProtocol('admin', 'protocol_approved')).toBe(false);
  });

  it.each(['admin', 'director'])('allows %s to approve a generated protocol', (role) => {
    expect(canApproveProtocol(role, 'protocol_generated')).toBe(true);
  });

  it.each(['manager', 'resident'])('denies %s protocol approval', (role) => {
    expect(canApproveProtocol(role, 'protocol_generated')).toBe(false);
  });

  it('denies approval outside the generated state', () => {
    expect(canApproveProtocol('admin', 'results_published')).toBe(false);
    expect(canApproveProtocol('admin', 'protocol_approved')).toBe(false);
  });
});

describe('meeting list route security', () => {
  it('rejects anonymous requests', async () => {
    registerMeetingListRoutes();
    mocks.user = null;
    const db = createDb(() => []);

    const response = await handler('GET', '/api/meetings')(
      new Request('https://api.kamizo.uz/api/meetings'),
      { DB: db },
      {},
    );

    expect(response.status).toBe(401);
  });

  it('rejects requests without tenant context', async () => {
    registerMeetingListRoutes();
    mocks.tenantId = null;
    const db = createDb(() => []);

    const response = await handler('GET', '/api/meetings')(
      new Request('https://api.kamizo.uz/api/meetings'),
      { DB: db },
      {},
    );

    expect(response.status).toBe(403);
  });

  it('always scopes the meeting list to the authenticated tenant', async () => {
    registerMeetingListRoutes();
    const db = createDb(() => []);

    const response = await handler('GET', '/api/meetings')(
      new Request('https://api.kamizo.uz/api/meetings'),
      { DB: db },
      {},
    );

    expect(response.status).toBe(200);
    expect(db.calls[0].sql).toContain('WHERE tenant_id = ?');
    expect(db.calls[0].params[0]).toBe('tenant-1');
  });

  it('tenant-scopes every child query in a populated meeting list', async () => {
    registerMeetingListRoutes();
    const db = createDb(({ sql, method }) => {
      if (method !== 'all') return null;
      if (sql.startsWith('SELECT * FROM meetings')) return [{ id: 'meeting-1', total_area: 100 }];
      if (sql.includes('FROM meeting_schedule_options')) return [{ id: 'option-1', meeting_id: 'meeting-1' }];
      return [];
    });

    const response = await handler('GET', '/api/meetings')(
      new Request('https://api.kamizo.uz/api/meetings'),
      { DB: db },
      {},
    );

    expect(response.status).toBe(200);
    const childTables = [
      'meeting_schedule_options', 'meeting_agenda_items', 'meeting_participated_voters',
      'meeting_vote_records', 'meeting_schedule_votes',
    ];
    for (const table of childTables) {
      const calls = db.calls.filter((call) => call.sql.includes(`FROM ${table}`));
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.sql).toContain('tenant_id = ?');
        expect(call.params).toContain('tenant-1');
      }
    }
  });
});

describe('meeting vote route security', () => {
  const path = '/api/meetings/:meetingId/agenda/:agendaItemId/vote';
  const params = { meetingId: 'meeting-1', agendaItemId: 'agenda-1' };

  function request(body: Record<string, unknown>) {
    return new Request('https://api.kamizo.uz/api/meetings/meeting-1/agenda/agenda-1/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects tenant-role voters', async () => {
    registerVotingRoutes();
    mocks.user.role = 'tenant';

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: voteDb() }, params);

    expect(response.status).toBe(403);
  });

  it('rejects invalid vote choices', async () => {
    registerVotingRoutes();

    const response = await handler('POST', path)(request({ choice: 'yes' }), { DB: voteDb() }, params);

    expect(response.status).toBe(400);
  });

  it('rejects an agenda item outside the tenant-scoped meeting', async () => {
    registerVotingRoutes();
    const db = voteDb({ agendaExists: false });

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: db }, params);

    expect(response.status).toBe(404);
    const agendaLookup = db.calls.find((call) => call.sql.includes('FROM meeting_agenda_items'));
    expect(agendaLookup?.params).toEqual(['agenda-1', 'meeting-1', 'tenant-1']);
  });

  it('ignores client OTP claims when inserting a vote', async () => {
    registerVotingRoutes();
    const db = voteDb();

    const response = await handler('POST', path)(
      request({ choice: 'for', verification_method: 'otp', otp_verified: true }),
      { DB: db },
      params,
    );

    expect(response.status).toBe(200);
    const insert = db.calls.find((call) => call.sql.includes('INSERT INTO meeting_vote_records'));
    expect(insert?.params.slice(12, 14)).toEqual(['login', 0]);
  });

  it('ignores client OTP claims when updating a vote', async () => {
    registerVotingRoutes();
    const db = voteDb({ existingVote: { id: 'vote-1', choice: 'against' } });

    const response = await handler('POST', path)(
      request({ choice: 'for', verification_method: 'otp', otp_verified: true }),
      { DB: db },
      params,
    );

    expect(response.status).toBe(200);
    const update = db.calls.find((call) => call.sql.includes('UPDATE meeting_vote_records'));
    expect(update?.params.slice(4, 6)).toEqual(['login', 0]);
  });

  it('returns 404 for a missing tenant-scoped meeting before checking state', async () => {
    registerVotingRoutes();
    const db = createDb(() => null);

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: db }, params);

    expect(response.status).toBe(404);
  });

  it('returns 409 when a concurrent close prevents the first-vote insert', async () => {
    registerVotingRoutes();
    const db = voteDb();
    const state = { votes: ['winner-vote'] };
    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const statement = originalPrepare(sql);
      if (!sql.includes('INSERT INTO meeting_vote_records')) return statement;
      statement.run = async () => ({ success: true, meta: { changes: 0 } });
      return statement;
    };

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: db }, params);

    expect(response.status).toBe(409);
    expect(state.votes).toEqual(['winner-vote']);
    const participation = db.calls.find((call) => call.sql.includes('meeting_participated_voters'));
    expect(participation?.sql).toContain('vote_hash = ?');
    expect(participation?.params).toContain('vote-hash');
    expect(participation?.params).toContain('tenant-1');
  });

  it('returns 409 when a concurrent revote wins the choice CAS', async () => {
    registerVotingRoutes();
    const db = voteDb({ existingVote: { id: 'vote-1', choice: 'against' } });
    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const statement = originalPrepare(sql);
      if (!sql.includes('UPDATE meeting_vote_records')) return statement;
      statement.run = async () => ({ success: true, meta: { changes: 0 } });
      return statement;
    };

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: db }, params);

    expect(response.status).toBe(409);
  });

  it('rolls back the vote and participation when the comment write fails', async () => {
    registerVotingRoutes();
    const { db, state } = transactionalVoteDb({ failComment: true });

    const response = await handler('POST', path)(
      request({ choice: 'against', comment: 'Pipe replacement is premature' }),
      { DB: db },
      params,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Vote failed' });
    expect(db.batchCount).toBe(1);
    expect(state).toEqual({
      vote: null,
      participants: [],
      comments: [],
      reconsiderationStatus: 'none',
    });
  });

  it('commits no side effects when a concurrent revote wins the CAS', async () => {
    registerVotingRoutes();
    const { db, state } = transactionalVoteDb({
      existingVote: { id: 'vote-1', choice: 'against' },
      casLoses: true,
    });

    const response = await handler('POST', path)(
      request({ choice: 'for', comment: 'Changed after reviewing the estimate' }),
      { DB: db },
      params,
    );

    expect(response.status).toBe(409);
    expect(db.batchCount).toBe(1);
    expect(state).toEqual({
      vote: { id: 'vote-1', choice: 'against', voteHash: 'old-vote-hash' },
      participants: [],
      comments: [],
      reconsiderationStatus: 'pending',
    });
    const sideStatements = db.calls.filter((call) =>
      call.sql.includes('meeting_participated_voters')
      || call.sql.includes('meeting_agenda_comments')
      || call.sql.includes('meeting_vote_reconsideration_requests'),
    );
    expect(sideStatements).toHaveLength(3);
    for (const statement of sideStatements) {
      expect(statement.sql).toContain('vote_hash = ?');
      expect(statement.params).toContain('vote-hash');
      expect(statement.params).toContain('tenant-1');
    }
  });

  it('commits a first vote with participation and comment in one batch', async () => {
    registerVotingRoutes();
    const { db, state } = transactionalVoteDb();

    const response = await handler('POST', path)(
      request({ choice: 'against', comment: 'Use a lower-cost option', counter_proposal: 'Repair instead' }),
      { DB: db },
      params,
    );

    expect(response.status).toBe(200);
    expect(db.batchCount).toBe(1);
    expect(state.vote).toEqual({ id: 'generated-id', choice: 'against', voteHash: 'vote-hash' });
    expect(state.participants).toEqual(['user-1']);
    expect(state.comments).toHaveLength(1);
    expect(state.reconsiderationStatus).toBe('none');
  });

  it('commits a revote with participation, comment, and reconsideration in one batch', async () => {
    registerVotingRoutes();
    const { db, state } = transactionalVoteDb({ existingVote: { id: 'vote-1', choice: 'for' } });

    const response = await handler('POST', path)(
      request({ choice: 'against', comment: 'The revised amount is still too high' }),
      { DB: db },
      params,
    );

    expect(response.status).toBe(200);
    expect(db.batchCount).toBe(1);
    expect(state.vote).toEqual({ id: 'vote-1', choice: 'against', voteHash: 'vote-hash' });
    expect(state.participants).toEqual(['user-1']);
    expect(state.comments).toHaveLength(1);
    expect(state.reconsiderationStatus).toBe('vote_changed');
  });

  it('maps a first-vote uniqueness conflict to 409', async () => {
    registerVotingRoutes();
    const db = voteDb();
    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const statement = originalPrepare(sql);
      if (!sql.includes('INSERT INTO meeting_vote_records')) return statement;
      statement.run = async () => { throw new Error('UNIQUE constraint failed: meeting_vote_records.id'); };
      return statement;
    };

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: db }, params);

    expect(response.status).toBe(409);
  });

  it.each([
    ['GET', '/api/meetings/:meetingId/votes/me'],
    ['GET', '/api/meetings/:meetingId/stats'],
  ])('rejects tenant-less %s %s before feature access', async (method, routePath) => {
    registerVotingRoutes();
    mocks.tenantId = null;

    const response = await handler(method, routePath)(
      new Request('https://api.kamizo.uz/api/meetings/meeting-1'),
      { DB: createDb() },
      { meetingId: 'meeting-1' },
    );

    expect(response.status).toBe(403);
    expect(mocks.events).toEqual(['auth', 'tenant']);
  });

  it('tenant-scopes the personal vote read', async () => {
    registerVotingRoutes();
    const db = createDb(({ sql, method }) => method === 'first' && sql.includes('FROM meetings') ? { id: 'meeting-1' } : []);

    const response = await handler('GET', '/api/meetings/:meetingId/votes/me')(
      new Request('https://api.kamizo.uz/api/meetings/meeting-1/votes/me'),
      { DB: db },
      { meetingId: 'meeting-1' },
    );

    expect(response.status).toBe(200);
    const votes = db.calls.find((call) => call.method === 'all' && call.sql.includes('meeting_vote_records'));
    expect(votes?.sql).toContain('tenant_id = ?');
    expect(votes?.params).toEqual(['meeting-1', 'user-1', 'tenant-1']);
  });

  it('tenant-scopes every stats query and joined table', async () => {
    registerVotingRoutes();
    const db = createDb(({ sql, method }) => {
      if (method === 'first' && sql.includes('FROM meetings')) return { status: 'voting_open', total_area: 100 };
      if (method === 'first') return { voted_area: 0, count: 0 };
      return [];
    });

    const response = await handler('GET', '/api/meetings/:meetingId/stats')(
      new Request('https://api.kamizo.uz/api/meetings/meeting-1/stats'),
      { DB: db },
      { meetingId: 'meeting-1' },
    );

    expect(response.status).toBe(200);
    for (const call of db.calls) {
      expect(call.sql).toContain('tenant_id = ?');
      expect(call.params).toContain('tenant-1');
    }
    const agendaStats = db.calls.find((call) => call.sql.includes('FROM meeting_agenda_items ai'));
    expect(agendaStats?.sql).toContain('vr.tenant_id = ?');
    expect(agendaStats?.sql).toContain('ai.tenant_id = ?');
  });

  it('tenant-constrains reconsideration updates through the parent meeting', async () => {
    registerVotingRoutes();
    const db = voteDb({ existingVote: { id: 'vote-1', choice: 'against' } });

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: db }, params);

    expect(response.status).toBe(200);
    const reconsideration = db.calls.find((call) => call.sql.includes('UPDATE meeting_vote_reconsideration_requests'));
    expect(reconsideration?.sql).toContain('EXISTS');
    expect(reconsideration?.sql).toContain('m.tenant_id = ?');
    expect(reconsideration?.params.at(-1)).toBe('tenant-1');
  });

  it('authenticates voting mutations before feature access', async () => {
    registerVotingRoutes();
    mocks.user = null;

    const response = await handler('POST', path)(request({ choice: 'for' }), { DB: createDb() }, params);

    expect(response.status).toBe(401);
    expect(mocks.events).toEqual(['auth']);
  });

  it.each([
    ['malformed JSON', '{'],
    ['null body', 'null'],
    ['array body', '[]'],
    ['invalid choice type', JSON.stringify({ choice: 1 })],
    ['invalid comment type', JSON.stringify({ choice: 'for', comment: 1 })],
    ['invalid counter proposal type', JSON.stringify({ choice: 'against', counter_proposal: [] })],
    ['oversize comment', JSON.stringify({ choice: 'for', comment: 'x'.repeat(2001) })],
    ['oversize counter proposal', JSON.stringify({ choice: 'against', counter_proposal: 'x'.repeat(2001) })],
    ['unknown field', JSON.stringify({ choice: 'for', admin_override: true })],
  ])('rejects %s before any SQL', async (_name, rawBody) => {
    registerVotingRoutes();
    const db = createDb();
    const invalidRequest = new Request('https://api.kamizo.uz/api/meetings/meeting-1/agenda/agenda-1/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: rawBody,
    });
    let response: Response | undefined;
    try {
      response = await handler('POST', path)(invalidRequest, { DB: db }, params);
    } catch {
      // The pre-fix route throws for malformed bodies; the assertion below records RED.
    }

    expect(response?.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });
});

describe('meeting protocol route security', () => {
  const generatePath = '/api/meetings/:id/generate-protocol';
  const approvePath = '/api/meetings/:id/approve-protocol';
  const params = { id: 'meeting-1' };

  function postRequest(action: string) {
    return new Request(`https://api.kamizo.uz/api/meetings/meeting-1/${action}`, { method: 'POST' });
  }

  it('rejects generation by a disallowed role', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'resident';

    const response = await handler('POST', generatePath)(
      postRequest('generate-protocol'),
      { DB: protocolDb('voting_closed') },
      params,
    );

    expect(response.status).toBe(403);
  });

  it('rejects generation before voting closes', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';

    const response = await handler('POST', generatePath)(
      postRequest('generate-protocol'),
      { DB: protocolDb('voting_open', null) },
      params,
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for a missing or cross-tenant meeting before generation state checks', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';

    const response = await handler('POST', generatePath)(
      postRequest('generate-protocol'),
      { DB: createDb(() => null) },
      params,
    );

    expect(response.status).toBe(404);
  });

  it('never replaces an approved protocol', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const db = protocolDb('protocol_approved');

    const response = await handler('POST', generatePath)(
      postRequest('generate-protocol'),
      { DB: db },
      params,
    );

    expect(response.status).toBe(400);
    expect(db.calls.some((call) => call.sql.includes('DELETE FROM meeting_protocols'))).toBe(false);
  });

  it('transactionally replaces an old protocol without deleting it first', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const db = protocolDb('results_published');

    const response = await handler('POST', generatePath)(
      postRequest('generate-protocol'),
      { DB: db },
      params,
    );

    expect(response.status).toBe(201);
    const agendaIndex = db.calls.findIndex((call) => call.sql.includes('FROM meeting_agenda_items'));
    const voterIndex = db.calls.findIndex((call) => call.sql.includes('FROM meeting_vote_records'));
    const replaceIndex = db.calls.findIndex((call) => call.sql.includes('UPDATE meeting_protocols SET id = ?'));
    const casIndex = db.calls.findIndex((call) => call.sql.includes("UPDATE meetings SET status = 'protocol_generated'"));
    expect(replaceIndex).toBeGreaterThan(agendaIndex);
    expect(replaceIndex).toBeGreaterThan(voterIndex);
    expect(casIndex).toBeLessThan(replaceIndex);
    expect(db.calls[replaceIndex].sql).toContain('m.protocol_id = ?');
    expect(db.calls[replaceIndex].params).toContain('generated-id');
    expect(db.calls.some((call) => call.sql.includes('DELETE FROM meeting_protocols'))).toBe(false);
    const meetingUpdate = db.calls.find((call) => call.sql.includes("UPDATE meetings SET status = 'protocol_generated'"));
    expect(meetingUpdate?.sql).toContain('AND tenant_id = ?');
    expect(meetingUpdate?.params.slice(0, 3)).toEqual(['generated-id', 'meeting-1', 'tenant-1']);
    const finalRead = db.calls.find((call) => call.method === 'first' && call.sql.includes('FROM meeting_protocols'));
    expect(finalRead?.params).toEqual(['generated-id', 'tenant-1']);
  });

  it('rejects approval by a manager', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'manager';

    const response = await handler('POST', approvePath)(
      postRequest('approve-protocol'),
      { DB: protocolDb('protocol_generated') },
      params,
    );

    expect(response.status).toBe(403);
  });

  it('rejects approval outside protocol_generated', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';

    const response = await handler('POST', approvePath)(
      postRequest('approve-protocol'),
      { DB: protocolDb('results_published') },
      params,
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for a missing or cross-tenant meeting before approval state checks', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';

    const response = await handler('POST', approvePath)(
      postRequest('approve-protocol'),
      { DB: createDb(() => null) },
      params,
    );

    expect(response.status).toBe(404);
  });

  it('tenant-scopes protocol approval mutations and final read', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const db = protocolDb('protocol_generated');

    const response = await handler('POST', approvePath)(
      postRequest('approve-protocol'),
      { DB: db },
      params,
    );

    expect(response.status).toBe(200);
    const protocolUpdate = db.calls.find((call) => call.sql.includes('UPDATE meeting_protocols'));
    expect(protocolUpdate?.params.at(-1)).toBe('tenant-1');
    const meetingUpdate = db.calls.find((call) => call.sql.includes("UPDATE meetings SET status = 'protocol_approved'"));
    expect(meetingUpdate?.sql).toContain('AND tenant_id = ?');
    expect(meetingUpdate?.params.slice(0, 2)).toEqual(['meeting-1', 'tenant-1']);
    expect(db.calls.indexOf(meetingUpdate!)).toBeLessThan(db.calls.indexOf(protocolUpdate!));
    const finalRead = db.calls.find((call) => call.method === 'first' && call.sql.startsWith('SELECT * FROM meetings'));
    expect(finalRead?.params).toEqual(['meeting-1', 'tenant-1']);
  });

  it('returns 409 and preserves the old protocol when generation CAS loses', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const db = protocolDb('results_published');
    const state = { meetingProtocolId: 'winner-protocol', protocolIds: ['protocol-old', 'winner-protocol'] };
    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const statement = originalPrepare(sql);
      if (sql.includes("UPDATE meetings SET status = 'protocol_generated'")) {
        statement.run = async () => ({ success: true, meta: { changes: 0 } });
      } else if (sql.includes('UPDATE meeting_protocols SET id = ?')) {
        statement.run = async () => ({ success: true, meta: { changes: state.meetingProtocolId === 'generated-id' ? 1 : 0 } });
      }
      return statement;
    };

    const response = await handler('POST', generatePath)(postRequest('generate-protocol'), { DB: db }, params);

    expect(response.status).toBe(409);
    expect(state.meetingProtocolId).toBe('winner-protocol');
    expect(state.protocolIds).toEqual(['protocol-old', 'winner-protocol']);
    expect(db.calls.some((call) => call.sql.includes('DELETE FROM meeting_protocols'))).toBe(false);
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO meeting_protocols'))).toBe(false);
  });

  it('returns 409 when concurrent approval loses the status CAS', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const db = protocolDb('protocol_generated');
    const state = { status: 'protocol_generated', signedBy: null as string | null };
    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const statement = originalPrepare(sql);
      if (sql.includes("UPDATE meetings SET status = 'protocol_approved'")) {
        statement.run = async () => {
          state.status = 'protocol_approved';
          state.signedBy = 'winning-director';
          return { success: true, meta: { changes: 0 } };
        };
      } else if (sql.includes('UPDATE meeting_protocols')) {
        statement.run = async () => ({ success: true, meta: { changes: state.signedBy === null ? 1 : 0 } });
      }
      return statement;
    };

    const response = await handler('POST', approvePath)(postRequest('approve-protocol'), { DB: db }, params);

    expect(response.status).toBe(409);
    expect(state.status).toBe('protocol_approved');
    expect(state.signedBy).toBe('winning-director');
  });

  it.each([
    ['GET', '/api/meetings/:meetingId/protocol'],
    ['GET', '/api/meetings/:meetingId/protocol/data'],
  ])('rejects tenant-less %s %s before feature access', async (method, routePath) => {
    registerProtocolRoutes();
    mocks.tenantId = null;

    const response = await handler(method, routePath)(
      new Request('https://api.kamizo.uz/api/meetings/meeting-1/protocol'),
      { DB: createDb() },
      { meetingId: 'meeting-1' },
    );

    expect(response.status).toBe(403);
    expect(mocks.events).toEqual(['auth', 'tenant']);
  });

  it('tenant-scopes protocol GET and every protocol-data child query and join', async () => {
    registerProtocolRoutes();
    const db = createDb(({ sql, method }) => {
      if (method === 'first' && sql.includes('FROM meetings')) return { id: 'meeting-1', protocol_id: 'protocol-1', total_area: 100 };
      if (method === 'first' && sql.includes('FROM meeting_protocols')) return { id: 'protocol-1', protocol_hash: 'hash' };
      return [];
    });

    const getResponse = await handler('GET', '/api/meetings/:meetingId/protocol')(
      new Request('https://api.kamizo.uz/api/meetings/meeting-1/protocol'), { DB: db }, { meetingId: 'meeting-1' },
    );
    const dataResponse = await handler('GET', '/api/meetings/:meetingId/protocol/data')(
      new Request('https://api.kamizo.uz/api/meetings/meeting-1/protocol/data'), { DB: db }, { meetingId: 'meeting-1' },
    );

    expect(getResponse.status).toBe(200);
    expect(dataResponse.status).toBe(200);
    for (const call of db.calls) {
      expect(call.sql).toContain('tenant_id = ?');
      expect(call.params).toContain('tenant-1');
    }
    const joinedVotes = db.calls.filter((call) => call.sql.includes('LEFT JOIN users'));
    expect(joinedVotes.length).toBeGreaterThan(0);
    for (const call of joinedVotes) expect(call.sql).toContain('u.tenant_id = ?');
    const comments = db.calls.find((call) => call.sql.includes('LEFT JOIN meeting_agenda_comments'));
    expect(comments?.sql).toContain('c.tenant_id = ?');
  });

  it.each([
    ['POST', '/api/meetings/:id/generate-protocol', { id: 'meeting-1' }],
    ['POST', '/api/meetings/:id/approve-protocol', { id: 'meeting-1' }],
  ])('authenticates %s %s before feature access', async (method, routePath, routeParams) => {
    registerProtocolRoutes();
    mocks.user = null;

    const response = await handler(method, routePath)(postRequest('protocol'), { DB: createDb() }, routeParams);

    expect(response.status).toBe(401);
    expect(mocks.events).toEqual(['auth']);
  });

  it('logs protocol SQL errors but returns a generic 500 response', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const db = createDb(() => { throw new Error('secret SQL and tenant details'); });

    const response = await handler('POST', generatePath)(postRequest('generate-protocol'), { DB: db }, params);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('Protocol generation failed');
    expect(body.error).not.toContain('secret SQL');
  });

  it('rolls back generation CAS state when the protocol replacement statement fails', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const state = { status: 'results_published', protocolId: 'protocol-old' };
    const initial = { ...state };
    const db = createDb(({ sql, method }) => {
      if (method === 'first' && sql.includes('FROM meetings')) {
        return {
          number: 7, status: state.status, protocol_id: state.protocolId,
          building_address: '12 Test Street', format: 'online', organizer_name: 'Kamizo',
          total_area: 100, voted_area: 60, participated_count: 2,
          participation_percent: 60, quorum_reached: 1,
        };
      }
      if (method === 'all') return [];
      if (method === 'run' && sql.includes("UPDATE meetings SET status = 'protocol_generated'")) {
        state.status = 'protocol_generated';
        state.protocolId = 'generated-id';
        return { success: true, meta: { changes: 1 } };
      }
      if (method === 'run' && sql.includes('UPDATE meeting_protocols SET id = ?')) throw new Error('replacement failed');
      return null;
    }, {
      snapshot: () => ({ ...state }),
      restore: (snapshot) => Object.assign(state, snapshot),
    });

    const response = await handler('POST', generatePath)(postRequest('generate-protocol'), { DB: db }, params);

    expect(response.status).toBe(500);
    expect(state).toEqual(initial);
  });

  it('rolls back approval CAS state when the signature statement fails', async () => {
    registerProtocolRoutes();
    mocks.user.role = 'admin';
    const state = { status: 'protocol_generated', signedBy: null as string | null };
    const initial = { ...state };
    const db = createDb(({ sql, method }) => {
      if (method === 'first' && sql.includes('FROM meetings')) return { status: state.status, protocol_id: 'protocol-old' };
      if (method === 'run' && sql.includes("UPDATE meetings SET status = 'protocol_approved'")) {
        state.status = 'protocol_approved';
        return { success: true, meta: { changes: 1 } };
      }
      if (method === 'run' && sql.includes('UPDATE meeting_protocols')) throw new Error('signature failed');
      return null;
    }, {
      snapshot: () => ({ ...state }),
      restore: (snapshot) => Object.assign(state, snapshot),
    });

    const response = await handler('POST', approvePath)(postRequest('approve-protocol'), { DB: db }, params);

    expect(response.status).toBe(500);
    expect(state).toEqual(initial);
  });
});
