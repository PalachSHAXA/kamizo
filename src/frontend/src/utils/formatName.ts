/**
 * Normalize names that come from legacy DB imports in ALL CAPS
 * (e.g. "ABDUSAMATOVA IRODA" → "Abdusamatova Iroda").
 *
 * Only touches strings that are fully uppercase (no mixed-case names).
 * Preserves punctuation and embedded quotes (e.g. legal entity names).
 */
export function formatName(name: string | null | undefined): string {
  if (!name) return '';
  // If already mixed-case, leave as is
  if (name !== name.toUpperCase()) return name;
  // Title-case: first letter of each word uppercase, rest lowercase
  return name
    .toLowerCase()
    .replace(/(^|\s|"|'|\(|«|-)([\p{L}])/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}
