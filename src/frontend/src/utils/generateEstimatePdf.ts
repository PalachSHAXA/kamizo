// Sprint 8: Печать сметы как PDF через window.print (без внешних либ,
// печатный диалог даёт «Save as PDF» на всех платформах).
//
// Работает и с legacy-сметой (плоские items), и с v2-моделью
// (fot / staff / expenses / incomes из EstimateResultV2). Развилка по
// полю estimate.model — если 'TARIFF_CALCULATED'/'MANUAL'/'FLAT', рендерим
// v2-раскладку с ФОТ-блоком, доходами и разрывом.

interface EstimateItemLite {
  id?: string;
  name: string;
  amount: number;
  category?: string;
  section?: string;
  kind?: string;   // 'expense' | 'income'
  unit?: string;
  linked_to_staff?: number | boolean;
  legal_code?: string;
}

export function generateEstimatePdf(
  estimate: Record<string, unknown>,
  items: EstimateItemLite[],
  buildings: Array<{ id: string; name: string; address?: string; totalArea?: number; [k: string]: unknown }>,
  language: 'ru' | 'uz',
  tenantName: string,
): void {
  const isRu = language === 'ru';
  const t = (ru: string, uz: string) => (isRu ? ru : uz);
  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0));

  const model = String(estimate.model || 'legacy');
  const isV2 = ['TARIFF_CALCULATED', 'TARIFF_MANUAL', 'TARIFF_FLAT'].includes(model);
  const building = buildings.find(b => b.id === estimate.building_id);
  const period = String(estimate.period || '');
  const title = String(estimate.title || t('Смета', 'Smeta'));

  const expenses = items.filter(i => (i.kind || 'expense') === 'expense');
  const incomes = items.filter(i => i.kind === 'income');

  const totalExpenses = expenses.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalIncomes = incomes.reduce((s, i) => s + Number(i.amount || 0), 0);

  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) {
    alert(t(
      'Не удалось открыть окно печати. Разрешите всплывающие окна для этого сайта.',
      'Chop etish oynasi ochilmadi. Popup ruxsat bering.'
    ));
    return;
  }

  const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c] || c);

  const style = `
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; font-size: 11pt; color: #111; margin: 0; padding: 18mm 14mm; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8mm; border-bottom: 2px solid #333; margin-bottom: 6mm; }
    .header .left { max-width: 60%; }
    .header .left .uk-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 2px; }
    .header .left .uk-name { font-size: 14pt; font-weight: 700; margin-bottom: 4px; }
    .header .left .building { font-size: 10pt; color: #444; }
    .header .right { text-align: right; font-size: 9pt; color: #666; }
    .doc-title { text-align: center; font-size: 16pt; font-weight: 700; margin: 4mm 0 2mm; text-transform: uppercase; }
    .doc-sub { text-align: center; font-size: 10pt; color: #555; margin-bottom: 6mm; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 6mm; font-size: 10pt; }
    .meta div span.k { color: #666; }
    h2 { font-size: 12pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 1px solid #999; }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; }
    th, td { border: 1px solid #666; padding: 2mm 3mm; font-size: 10pt; vertical-align: top; }
    th { background: #f0f0f0; text-align: left; font-weight: 700; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tfoot td { background: #fafafa; font-weight: 700; }
    .kpi-block { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 3mm 0; }
    .kpi { border: 1px solid #999; padding: 3mm; }
    .kpi .k { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.3px; }
    .kpi .v { font-size: 12pt; font-weight: 700; margin-top: 1mm; font-variant-numeric: tabular-nums; }
    .highlight { background: #fff8e1; border-color: #f0b400; }
    .highlight .v { color: #b26f00; }
    .warning { background: #fff5f5; border: 1px solid #f5a; padding: 3mm; margin: 3mm 0; font-size: 10pt; color: #a02040; }
    .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 12mm; font-size: 10pt; }
    .signature .line { border-top: 1px solid #333; padding-top: 2mm; }
    .footer-legal { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid #ccc; font-size: 8pt; color: #666; line-height: 1.5; }
    @page { size: A4; margin: 0; }
    @media print { .no-print { display: none !important; } }
  `;

  const kpi = (k: string, v: string, highlight = false) =>
    `<div class="kpi ${highlight ? 'highlight' : ''}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;

  const v2Section = isV2 ? `
    <h2>${t('Расчётные показатели', 'Hisob-kitob ko\'rsatkichlari')}</h2>
    <div class="kpi-block">
      ${kpi(t('ФОТ (брутто)', 'FOT (yalpi)'), fmt(Number(estimate.fot_gross || 0)))}
      ${kpi(t('Налог на ФОТ', 'FOT solig\'i'), fmt(Number(estimate.payroll_tax || 0)))}
      ${kpi(t('ФОТ (итого)', 'FOT jami'), fmt(Number(estimate.fot_total || 0)))}
      ${kpi(t('% прибыли УК', 'BT foyda %'), `${estimate.uk_profit_percent || 0}%`)}
      ${kpi(t('Себестоимость (жилые)', 'Tannarx'), fmt(Number(estimate.self_cost_resident || 0)))}
      ${kpi(t('Тариф жилых, сум/м²', 'Tarif, so\'m/m²'), fmt(Number(estimate.tariff_resident || 0)), true)}
      ${estimate.tariff_approved ? kpi(t('Утверждённый тариф', 'Tasdiqlangan'), fmt(Number(estimate.tariff_approved))) : ''}
      ${kpi(t('Годовые расходы', 'Yillik xarajatlar'), fmt(Number(estimate.umumiy_year || 0)))}
      ${kpi(t('Годовой доход', 'Yillik daromad'), fmt(Number(estimate.jami_tushum_year || 0)))}
      ${kpi(t('Разрыв (год)', 'Yillik farq'), fmt(Number(estimate.deficit_year || 0)),
        Number(estimate.deficit_year || 0) < 0)}
    </div>
    ${Number(estimate.deficit_year || 0) < 0
      ? `<div class="warning">${t('Внимание: годовой разрыв отрицательный. УК не покрывает расходы утверждённым тарифом.', 'Diqqat: yillik farq manfiy. BT xarajatlarni qoplamaydi.')}</div>`
      : ''}
  ` : '';

  const expensesTable = expenses.length ? `
    <h2>${t('Расходы', 'Xarajatlar')}</h2>
    <table>
      <thead><tr>
        <th style="width:8%">${t('№', '№')}</th>
        <th>${t('Статья', 'Modda')}</th>
        <th style="width:20%">${t('Раздел', 'Bo\'lim')}</th>
        <th style="width:15%; text-align:right">${t('Сумма, сум', 'Summa, so\'m')}</th>
      </tr></thead>
      <tbody>
        ${expenses.map((e, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(e.name)}${e.legal_code ? ` <small style="color:#999">[${esc(e.legal_code)}]</small>` : ''}</td>
          <td>${esc(e.section || e.category || '—')}</td>
          <td class="num">${fmt(e.amount)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="3">${t('ИТОГО расходов', 'JAMI xarajatlar')}</td>
        <td class="num">${fmt(totalExpenses)}</td>
      </tr></tfoot>
    </table>
  ` : '';

  const incomesTable = (isV2 && incomes.length) ? `
    <h2>${t('Доходы (коммерция / подвал / парковка / телеком)', 'Daromadlar')}</h2>
    <table>
      <thead><tr>
        <th style="width:8%">${t('№', '№')}</th>
        <th>${t('Источник', 'Manba')}</th>
        <th style="width:15%; text-align:right">${t('Сумма, сум', 'Summa, so\'m')}</th>
      </tr></thead>
      <tbody>
        ${incomes.map((e, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(e.name)}</td>
          <td class="num">${fmt(e.amount)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="2">${t('ИТОГО доходов', 'JAMI daromadlar')}</td>
        <td class="num">${fmt(totalIncomes)}</td>
      </tr></tfoot>
    </table>
  ` : '';

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)} — ${esc(period)}</title>
<style>${style}</style></head><body>
  <div class="header">
    <div class="left">
      <div class="uk-label">${t('Управляющая организация', 'Boshqaruv tashkiloti')}</div>
      <div class="uk-name">${esc(tenantName)}</div>
      ${building ? `<div class="building">${esc(building.name || building.address || '')}${building.totalArea ? ` · ${fmt(Number(building.totalArea))} м²` : ''}</div>` : ''}
    </div>
    <div class="right">
      <div>Kamizo · ${t('Управление домом', 'Uy boshqaruvi')}</div>
      <div>kamizo.uz</div>
    </div>
  </div>

  <div class="doc-title">${esc(title)}</div>
  <div class="doc-sub">${t('Период', 'Davr')}: ${esc(period)} · ${t('Статус', 'Holat')}: ${esc(estimate.status || 'draft')}</div>

  <div class="meta">
    <div><span class="k">${t('Модель', 'Model')}:</span> <b>${esc(model)}</b></div>
    <div><span class="k">${t('Дата действия', 'Amal qilish sanasi')}:</span> ${esc(estimate.effective_date || '—')}</div>
    <div><span class="k">${t('Ставка налога на ФОТ', 'FOT solig\'i')}:</span> ${((Number(estimate.payroll_tax_rate || 0)) * 100).toFixed(1)}%</div>
    <div><span class="k">${t('Жилая площадь', 'Turar joy maydoni')}:</span> ${fmt(Number(estimate.residential_area || 0))} м²</div>
  </div>

  ${v2Section}

  ${expensesTable}
  ${incomesTable}

  <div class="signature">
    <div class="line">${t('Директор УК', 'BT direktori')}<br><br>______________________</div>
    <div class="line">${t('Гл. бухгалтер', 'Bosh buxgalter')}<br><br>______________________</div>
  </div>

  <div class="footer-legal">
    ${t(
      'Смета составлена в соответствии с Законом Республики Узбекистан «Об управлении многоквартирными домами» (ЗРУ-581), приказом Министерства юстиции №3501 (минимальные тарифы), а также постановлениями Кабинета Министров №930 и №5152. Данный документ подлежит утверждению общим собранием собственников. Сформирован автоматически системой Kamizo.',
      'Smeta O\'zbekiston Respublikasining "Ko\'p kvartirali uylarni boshqarish to\'g\'risida"gi qonuni (ORQ-581), Adliya vazirligi buyrug\'i №3501 (minimal tariflar) va Vazirlar Mahkamasi qarorlari №930 va №5152 asosida tuzilgan. Hujjat egalarning umumiy yig\'ilishida tasdiqlanishi kerak. Kamizo tomonidan yaratilgan.'
    )}
  </div>

  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body></html>`;

  w.document.write(html);
  w.document.close();
}
