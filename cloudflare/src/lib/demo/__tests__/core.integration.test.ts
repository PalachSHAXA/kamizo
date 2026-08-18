import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

import { provisionDemoCore } from '../core';
import { demoId } from '../ids';

const productionSchema = readFileSync(new URL('./fixtures/demo-production-schema.sql', import.meta.url), 'utf8');

function quote(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindSql(sql: string, params: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => quote(params[index++]));
}

function sqliteJson(dbPath: string, sql: string): any[] {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) : [];
}

function createDb(dbPath: string, sqlLog: string[] = []): D1Database {
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { params = values; return statement; },
      async first() {
        const bound = bindSql(sql, params); sqlLog.push(bound);
        return sqliteJson(dbPath, bound)[0] ?? null;
      },
      async all() {
        const bound = bindSql(sql, params); sqlLog.push(bound);
        return { results: sqliteJson(dbPath, bound), success: true, meta: {} };
      },
      async run() {
        const bound = bindSql(sql, params); sqlLog.push(bound);
        const rows = sqliteJson(dbPath, `${bound}; SELECT changes() AS changes;`);
        return { success: true, meta: { changes: Number(rows.at(-1)?.changes ?? 0) } };
      },
    };
    return statement;
  };
  return {
    prepare,
    async batch(statements: any[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
}

function run(dbPath: string, sql: string): void {
  execFileSync('sqlite3', [dbPath], { input: sql });
}

function rows(dbPath: string, sql: string): any[] {
  return sqliteJson(dbPath, sql);
}

function explain(dbPath: string, sql: string): string {
  return execFileSync('sqlite3', [dbPath, `EXPLAIN ${sql}`], { encoding: 'utf8' }).trim();
}

describe('provisionDemoCore SQLite integration', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kamizo-demo-core-'));
    dbPath = join(directory, 'fixture.db');
    run(dbPath, productionSchema + `
      INSERT INTO tenants (id,name,slug,url,plan,features,is_active,is_demo)
      VALUES ('tenant-demo','Kamizo Demo','demo','https://demo.kamizo.uz','enterprise','["requests"]',1,0),
             ('tenant-other','Other','other','https://other.kamizo.uz','basic','["requests"]',1,0);
      INSERT INTO users (id,login,password_hash,name,role,is_active,tenant_id,apartment,total_area)
      VALUES ('director-existing','demo-director','director-original-hash','Existing Director','director',1,'tenant-demo',NULL,NULL),
             ('admin-existing','demo-director-admin','admin-original-hash','Existing Admin','admin',1,'tenant-demo',NULL,NULL),
             ('resident-primary','98765432','resident-original-hash','Primary Resident','resident',1,'tenant-demo','49',49),
             ('resident-unrelated','98765417','secondary-original-hash','Unrelated Resident','resident',1,'tenant-demo','17',17),
             ('other-manager','demo-manager','other-original-hash','Other Manager','manager',1,'tenant-other',NULL,NULL);
      INSERT INTO buildings (id,name,address,tenant_id) VALUES ('other-building','Other Building','Other Address','tenant-other');
    `);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('is restartable, preserves passwords and keeps every relationship tenant-valid', async () => {
    const sqlLog: string[] = [];
    const db = createDb(dbPath, sqlLog);
    const context = {
      db,
      tenantId: 'tenant-demo',
      tenantSlug: 'demo' as const,
      now: new Date('2026-08-16T12:00:00.000Z'),
      createPasswordHash: async () => 'new-inaccessible-hash',
    };

    const first = await provisionDemoCore(context);
    const meetingMutations = sqlLog.filter((sql) => /INSERT INTO meeting_(eligible|participated|vote|protocol)/.test(sql));
    expect(meetingMutations.length).toBeGreaterThanOrEqual(4);
    for (const sql of meetingMutations) expect(explain(dbPath, sql)).toContain('Init');
    expect(rows(dbPath, `SELECT status FROM requests WHERE tenant_id='tenant-demo' ORDER BY status`).map((row) => row.status)).toEqual([
      'accepted', 'assigned', 'cancelled', 'completed', 'in_progress', 'new', 'pending_approval',
    ]);
    expect(rows(dbPath, `SELECT name,total_area,residential_area FROM buildings WHERE tenant_id='tenant-demo' ORDER BY name`)).toEqual([
      { name: 'ЖК Caravan City', total_area: 10840, residential_area: 10840 },
      { name: 'ЖК Mirzo Residence', total_area: 8760, residential_area: 8760 },
    ]);
    expect(rows(dbPath, `
      SELECT number,total_area,voted_area,total_eligible_count,participated_count,quorum_reached,participation_percent
      FROM meetings WHERE tenant_id='tenant-demo' ORDER BY number
    `)).toEqual([
      { number: 1, total_area: 10840, voted_area: 4878, total_eligible_count: 168, participated_count: 76, quorum_reached: 0, participation_percent: 45 },
      { number: 2, total_area: 10840, voted_area: 7588, total_eligible_count: 168, participated_count: 118, quorum_reached: 1, participation_percent: 70 },
    ]);
    expect(rows(dbPath, `
      SELECT m.number,a.item_order,a.votes_for_area,a.votes_against_area,a.votes_abstain_area
      FROM meeting_agenda_items a JOIN meetings m ON m.id=a.meeting_id AND m.tenant_id=a.tenant_id
      WHERE a.tenant_id='tenant-demo' ORDER BY m.number,a.item_order
    `)).toEqual([
      { number: 1, item_order: 1, votes_for_area: 3400, votes_against_area: 1000, votes_abstain_area: 478 },
      { number: 1, item_order: 2, votes_for_area: 2200, votes_against_area: 2200, votes_abstain_area: 478 },
      { number: 2, item_order: 1, votes_for_area: 6000, votes_against_area: 1100, votes_abstain_area: 488 },
      { number: 2, item_order: 2, votes_for_area: 5200, votes_against_area: 1800, votes_abstain_area: 588 },
    ]);
    const countsAfterFirst = rows(dbPath, `
      SELECT 'users' entity, COUNT(*) count FROM users WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'buildings',COUNT(*) FROM buildings WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'entrances',COUNT(*) FROM entrances WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'apartments',COUNT(*) FROM apartments WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'categories',COUNT(*) FROM categories WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'requests',COUNT(*) FROM requests WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'meetings',COUNT(*) FROM meetings WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'announcements',COUNT(*) FROM announcements WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'chat_channels',COUNT(*) FROM chat_channels WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'chat_messages',COUNT(*) FROM chat_messages WHERE tenant_id='tenant-demo'
    `);
    const requestId = await demoId('tenant-demo', 'request:completed');
    const meetingId = await demoId('tenant-demo', 'meeting:active');
    const agendaId = await demoId('tenant-demo', 'agenda:0:yard');
    const eligibleId = await demoId('tenant-demo', 'eligible:0:resident-primary');
    const participationId = await demoId('tenant-demo', 'participated:0:resident-primary');
    const voteId = await demoId('tenant-demo', 'vote:0:0:resident-primary');
    const protocolId = await demoId('tenant-demo', 'meeting:historical:protocol');
    const announcementId = await demoId('tenant-demo', 'announcement:residents');
    const channelId = await demoId('tenant-demo', 'chat:building-general');
    const messageId = await demoId('tenant-demo', 'chat-message:0:0');
    const historicalMeetingId = await demoId('tenant-demo', 'meeting:historical');
    const historicalAgendaId = await demoId('tenant-demo', 'agenda:1:budget');
    run(dbPath, `
      UPDATE requests SET status='in_progress',priority='urgent',executor_id=NULL,rating=2,feedback='resident changed',updated_at='2099-01-01' WHERE id='${requestId}' AND tenant_id='tenant-demo';
      UPDATE meetings SET status='voting_closed',total_area=108,voted_area=6504,total_eligible_count=170,participated_count=101,quorum_reached=1,participation_percent=60,updated_at='2099-01-02' WHERE id='${meetingId}' AND tenant_id='tenant-demo';
      UPDATE meeting_agenda_items SET is_approved=1,votes_for_area=4000,votes_against_area=2000,votes_abstain_area=504 WHERE id='${agendaId}' AND tenant_id='tenant-demo';
      UPDATE meetings SET total_area=108,voted_area=66,total_eligible_count=2,participated_count=2,quorum_reached=1,participation_percent=61.11 WHERE id='${historicalMeetingId}' AND tenant_id='tenant-demo';
      UPDATE meeting_agenda_items SET votes_for_area=66,votes_against_area=0,votes_abstain_area=0 WHERE id='${historicalAgendaId}' AND tenant_id='tenant-demo';
      UPDATE meeting_eligible_voters SET has_voted=1 WHERE id='${eligibleId}' AND tenant_id='tenant-demo';
      UPDATE meeting_participated_voters SET participation_type='in_person',participated_at='2099-01-03' WHERE id='${participationId}' AND tenant_id='tenant-demo';
      UPDATE meeting_vote_records SET vote='abstain',choice='abstain',vote_weight=55,voted_at='2099-01-04',changed_after_reconsideration=1 WHERE id='${voteId}' AND tenant_id='tenant-demo';
      UPDATE meeting_protocols SET content='signed custom protocol',signed_by_uk_name='Changed Signer',signed_by_uk_at='2099-01-05' WHERE id='${protocolId}' AND tenant_id='tenant-demo';
      UPDATE announcements SET is_active=0,priority='urgent',expires_at='2099-01-06',updated_at='2099-01-06' WHERE id='${announcementId}' AND tenant_id='tenant-demo';
      UPDATE chat_channels SET assigned_to='security-demo',resolved_at='2099-01-07',resolved_by='security-demo',updated_at='2099-01-07' WHERE id='${channelId}' AND tenant_id='tenant-demo';
      UPDATE chat_messages SET content='moderated custom message',created_at='2099-01-08' WHERE id='${messageId}' AND tenant_id='tenant-demo';
    `);

    const second = await provisionDemoCore(context);
    const countsAfterSecond = rows(dbPath, `
      SELECT 'users' entity, COUNT(*) count FROM users WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'buildings',COUNT(*) FROM buildings WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'entrances',COUNT(*) FROM entrances WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'apartments',COUNT(*) FROM apartments WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'categories',COUNT(*) FROM categories WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'requests',COUNT(*) FROM requests WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'meetings',COUNT(*) FROM meetings WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'announcements',COUNT(*) FROM announcements WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'chat_channels',COUNT(*) FROM chat_channels WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'chat_messages',COUNT(*) FROM chat_messages WHERE tenant_id='tenant-demo'
    `);

    expect(first.counters).toMatchObject({
      users: { created: 11 }, buildings: { created: 2 }, entrances: { created: 2 },
      apartments: { created: 6 }, categories: { created: 4 }, requests: { created: 7 },
      meetings: { created: 2 }, agendaItems: { created: 4 }, eligibleVoters: { created: 4 },
      participatedVoters: { created: 3 }, votes: { created: 6 }, protocols: { created: 1 },
      announcements: { created: 3 }, chatChannels: { created: 2 }, chatMessages: { created: 6 },
    });
    expect(Object.values(second.counters).every((counter) => counter.created === 0)).toBe(true);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
    expect(rows(dbPath, `SELECT status,priority,executor_id,rating,feedback,updated_at FROM requests WHERE id='${requestId}'`)).toEqual([
      { status: 'in_progress', priority: 'urgent', executor_id: null, rating: 2, feedback: 'resident changed', updated_at: '2099-01-01' },
    ]);
    expect(rows(dbPath, `SELECT status,total_area,voted_area,total_eligible_count,participated_count,quorum_reached,participation_percent,updated_at FROM meetings WHERE id='${meetingId}'`)).toEqual([
      { status: 'voting_closed', total_area: 10840, voted_area: 6504, total_eligible_count: 170, participated_count: 101, quorum_reached: 1, participation_percent: 60, updated_at: '2099-01-02' },
    ]);
    expect(rows(dbPath, `SELECT is_approved,votes_for_area,votes_against_area,votes_abstain_area FROM meeting_agenda_items WHERE id='${agendaId}'`)).toEqual([
      { is_approved: 1, votes_for_area: 4000, votes_against_area: 2000, votes_abstain_area: 504 },
    ]);
    expect(rows(dbPath, `SELECT total_area,voted_area,total_eligible_count,participated_count,quorum_reached,participation_percent FROM meetings WHERE id='${historicalMeetingId}'`)).toEqual([
      { total_area: 10840, voted_area: 7588, total_eligible_count: 168, participated_count: 118, quorum_reached: 1, participation_percent: 70 },
    ]);
    expect(rows(dbPath, `SELECT votes_for_area,votes_against_area,votes_abstain_area FROM meeting_agenda_items WHERE id='${historicalAgendaId}'`)).toEqual([
      { votes_for_area: 6000, votes_against_area: 1100, votes_abstain_area: 488 },
    ]);
    expect(rows(dbPath, `SELECT has_voted FROM meeting_eligible_voters WHERE id='${eligibleId}'`)).toEqual([{ has_voted: 1 }]);
    expect(rows(dbPath, `SELECT participation_type,participated_at FROM meeting_participated_voters WHERE id='${participationId}'`)).toEqual([
      { participation_type: 'in_person', participated_at: '2099-01-03' },
    ]);
    expect(rows(dbPath, `SELECT vote,choice,vote_weight,voted_at,changed_after_reconsideration FROM meeting_vote_records WHERE id='${voteId}'`)).toEqual([
      { vote: 'abstain', choice: 'abstain', vote_weight: 55, voted_at: '2099-01-04', changed_after_reconsideration: 1 },
    ]);
    expect(rows(dbPath, `SELECT content,signed_by_uk_name,signed_by_uk_at FROM meeting_protocols WHERE id='${protocolId}'`)).toEqual([
      { content: 'signed custom protocol', signed_by_uk_name: 'Changed Signer', signed_by_uk_at: '2099-01-05' },
    ]);
    expect(rows(dbPath, `SELECT is_active,priority,expires_at,updated_at FROM announcements WHERE id='${announcementId}'`)).toEqual([
      { is_active: 0, priority: 'urgent', expires_at: '2099-01-06', updated_at: '2099-01-06' },
    ]);
    expect(rows(dbPath, `SELECT assigned_to,resolved_at,resolved_by,updated_at FROM chat_channels WHERE id='${channelId}'`)).toEqual([
      { assigned_to: 'security-demo', resolved_at: '2099-01-07', resolved_by: 'security-demo', updated_at: '2099-01-07' },
    ]);
    expect(rows(dbPath, `SELECT content,created_at FROM chat_messages WHERE id='${messageId}'`)).toEqual([
      { content: 'moderated custom message', created_at: '2099-01-08' },
    ]);

    expect(rows(dbPath, `SELECT login,password_hash FROM users WHERE id IN ('director-existing','admin-existing','resident-primary') ORDER BY login`)).toEqual([
      { login: '98765432', password_hash: 'resident-original-hash' },
      { login: 'demo-director', password_hash: 'director-original-hash' },
      { login: 'demo-director-admin', password_hash: 'admin-original-hash' },
    ]);
    expect(rows(dbPath, `SELECT name,password_hash,building_id FROM users WHERE id='other-manager'`)).toEqual([
      { name: 'Other Manager', password_hash: 'other-original-hash', building_id: null },
    ]);
    const demoTenant = rows(dbPath, `SELECT name,is_demo,plan,features FROM tenants WHERE id='tenant-demo'`)[0];
    expect(demoTenant).toMatchObject({ name: 'Kamizo Demo', is_demo: 1, plan: 'enterprise' });
    expect(JSON.parse(demoTenant.features)).toEqual(expect.arrayContaining(['trainings', 'colleagues', 'notepad']));

    const linkedResidents = rows(dbPath, `
      SELECT u.login,u.building_id,u.total_area,a.total_area apartment_area
      FROM users u JOIN apartments a ON a.primary_owner_id=u.id AND a.tenant_id=u.tenant_id
      WHERE u.tenant_id='tenant-demo' AND u.login IN ('98765432','demo-resident-2') ORDER BY u.login
    `);
    expect(linkedResidents).toHaveLength(2);
    expect(linkedResidents.every((row) => row.building_id && row.total_area === row.apartment_area)).toBe(true);
    expect(rows(dbPath, `SELECT name,password_hash,building_id,apartment,total_area FROM users WHERE id='resident-unrelated'`)).toEqual([
      { name: 'Unrelated Resident', password_hash: 'secondary-original-hash', building_id: null, apartment: '17', total_area: 17 },
    ]);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM apartments
      WHERE tenant_id='tenant-demo' AND property_type='non_commercial'
        AND is_commercial=0 AND is_basement=0 AND is_parking=0 AND ownership_type='private'
    `)[0].count).toBe(6);

    expect(rows(dbPath, `SELECT type FROM announcements WHERE tenant_id='tenant-demo' ORDER BY type`).map((row) => row.type)).toEqual(['all', 'employees', 'residents']);
    expect(rows(dbPath, `SELECT type FROM chat_channels WHERE tenant_id='tenant-demo' ORDER BY type`).map((row) => row.type)).toEqual(['building_general', 'private_support']);
    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM requests r
      LEFT JOIN users u ON u.id=r.resident_id AND u.tenant_id=r.tenant_id
      LEFT JOIN categories c ON c.id=r.category_id AND c.tenant_id=r.tenant_id
      WHERE r.tenant_id='tenant-demo' AND (u.id IS NULL OR c.id IS NULL)
    `)[0].orphan_count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM meeting_vote_records v
      LEFT JOIN meetings m ON m.id=v.meeting_id AND m.tenant_id=v.tenant_id
      LEFT JOIN meeting_agenda_items a ON a.id=v.agenda_item_id AND a.meeting_id=v.meeting_id AND a.tenant_id=v.tenant_id
      LEFT JOIN users u ON u.id=v.voter_id AND u.tenant_id=v.tenant_id
      WHERE v.tenant_id='tenant-demo' AND (m.id IS NULL OR a.id IS NULL OR u.id IS NULL)
    `)[0].orphan_count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) orphan_count FROM chat_messages m
      LEFT JOIN chat_channels c ON c.id=m.channel_id AND c.tenant_id=m.tenant_id
      LEFT JOIN users u ON u.id=m.sender_id AND u.tenant_id=m.tenant_id
      WHERE m.tenant_id='tenant-demo' AND (c.id IS NULL OR u.id IS NULL)
    `)[0].orphan_count).toBe(0);

    expect(rows(dbPath, `SELECT COUNT(*) count FROM requests r LEFT JOIN users u ON u.id=r.resident_id AND u.tenant_id=r.tenant_id LEFT JOIN buildings b ON b.id=u.building_id AND b.tenant_id=r.tenant_id WHERE r.tenant_id='tenant-demo'`)[0].count).toBe(7);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM meetings m JOIN meeting_agenda_items a ON a.meeting_id=m.id AND a.tenant_id=m.tenant_id WHERE m.tenant_id='tenant-demo'`)[0].count).toBe(4);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM chat_channels c JOIN chat_messages m ON m.channel_id=c.id AND m.tenant_id=c.tenant_id WHERE c.tenant_id='tenant-demo'`)[0].count).toBe(6);
  }, 60_000);

  it('rejects a target-tenant secondary login with the wrong role without overwriting it', async () => {
    run(dbPath, `
      INSERT INTO users (id,login,password_hash,name,role,is_active,tenant_id)
      VALUES ('conflicting-secondary','demo-resident-2','conflict-hash','Conflict Admin','admin',1,'tenant-demo');
    `);

    await expect(provisionDemoCore({
      db: createDb(dbPath), tenantId: 'tenant-demo', tenantSlug: 'demo',
      now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'new-hash',
    })).rejects.toThrow('secondary resident conflict');
    expect(rows(dbPath, `SELECT name,role,password_hash FROM users WHERE id='conflicting-secondary'`)).toEqual([
      { name: 'Conflict Admin', role: 'admin', password_hash: 'conflict-hash' },
    ]);
  }, 60_000);

  it('rejects a deterministic secondary ID owned by another tenant', async () => {
    const actorId = await demoId('tenant-demo', 'actor:resident-secondary');
    run(dbPath, `
      INSERT INTO users (id,login,password_hash,name,role,is_active,tenant_id)
      VALUES ('${actorId}','foreign-secondary','foreign-hash','Foreign Resident','resident',1,'tenant-other');
    `);

    await expect(provisionDemoCore({
      db: createDb(dbPath), tenantId: 'tenant-demo', tenantSlug: 'demo',
      now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'new-hash',
    })).rejects.toThrow('secondary resident conflict');
    expect(rows(dbPath, `SELECT login,password_hash,tenant_id FROM users WHERE id='${actorId}'`)).toEqual([
      { login: 'foreign-secondary', password_hash: 'foreign-hash', tenant_id: 'tenant-other' },
    ]);
  }, 60_000);
});
