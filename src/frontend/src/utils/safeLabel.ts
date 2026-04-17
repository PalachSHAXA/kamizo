// Defensive lookup for enum-label records.
//
// Motivation: historical data in D1 can contain values that are no longer in
// the TypeScript enum (e.g. a guest_access_codes row whose visitor_type was
// stored as 'unknown' before the enum was tightened). A bare
// `LABELS[item.field]` returns undefined; reading `.icon` / `.label` on that
// then crashes the whole view via ErrorBoundary. `safeLabel` returns a
// caller-provided fallback row instead, so one bad record can't blank out
// an entire page for the whole tenant.
export function safeLabel<K extends string, V>(
  labels: Record<K, V>,
  key: unknown,
  fallback: V,
): V {
  if (typeof key !== 'string') return fallback;
  const entry = labels[key as K];
  return entry != null ? entry : fallback;
}
