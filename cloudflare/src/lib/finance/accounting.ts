export type BreakdownItem = {
  name: string;
  amount: number;
  legal_code?: string | null;
};

export function amountToCents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) return null;
  const cents = Math.round(value * 100);
  return Math.abs(value - cents / 100) < 1e-9 ? cents : null;
}

export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export async function derivePaymentId(tenantId: string, idempotencyKey: string): Promise<string> {
  const input = new TextEncoder().encode(`${tenantId}\0${idempotencyKey}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return `fp:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function financeChargeId(tenantId: string, estimateId: string, period: string, apartmentId: string): string {
  return `fc:${tenantId}:${estimateId}:${period}:${apartmentId}`;
}

export function enterpriseIncomeId(tenantId: string, estimateId: string, period: string): string {
  return `fi:${tenantId}:${estimateId}:${period}:profit`;
}

export function allocateEstimateItemShares(
  items: Array<Record<string, unknown>>,
  buildingId: string,
  chargeAmount: number,
): Array<{ name: unknown; share: number }> {
  const chargeCents = amountToCents(chargeAmount);
  if (chargeCents === null || chargeCents === 0) return [];

  const eligible = items.flatMap((item, index) => {
    if ((item.kind || 'expense') !== 'expense') return [];
    if (item.building_id && item.building_id !== buildingId) return [];
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const weight = Math.round(amount * 100);
    return weight > 0 ? [{ index, name: item.name, weight: BigInt(weight) }] : [];
  });
  if (eligible.length === 0) return [];

  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0n);
  const target = BigInt(chargeCents);
  const allocated = eligible.map(item => {
    const numerator = target * item.weight;
    return { ...item, cents: numerator / totalWeight, remainder: numerator % totalWeight };
  });
  let centsLeft = target - allocated.reduce((sum, item) => sum + item.cents, 0n);
  for (const item of [...allocated].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1
  )) {
    if (centsLeft === 0n) break;
    item.cents += 1n;
    centsLeft -= 1n;
  }

  return allocated.map(item => ({ name: item.name, share: centsToAmount(Number(item.cents)) }));
}

export function affectedAllocationSql(apartmentCount: number): string {
  if (!Number.isInteger(apartmentCount) || apartmentCount < 1 || apartmentCount > 99) {
    throw new Error('affected apartment count must be between 1 and 99');
  }
  const placeholders = Array(apartmentCount).fill('?').join(',');
  return `WITH ordered_charges AS (
    SELECT id, apartment_id, CAST(ROUND(amount * 100, 0) AS INTEGER) AS amount_cents,
      COALESCE(SUM(CAST(ROUND(amount * 100, 0) AS INTEGER)) OVER (
        PARTITION BY apartment_id
        ORDER BY period ASC, created_at ASC, id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS charged_before
    FROM finance_charges
    WHERE tenant_id = ? AND apartment_id IN (${placeholders})
  ), receipt_totals AS (
    SELECT apartment_id, COALESCE(SUM(CAST(ROUND(amount * 100, 0) AS INTEGER)), 0) AS received_cents
    FROM finance_payments
    WHERE tenant_id = ? AND apartment_id IN (${placeholders}) AND payment_type != 'overpayment'
    GROUP BY apartment_id
  ), allocation AS (
    SELECT c.id, c.amount_cents,
      MAX(0, MIN(c.amount_cents, COALESCE(r.received_cents, 0) - c.charged_before)) AS allocated_cents
    FROM ordered_charges c
    LEFT JOIN receipt_totals r ON r.apartment_id = c.apartment_id
  )
  UPDATE finance_charges
  SET paid_amount = ROUND(COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id = finance_charges.id), 0) / 100.0, 2),
      status = CASE
        WHEN COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id = finance_charges.id), 0) >= CAST(ROUND(amount * 100, 0) AS INTEGER) THEN 'paid'
        WHEN COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id = finance_charges.id), 0) > 0 THEN 'partial'
        ELSE 'pending'
      END
  WHERE tenant_id = ? AND apartment_id IN (${placeholders})
    AND id IN (SELECT id FROM allocation)`;
}

export function affectedAllocationBindings(tenantId: string, apartmentIds: string[]): string[] {
  return [tenantId, ...apartmentIds, tenantId, ...apartmentIds, tenantId, ...apartmentIds];
}

export function allocationRecomputeSql(): string {
  return `WITH ordered_charges AS (
    SELECT id, CAST(ROUND(amount * 100, 0) AS INTEGER) AS amount_cents,
      COALESCE(SUM(CAST(ROUND(amount * 100, 0) AS INTEGER)) OVER (
        ORDER BY period ASC, created_at ASC, id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS charged_before
    FROM finance_charges
    WHERE tenant_id = ? AND apartment_id = ?
  ), receipt_total AS (
    SELECT COALESCE(SUM(CAST(ROUND(amount * 100, 0) AS INTEGER)), 0) AS received_cents
    FROM finance_payments
    WHERE tenant_id = ? AND apartment_id = ? AND payment_type != 'overpayment'
  ), allocation AS (
    SELECT id, amount_cents,
      MAX(0, MIN(amount_cents, received_cents - charged_before)) AS allocated_cents
    FROM ordered_charges CROSS JOIN receipt_total
  )
  UPDATE finance_charges
  SET paid_amount = ROUND(COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id = finance_charges.id), 0) / 100.0, 2),
      status = CASE
        WHEN COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id = finance_charges.id), 0) >= CAST(ROUND(amount * 100, 0) AS INTEGER) THEN 'paid'
        WHEN COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id = finance_charges.id), 0) > 0 THEN 'partial'
        ELSE 'pending'
      END
  WHERE tenant_id = ? AND apartment_id = ?
    AND id IN (SELECT id FROM allocation)`;
}

export function allocationBindings(tenantId: string, apartmentId: string): string[] {
  return [tenantId, apartmentId, tenantId, apartmentId, tenantId, apartmentId];
}

export async function syncPersonalAccounts(
  env: Env,
  tenantId: string,
  scope: { buildingId?: string | null; apartmentId?: string | null } = {},
): Promise<{ updated: number }> {
  const params: string[] = [tenantId];
  let where = 'pa.tenant_id = ?';
  if (scope.buildingId) {
    where += ` AND pa.apartment_id IN (
      SELECT a.id FROM apartments a
      WHERE a.building_id = ? AND a.tenant_id = pa.tenant_id
    )`;
    params.push(scope.buildingId);
  }
  if (scope.apartmentId) {
    where += ' AND pa.apartment_id = ?';
    params.push(scope.apartmentId);
  }

  const result = await env.DB.prepare(
    `UPDATE personal_accounts AS pa
     SET balance = COALESCE((
           SELECT SUM(p.amount)
           FROM finance_payments p
           WHERE p.apartment_id = pa.apartment_id
             AND p.payment_type != 'overpayment'
             AND p.tenant_id = pa.tenant_id
         ), 0) - COALESCE((
           SELECT SUM(c.amount)
           FROM finance_charges c
           WHERE c.apartment_id = pa.apartment_id
             AND c.tenant_id = pa.tenant_id
         ), 0),
         last_payment_date = (
           SELECT MAX(p.payment_date)
           FROM finance_payments p
           WHERE p.apartment_id = pa.apartment_id
             AND p.payment_type != 'overpayment'
             AND p.tenant_id = pa.tenant_id
         ),
         last_payment_amount = (
           SELECT p.amount
           FROM finance_payments p
           WHERE p.apartment_id = pa.apartment_id
             AND p.payment_type != 'overpayment'
             AND p.tenant_id = pa.tenant_id
           ORDER BY p.payment_date DESC, p.id DESC
           LIMIT 1
         )
     WHERE ${where}`
  ).bind(...params).run();

  return { updated: (result.meta as { changes?: number })?.changes || 0 };
}

export function normalizeBreakdown(value: unknown, chargeAmount: number): BreakdownItem[] {
  const expectedCents = amountToCents(chargeAmount);
  if (expectedCents === null || expectedCents === 0) return [];
  const rawItems = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  const amountKey = Array.isArray(value) ? 'amount' : 'share';
  const items = rawItems.slice(0, 1000).flatMap((raw): BreakdownItem[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const amount = Number(item[amountKey]);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) return [];
    const cents = Math.round(amount * 100);
    return [{
      name: String(item.name || item.category || 'Прочие услуги').slice(0, 256),
      amount: centsToAmount(cents),
      legal_code: typeof item.legal_code === 'string' ? item.legal_code : null,
    }];
  });
  if (items.length === 0) return [{ name: 'Прочие услуги', amount: centsToAmount(expectedCents), legal_code: null }];

  const actualCents = items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  if (actualCents < expectedCents) {
    items.push({ name: 'Прочие услуги', amount: centsToAmount(expectedCents - actualCents), legal_code: null });
    return items;
  }
  if (actualCents === expectedCents) return items;

  const total = BigInt(actualCents);
  const expected = BigInt(expectedCents);
  const scaled = items.map((item, index) => {
    const numerator = BigInt(Math.round(item.amount * 100)) * expected;
    return { index, cents: numerator / total, remainder: numerator % total };
  });
  let centsLeft = expected - scaled.reduce((sum, item) => sum + item.cents, 0n);
  const remainderOrder = [...scaled].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1
  );
  for (const item of remainderOrder) {
    if (centsLeft === 0n) break;
    scaled[item.index].cents += 1n;
    centsLeft -= 1n;
  }
  for (const item of scaled) items[item.index].amount = centsToAmount(Number(item.cents));
  return items;
}

export function isValidMonthPeriod(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}
import type { Env } from '../../types';
