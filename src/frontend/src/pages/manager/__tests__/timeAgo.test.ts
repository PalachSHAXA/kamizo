// C-C4 регресс: timeAgo() возвращал "NaN нед. назад" из-за
// `iso.replace(' ', 'T') + 'Z'` — этот код дописывал вторую Z
// к уже-ISO-строке (например "2026-08-01T09:57:31.967Z" → "…ZZ"),
// после чего WebKit/Safari парсил как Invalid Date → NaN.
// На demo tenant 5 из 6 rental_listings.created_at идут в ISO-формате
// (JS Date.toISOString()), 1 — в SQLite datetime('now') с пробелом.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { timeAgo } from '../RentalsModerationPage';

describe('timeAgo — C-C4 fix для смешанных форматов created_at', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Фиксирую «сейчас» на 2026-09-18T12:00:00Z — из-под этой точки удобно
    // считать «N нед. назад».
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('ISO-8601 с Z и мс (JS Date.toISOString()) — считает недели корректно, НЕ NaN', () => {
    // 5 недель до 2026-09-18 = ~2026-08-14. Прежний код давал NaN.
    const result = timeAgo('2026-08-14T09:57:31.967Z', 'ru');
    expect(result).not.toContain('NaN');
    expect(result).toBe('5 нед. назад');
  });

  it('SQLite datetime(\'now\') format с пробелом (без Z) — тоже корректно', () => {
    // 5 недель назад в SQLite-формате.
    const result = timeAgo('2026-08-14 09:57:31', 'ru');
    expect(result).not.toContain('NaN');
    expect(result).toBe('5 нед. назад');
  });

  it('оба формата дают одинаковый результат на одно и то же время', () => {
    expect(timeAgo('2026-08-14T09:57:31.967Z', 'ru'))
      .toBe(timeAgo('2026-08-14 09:57:31', 'ru'));
  });

  it('null → fallback "недавно" (не NaN, не crash)', () => {
    expect(timeAgo(null, 'ru')).toBe('недавно');
    expect(timeAgo(undefined, 'ru')).toBe('недавно');
    expect(timeAgo('', 'ru')).toBe('недавно');
  });

  it('невалидная строка → fallback "недавно" (защита от Number.isNaN)', () => {
    expect(timeAgo('not-a-date', 'ru')).toBe('недавно');
    expect(timeAgo('2026-99-99', 'ru')).toBe('недавно');
  });

  it('узбекская локализация', () => {
    expect(timeAgo('2026-08-14T09:57:31.967Z', 'uz')).toBe('5 hafta oldin');
    expect(timeAgo(null, 'uz')).toBe('yaqinda');
  });

  it('сегодня / вчера / N дней', () => {
    // «сегодня» — same UTC day
    expect(timeAgo('2026-09-18T09:00:00Z', 'ru')).toBe('сегодня');
    // вчера
    expect(timeAgo('2026-09-17T09:00:00Z', 'ru')).toBe('вчера');
    // 3 дня назад
    expect(timeAgo('2026-09-15T12:00:00Z', 'ru')).toBe('3 дн. назад');
  });

  it('ISO с offset (не Z) — тоже валиден, не дописывается Z', () => {
    // Строка со смещением +05:00 не должна получить лишнюю Z.
    expect(timeAgo('2026-08-14T14:57:31+05:00', 'ru')).not.toContain('NaN');
  });
});
