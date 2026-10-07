import { describe, expect, it } from 'vitest';
import { getUkReportPreset, validateUkReportPeriod } from '../../../utils/ukReportPeriod';

describe('UK report period', () => {
  const now = new Date(2026, 4, 17);

  it('builds calendar month, quarter and year presets', () => {
    expect(getUkReportPreset('month', now)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
    expect(getUkReportPreset('quarter', now)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(getUkReportPreset('year', now)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('rejects reversed and longer-than-one-year ranges', () => {
    expect(validateUkReportPeriod('', '2026-01-01')).toBe('required');
    expect(validateUkReportPeriod('2026-02-01', '2026-01-31')).toBe('reversed');
    expect(validateUkReportPeriod('2025-01-01', '2026-01-02')).toBe('too_long');
    expect(validateUkReportPeriod('2026-01-01', '2026-12-31')).toBeNull();
  });
});
