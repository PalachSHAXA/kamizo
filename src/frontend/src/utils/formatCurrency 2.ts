/**
 * Format a number as UZS currency: "1 234 567 сум"
 * Uses ru-RU locale for space-separated thousands.
 */
export const formatCurrency = (amount: number | string | null | undefined, lang: 'ru' | 'uz' = 'ru'): string => {
  const n = Number(amount) || 0;
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
  return formatted + (lang === 'ru' ? ' сум' : " so'm");
};

/**
 * Format a number with locale grouping but without currency suffix.
 * Useful when the suffix is rendered separately.
 */
export const formatAmount = (amount: number | string | null | undefined): string => {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};
