// v118.120 — Cyrillic→Latin homoglyph normalization for auto-generated
// resident credentials.
//
// Why it exists: resident login + password are synthesised from
// branch/building/apartment fields imported from the government billing
// system. Building names like "8Е" carry a CYRILLIC Е (U+0415) instead
// of Latin E (U+0045) — visually identical, byte-different. When the
// resident later types the password on any keyboard, they produce
// Latin E by default → PBKDF2 hash doesn't match → can't log in.
//
// This util produces an ASCII-equivalent string by mapping the
// confusable-Cyrillic set to its Latin twin. Russian-only words (no
// Latin look-alikes) pass through unchanged.
//
// Backend mirror lives in cloudflare/src/utils/crypto.ts —
// verifyPasswordTolerant() applies the same map at verify time as a
// fallback for legacy accounts whose hash was created BEFORE this
// normalization shipped.

const CYR_TO_LATIN: Record<string, string> = {
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H',
  'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  'а': 'a', 'е': 'e', 'к': 'k', 'м': 'm', 'о': 'o', 'р': 'p',
  'с': 'c', 'х': 'x', 'у': 'y',
};
const HAS_CYR = /[АВЕКМНОРСТУХаекмопрсху]/;

/** Replace Cyrillic visual-twin characters with their Latin equivalents.
 *  Strings without any of those characters pass through unchanged. */
export function normalizeAsciiHomoglyphs(s: string): string {
  if (!HAS_CYR.test(s)) return s;
  let out = '';
  for (const ch of s) out += CYR_TO_LATIN[ch] ?? ch;
  return out;
}
