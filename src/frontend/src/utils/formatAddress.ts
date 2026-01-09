/**
 * Форматирует адрес с номером квартиры
 * Убирает дублирование и добавляет "кв." если нужно
 */
export function formatAddress(address: string | undefined | null, apartment: string | undefined | null): string {
  const addr = address || '';
  const apt = apartment || '';

  if (!apt) return addr;

  // If address ends with apartment number (without "кв."), replace with proper format
  if (addr.endsWith(`, ${apt}`) || addr.endsWith(` ${apt}`)) {
    return addr.slice(0, addr.lastIndexOf(apt)) + `кв. ${apt}`;
  }

  // If address already has "кв." format, return as is
  if (addr.includes(`кв. ${apt}`) || addr.includes(`кв.${apt}`)) {
    return addr;
  }

  // Otherwise append
  return `${addr}, кв. ${apt}`;
}
