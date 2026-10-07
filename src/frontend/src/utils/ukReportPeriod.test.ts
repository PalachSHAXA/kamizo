import { describe, expect, it } from 'vitest';
import { getUkReportPreset, validateUkReportPeriod } from './ukReportPeriod';

describe('UK report period', () => {
  const now = new Date(2026, 8, 17, 12);

  it('builds current month, quarter and year presets', () => {
    expect(getUkReportPreset('month', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(getUkReportPreset('quarter', now)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(getUkReportPreset('year', now)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('rejects reversed and overlong periods', () => {
    expect(validateUkReportPeriod('2026-02-01', '2026-01-31')).toBe('reversed');
    expect(validateUkReportPeriod('2025-01-01', '2026-01-02')).toBe('too_long');
    expect(validateUkReportPeriod('2026-01-01', '2026-12-31')).toBeNull();
  });
});
