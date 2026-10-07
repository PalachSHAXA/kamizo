export type UkReportPeriodPreset = 'month' | 'quarter' | 'year';
export type UkReportPeriodError = 'required' | 'reversed' | 'too_long';

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getUkReportPreset(preset: UkReportPeriodPreset, now = new Date()): { from: string; to: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (preset === 'year') return { from: localIsoDate(new Date(year, 0, 1)), to: localIsoDate(new Date(year, 11, 31)) };
  if (preset === 'quarter') {
    const firstMonth = Math.floor(month / 3) * 3;
    return { from: localIsoDate(new Date(year, firstMonth, 1)), to: localIsoDate(new Date(year, firstMonth + 3, 0)) };
  }
  return { from: localIsoDate(new Date(year, month, 1)), to: localIsoDate(new Date(year, month + 1, 0)) };
}

export function validateUkReportPeriod(from: string, to: string): UkReportPeriodError | null {
  if (!from || !to) return 'required';
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 'required';
  if (fromTime > toTime) return 'reversed';
  if ((toTime - fromTime) / 86_400_000 > 365) return 'too_long';
  return null;
}
