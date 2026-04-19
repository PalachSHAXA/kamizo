// Format Uzbekistan phone numbers into a readable grouping.
// Input may come as +998901000011, 998901000011, 901000011, or partially
// formatted (with spaces/dashes). Output: "+998 90 100 00 11".
// Non-UZ or malformed numbers are returned unchanged so we don't munge
// international contacts.
export function formatPhone(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  // Strip leading 998 if present; accept bare 9-digit UZ mobile too.
  let local = digits;
  if (local.startsWith('998')) local = local.slice(3);
  if (local.length !== 9) return String(raw);
  const op = local.slice(0, 2);
  const a = local.slice(2, 5);
  const b = local.slice(5, 7);
  const c = local.slice(7, 9);
  return `+998 ${op} ${a} ${b} ${c}`;
}
