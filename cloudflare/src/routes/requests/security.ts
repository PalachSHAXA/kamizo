const REQUEST_ASSIGNMENT_ROLES = new Set([
  'admin',
  'director',
  'manager',
  'dispatcher',
  'department_head',
]);

const REQUEST_OWNER_ROLES = new Set(['resident', 'tenant', 'commercial_owner']);
const OWNER_CANCELLATION_STATUSES = new Set(['new', 'assigned', 'accepted']);
const RATEABLE_REQUEST_STATUSES = new Set(['pending_approval', 'completed']);

export function canAssignRequests(role: string): boolean {
  return REQUEST_ASSIGNMENT_ROLES.has(role);
}

export function hasForbiddenWorkflowFields(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, 'status')
    || Object.prototype.hasOwnProperty.call(body, 'executor_id');
}

export function isRequestOwnerRole(role: string): boolean {
  return REQUEST_OWNER_ROLES.has(role);
}

export function canManagementCancel(role: string): boolean {
  return REQUEST_ASSIGNMENT_ROLES.has(role);
}

export function canOwnerCancel(status: string): boolean {
  return OWNER_CANCELLATION_STATUSES.has(status);
}

export function canRateOwnedRequest(status: string): boolean {
  return RATEABLE_REQUEST_STATUSES.has(status);
}

export function isValidRequestRating(rating: unknown): rating is number {
  return typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

export function hasTenantContext(tenantId: string | null): tenantId is string {
  return Boolean(tenantId && tenantId !== '__no_tenant__');
}

export async function readPlainJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    if (Object.getPrototypeOf(body) !== Object.prototype) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function hasOnlyFields(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

export function isValidOptionalText(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}
