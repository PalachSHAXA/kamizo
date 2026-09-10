// Общий SQL-parity helper для unit-тестов роутов.
//
// Причина существования: 10.09.2026 инцидент PR-9 — INSERT VALUES имел
// один лишний '?', unit-тесты (мокавшие env.DB.prepare) не поймали, а
// SQLite упал в проде с "22 values for 21 columns".
//
// Что делает: парсит SQL statement, извлекает список колонок и
// вычисляет ожидаемое число value-tokens (positional-placeholders '?'
// плюс инлайновые literals). Затем сравнивает с bind-params count.
//
// Ограничения (документируем сознательно, чтобы не пытаться поддержать
// то, что помешает):
//   - Только INSERT INTO … (col1, col2, …) VALUES (…). Не UPDATE, не
//     UPSERT, не multi-row INSERT.
//   - Литералы — только целые числа, десятичные, одинарно-кавычные
//     строки без экранированной ') и NULL.
//   - Не парсит SELECT, JOIN, подзапросы (не нужны для этого класса
//     ошибок — они возникают только в INSERT VALUES).

export interface InsertShape {
  table: string;
  columns: string[];
  placeholderCount: number;   // число '?'
  literalCount: number;       // число инлайновых литералов ('maintenance', 12, NULL)
  totalValues: number;        // placeholderCount + literalCount
}

/**
 * Парсит INSERT statement и возвращает форму. Кидает исключение,
 * если SQL не является распознаваемым INSERT.
 */
export function parseInsert(sql: string): InsertShape {
  // Нормализуем whitespace, приводим к одной строке
  const norm = sql.replace(/\s+/g, ' ').trim();

  // INSERT INTO table (cols) VALUES (values)
  const m = /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)\s*$/i.exec(norm);
  if (!m) throw new Error(`parseInsert: not a recognizable INSERT statement:\n${sql}`);

  const table = m[1];
  const columns = m[2].split(',').map((c) => c.trim()).filter(Boolean);
  const valuesStr = m[3];

  // Токенизация VALUES: считаем '?', 'quoted-strings', numeric, NULL.
  // Проходим посимвольно, поддерживая одинарные кавычки.
  let placeholderCount = 0;
  let literalCount = 0;
  let i = 0;
  const n = valuesStr.length;

  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);

  while (i < n) {
    const c = valuesStr[i];
    if (c === ' ' || c === ',' || c === '\t' || c === '\n') { i++; continue; }
    if (c === '?') { placeholderCount++; i++; continue; }
    if (c === "'") {
      // строковый литерал
      i++;
      while (i < n && valuesStr[i] !== "'") i++;
      if (i < n) i++; // закрывающая кавычка
      literalCount++;
      continue;
    }
    if (isDigit(c) || (c === '-' && i + 1 < n && isDigit(valuesStr[i + 1]))) {
      // numeric literal
      i++;
      while (i < n && /[0-9.eE+-]/.test(valuesStr[i])) i++;
      literalCount++;
      continue;
    }
    if (isIdentStart(c)) {
      // NULL, TRUE, FALSE, CURRENT_TIMESTAMP, datetime('now') и т.п.
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(valuesStr[i])) i++;
      // Проверим на функциональный вызов func(...): пропускаем сбалансированные скобки
      if (i < n && valuesStr[i] === '(') {
        let depth = 1; i++;
        while (i < n && depth > 0) {
          if (valuesStr[i] === '(') depth++;
          else if (valuesStr[i] === ')') depth--;
          else if (valuesStr[i] === "'") {
            i++;
            while (i < n && valuesStr[i] !== "'") i++;
          }
          i++;
        }
      }
      literalCount++;
      continue;
    }
    // Неизвестный символ — просто продвигаемся, чтобы не зависнуть.
    i++;
  }

  return {
    table,
    columns,
    placeholderCount,
    literalCount,
    totalValues: placeholderCount + literalCount,
  };
}

/**
 * Проверяет, что INSERT statement сбалансирован: количество колонок ==
 * placeholder + literal counts, а также сравнивает placeholder count с
 * фактическим числом переданных bind-params.
 *
 * Возвращает объект с полями и, если всё ОК, ничего не бросает. Если
 * дисбаланс — бросает ошибку с диагностикой, аналогичной той, что даст
 * настоящий SQLite.
 */
export function assertInsertParity(sql: string, bindParams: unknown[]): InsertShape {
  const shape = parseInsert(sql);
  if (shape.totalValues !== shape.columns.length) {
    throw new Error(
      `SQL parity: ${shape.totalValues} values for ${shape.columns.length} columns\n` +
      `  table: ${shape.table}\n` +
      `  columns (${shape.columns.length}): ${shape.columns.join(', ')}\n` +
      `  values: ${shape.placeholderCount} '?' + ${shape.literalCount} literals`
    );
  }
  if (shape.placeholderCount !== bindParams.length) {
    throw new Error(
      `SQL parity: ${shape.placeholderCount} placeholders in SQL, but ${bindParams.length} bind params passed\n` +
      `  table: ${shape.table}\n` +
      `  columns: ${shape.columns.join(', ')}`
    );
  }
  return shape;
}
