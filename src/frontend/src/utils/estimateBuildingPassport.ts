// PR-6 (feat/smeta-building-passport) блок A: секция «Паспорт МКД»
// в PDF сметы. Показывает базовые характеристики здания (адрес, площади,
// год постройки, отопление и т.п.) плюс дополнительные площади из
// миграции 084 (parking_area / basement_area / technical_rooms_area).
//
// Правило рендера:
//   - Секция показывается ТОЛЬКО если хотя бы одно из ТРЁХ НОВЫХ полей
//     заполнено. Все три NULL → секция не рендерится (baseline-инвариант:
//     сегодняшний PDF для myhelper 2026-08 не меняется).
//   - Существующие поля (floors, land_area, year_built, heating_type)
//     НЕ триггерят секцию сами по себе — они на 100% заполнены у всех
//     prod-зданий, и включение бы сломало baseline SHA256.
//
// Backend GET /api/buildings/:id уже возвращает SELECT * → новые поля
// приходят в объекте building автоматически (nullable). Frontend передаёт
// building объекту через параметр PDF-генератора.

export interface BuildingPassportFields {
  address?: string | null;
  floors?: number | null;
  entrances_count?: number | null;
  apartments_count?: number | null;
  total_area?: number | null;
  living_area?: number | null;
  common_area?: number | null;
  land_area?: number | null;
  year_built?: number | null;
  year_renovated?: number | null;
  building_type?: string | null;
  roof_type?: string | null;
  heating_type?: string | null;
  elevator_count?: number | null;
  has_elevator?: number | boolean | null;
  parking_spaces?: number | null;

  // PR-6 blockA — миграция 084 (новые поля, триггерят рендер секции):
  parking_area?: number | null;
  basement_area?: number | null;
  technical_rooms_area?: number | null;
}

/** true если хотя бы одно из ТРЁХ НОВЫХ полей задано (>0 и не null).
 *  Именно этот флаг решает, показывать ли секцию в PDF. */
export function hasExtendedPassportData(b: BuildingPassportFields | null | undefined): boolean {
  if (!b) return false;
  const p = Number(b.parking_area ?? 0);
  const bs = Number(b.basement_area ?? 0);
  const tr = Number(b.technical_rooms_area ?? 0);
  return p > 0 || bs > 0 || tr > 0;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ');

interface FieldRow { label: string; value: string | null }

function collectRows(b: BuildingPassportFields, lang: 'ru' | 'uz'): FieldRow[] {
  const ru = lang === 'ru';
  const rows: FieldRow[] = [];
  const pushIf = (label: string, val: unknown, formatter?: (v: number) => string) => {
    if (val === null || val === undefined || val === '' || val === 0) return;
    const num = Number(val);
    const display = formatter && !Number.isNaN(num)
      ? formatter(num)
      : String(val);
    rows.push({ label, value: display });
  };

  pushIf(ru ? 'Адрес' : 'Manzil', b.address);
  pushIf(ru ? 'Этажей' : 'Qavatlar', b.floors);
  pushIf(ru ? 'Подъездов' : 'Podyezdlar', b.entrances_count);
  pushIf(ru ? 'Квартир' : 'Kvartiralar', b.apartments_count);
  pushIf(ru ? 'Общая площадь, м²' : 'Umumiy maydon, m²', b.total_area, (n) => fmt(n));
  pushIf(ru ? 'Жилая площадь, м²' : 'Turar-joy, m²', b.living_area, (n) => fmt(n));
  pushIf(ru ? 'Площадь МОП, м²' : 'Umumiy joylar, m²', b.common_area, (n) => fmt(n));
  pushIf(ru ? 'Площадь придомовой территории, м²' : 'Yaqin hudud, m²', b.land_area, (n) => fmt(n));
  pushIf(ru ? 'Площадь парковки, м²' : 'Avtoturargoh maydoni, m²', b.parking_area, (n) => fmt(n));
  pushIf(ru ? 'Площадь подвала, м²' : 'Podval maydoni, m²', b.basement_area, (n) => fmt(n));
  pushIf(ru ? 'Тех. помещения, м²' : 'Texnik xonalar, m²', b.technical_rooms_area, (n) => fmt(n));
  pushIf(ru ? 'Год постройки' : 'Qurilgan yil', b.year_built);
  pushIf(ru ? 'Год кап.ремонта' : 'Kapital ta\'mir yili', b.year_renovated);
  pushIf(ru ? 'Тип отопления' : 'Isitish turi', b.heating_type);
  pushIf(ru ? 'Лифтов' : 'Liftlar', b.elevator_count);
  pushIf(ru ? 'Машиномест' : 'Avtomobil o\'rinlari', b.parking_spaces);
  return rows;
}

/**
 * Возвращает HTML-фрагмент с секцией «Паспорт МКД» либо пустую строку,
 * если триггерных полей нет.
 */
export function renderBuildingPassportHtml(
  building: BuildingPassportFields | null | undefined,
  lang: 'ru' | 'uz',
  escape: (s: string) => string,
): string {
  if (!building) return '';
  if (!hasExtendedPassportData(building)) return '';

  const rows = collectRows(building, lang);
  if (rows.length === 0) return '';

  const heading = lang === 'ru' ? 'Паспорт МКД' : 'MKD pasporti';
  const rowsHtml = rows.map((r) =>
    `<tr><td style="color:#666;">${escape(r.label)}</td><td>${escape(r.value ?? '')}</td></tr>`
  ).join('');

  return `
    <h2>${escape(heading)}</h2>
    <table style="width:auto; min-width:60%;">
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}
