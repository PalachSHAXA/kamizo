const MEETING_VOTER_ROLES = new Set(['resident', 'commercial_owner']);
const PROTOCOL_GENERATOR_ROLES = new Set(['admin', 'director', 'manager']);
const PROTOCOL_GENERATION_STATES = new Set(['voting_closed', 'results_published']);
const PROTOCOL_APPROVER_ROLES = new Set(['admin', 'director']);
const VOTE_BODY_FIELDS = new Set([
  'choice', 'comment', 'counter_proposal', 'counterProposal',
  'voterId', 'voterName', 'voter_id', 'voter_name',
  'apartmentId', 'apartmentNumber', 'apartment_id', 'apartment_number',
  'ownershipShare', 'ownership_share',
  'verificationMethod', 'verification_method', 'otpVerified', 'otp_verified',
]);
const MAX_VOTE_TEXT_LENGTH = 2000;

export type MeetingVoteBody = {
  choice: 'for' | 'against' | 'abstain';
  comment?: string;
  counterProposal?: string;
};

export function hasMeetingTenantContext(tenantId: string | null): tenantId is string {
  return Boolean(tenantId && tenantId !== '__no_tenant__');
}

export function isMeetingVoterRole(role: string): boolean {
  return MEETING_VOTER_ROLES.has(role);
}

export function parseVoteChoice(value: unknown): 'for' | 'against' | 'abstain' | null {
  switch (value) {
    case 'for':
    case 'against':
    case 'abstain':
      return value;
    default:
      return null;
  }
}

export function canGenerateProtocol(role: string, status: string): boolean {
  return isProtocolGeneratorRole(role) && PROTOCOL_GENERATION_STATES.has(status);
}

export function canApproveProtocol(role: string, status: string): boolean {
  return isProtocolApproverRole(role) && status === 'protocol_generated';
}

export function isProtocolGeneratorRole(role: string): boolean {
  return PROTOCOL_GENERATOR_ROLES.has(role);
}

export function isProtocolApproverRole(role: string): boolean {
  return PROTOCOL_APPROVER_ROLES.has(role);
}

export async function readMeetingVoteBody(request: Request): Promise<MeetingVoteBody | null> {
  try {
    const value = await request.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;

    const body = value as Record<string, unknown>;
    if (!Object.keys(body).every((key) => VOTE_BODY_FIELDS.has(key))) return null;
    const choice = parseVoteChoice(body.choice);
    if (!choice) return null;
    if (!isOptionalVoteText(body.comment) || !isOptionalVoteText(body.counter_proposal) || !isOptionalVoteText(body.counterProposal)) return null;

    const counterProposal = body.counter_proposal ?? body.counterProposal;
    return {
      choice,
      comment: typeof body.comment === 'string' ? body.comment.trim() : undefined,
      counterProposal: typeof counterProposal === 'string' ? counterProposal.trim() : undefined,
    };
  } catch {
    return null;
  }
}

function isOptionalVoteText(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= MAX_VOTE_TEXT_LENGTH);
}
