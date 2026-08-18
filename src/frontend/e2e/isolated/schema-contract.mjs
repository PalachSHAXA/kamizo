function splitTopLevelColumns(body) {
  const definitions = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (character === quote && body[index - 1] !== '\\') quote = null;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      definitions.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  definitions.push(body.slice(start).trim());
  return definitions.filter(Boolean);
}

export function contractFromCreateTableSnapshot(sql, tables) {
  const contract = {};
  for (const table of tables) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = sql.match(new RegExp(`CREATE TABLE ${escaped}\\s*\\(([\\s\\S]*?)\\)\\s*;`));
    if (!match) throw new Error(`Production snapshot missing table: ${table}`);
    const columns = splitTopLevelColumns(match[1]).flatMap((definition) => {
      const column = definition.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z]+)/);
      if (!column || /^(?:CONSTRAINT|FOREIGN|PRIMARY|UNIQUE|CHECK)$/i.test(column[1])) return [];
      return [{ name: column[1], type: column[2].toUpperCase() }];
    });
    contract[table] = { exact: false, columns };
  }
  return contract;
}

export function replaceTableContracts(baseline, snapshot, tables) {
  let generated = baseline;
  for (const table of tables) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const snapshotMatch = snapshot.match(new RegExp(`CREATE TABLE ${escaped}\\s*\\([\\s\\S]*?\\)\\s*;`));
    if (!snapshotMatch) throw new Error(`Production snapshot missing table: ${table}`);
    const baselinePattern = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${escaped}\\s*\\([\\s\\S]*?\\)\\s*;`);
    if (!baselinePattern.test(generated)) throw new Error(`Baseline missing table: ${table}`);
    generated = generated.replace(baselinePattern, snapshotMatch[0]);
    generated = generated.replace(
      new RegExp(`CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)? [^;]+ ON ${escaped}\\s*\\([^;]+;`, 'g'),
      '',
    );
  }
  return generated;
}

export function validateSchemaContract(contract, actualSchema) {
  for (const [table, tableContract] of Object.entries(contract)) {
    const actualColumns = actualSchema[table];
    if (!actualColumns) throw new Error(`Local schema missing table: ${table}`);

    const actualByName = new Map(actualColumns.map(column => [column.name, column]));
    const expectedNames = new Set(tableContract.columns.map(column => column.name));
    const missing = tableContract.columns
      .filter(column => !actualByName.has(column.name))
      .map(column => column.name);
    if (missing.length > 0) throw new Error(`${table} missing columns: ${missing.join(', ')}`);

    for (const expected of tableContract.columns) {
      const actual = actualByName.get(expected.name);
      const actualType = String(actual.type || '').toUpperCase();
      const expectedType = String(expected.type || '').toUpperCase();
      if (expectedType && actualType !== expectedType) {
        throw new Error(`${table}.${expected.name} type ${actualType} != ${expectedType}`);
      }
    }

    if (tableContract.exact) {
      const unexpected = actualColumns
        .filter(column => !expectedNames.has(column.name))
        .map(column => column.name);
      if (unexpected.length > 0) throw new Error(`${table} unexpected columns: ${unexpected.join(', ')}`);
    }
  }
}
