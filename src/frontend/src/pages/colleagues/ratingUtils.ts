// Shared rating helpers for the colleagues domain.
//
// Previously defined inline at the top of ColleaguesSection.tsx. When
// sprints 27/28 extracted EmployeeProfile and TopColleagues into their
// own files, those children kept reading `safeFixed` / `safeAvgRating`
// from the outer scope — once moved, the references became unresolved
// (TS2304) and the pages would crash at mount via ReferenceError.

import type { Employee } from './types';

/** Safe numeric formatter — returns "0.0" for non-finite values instead of crashing. */
export function safeFixed(n: number | undefined | null, digits = 1): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return (0).toFixed(digits);
  return n.toFixed(digits);
}

/** Compute average safely — returns 0 if ratings object missing/invalid. */
export function safeAvgRating(ratings: Employee['ratings'] | undefined): number {
  if (!ratings) return 0;
  const values = Object.values(ratings).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}
