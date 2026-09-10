// Тесты для sql-parity helper.
//
// Регресс-контракт: если бы этот helper существовал 10.09.2026, PR-9
// поймал бы "22 values for 21 columns" локально до деплоя.

import { describe, expect, it } from 'vitest';
import { parseInsert, assertInsertParity } from './sql-parity';

describe('parseInsert', () => {
  it('простой INSERT с 3 колонками и 3 placeholders', () => {
    const s = parseInsert('INSERT INTO users (id, name, email) VALUES (?, ?, ?)');
    expect(s.table).toBe('users');
    expect(s.columns).toEqual(['id', 'name', 'email']);
    expect(s.placeholderCount).toBe(3);
    expect(s.literalCount).toBe(0);
    expect(s.totalValues).toBe(3);
  });

  it('смесь placeholder и string-литералов', () => {
    const s = parseInsert("INSERT INTO items (id, name, category, kind) VALUES (?, ?, 'maintenance', 'expense')");
    expect(s.columns.length).toBe(4);
    expect(s.placeholderCount).toBe(2);
    expect(s.literalCount).toBe(2);
    expect(s.totalValues).toBe(4);
  });

  it('numeric и NULL литералы', () => {
    const s = parseInsert('INSERT INTO x (a, b, c, d) VALUES (?, 42, NULL, ?)');
    expect(s.placeholderCount).toBe(2);
    expect(s.literalCount).toBe(2);
  });

  it('многострочный SQL с whitespace', () => {
    const s = parseInsert(`
      INSERT INTO finance_estimate_items (
        id, estimate_id, name, category
      ) VALUES (
        ?, ?, ?, 'maintenance'
      )
    `);
    expect(s.columns).toEqual(['id', 'estimate_id', 'name', 'category']);
    expect(s.placeholderCount).toBe(3);
    expect(s.literalCount).toBe(1);
  });

  it('вызов функции как значение: datetime(\'now\')', () => {
    const s = parseInsert("INSERT INTO x (id, created_at) VALUES (?, datetime('now'))");
    expect(s.placeholderCount).toBe(1);
    expect(s.literalCount).toBe(1);
    expect(s.totalValues).toBe(2);
  });

  it('не-INSERT SQL → error', () => {
    expect(() => parseInsert('SELECT * FROM users')).toThrow(/not a recognizable INSERT/);
    expect(() => parseInsert('UPDATE x SET a=?')).toThrow(/not a recognizable INSERT/);
  });
});

describe('assertInsertParity', () => {
  it('сбалансированный INSERT + правильное число bind-params → ok', () => {
    const sql = 'INSERT INTO users (id, name, email) VALUES (?, ?, ?)';
    expect(() => assertInsertParity(sql, ['u1', 'Alice', 'a@x']))
      .not.toThrow();
  });

  it('columns != values → SQL parity error (сообщение как у SQLite)', () => {
    // Имитируем ровно тот bug, который был в PR-9: 21 колонка, 22 value-tokens
    const sql = `INSERT INTO t (
      id, estimate_id, name, category, category_id, amount, monthly_amount,
      section, unit, linked_to_staff, legal_code, kind, building_id, sort_order, tenant_id,
      quantity, qty_unit, unit_price, frequency_per_month, source_price_ref, formula_notes
    ) VALUES (?, ?, ?, 'maintenance', ?, ?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    // 20 '?' + 2 literals = 22 tokens, 21 cols.
    expect(() => assertInsertParity(sql, new Array(20).fill(null)))
      .toThrow(/22 values for 21 columns/);
  });

  it('placeholders != bind params → error про bind mismatch', () => {
    const sql = 'INSERT INTO x (a, b, c) VALUES (?, ?, ?)';
    expect(() => assertInsertParity(sql, ['only-one']))
      .toThrow(/3 placeholders in SQL, but 1 bind params/);
  });

  it('CURRENT_INSERT из finance-v2.ts после фикса — balanced', () => {
    // Это ТЕКУЩИЙ, исправленный INSERT (после hotfix 5165ca25).
    const sql = `INSERT INTO finance_estimate_items (
      id, estimate_id, name, category, category_id, amount, monthly_amount,
      section, unit, linked_to_staff, legal_code, kind, building_id, sort_order, tenant_id,
      quantity, qty_unit, unit_price, frequency_per_month, source_price_ref, formula_notes
    ) VALUES (?, ?, ?, 'maintenance', ?, ?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    // 19 '?' + 2 literals = 21 tokens, 21 cols. bind = 19.
    const bindParams = new Array(19).fill(null);
    const shape = assertInsertParity(sql, bindParams);
    expect(shape.columns.length).toBe(21);
    expect(shape.totalValues).toBe(21);
    expect(shape.placeholderCount).toBe(19);
  });
});
