// Sprint 6: Факт-отчёт собственникам по ст.29 ЗРУ-581.
//
// УК обязана публиковать периодический отчёт: по каждой статье сметы —
// сколько было долгов на начало периода, начислено, оплачено и остаток.
// Плюс план vs факт по прибыли самой УК.
//
// Страница:
//  - выбор дома + диапазон YYYY-MM ⋯ YYYY-MM
//  - preview (без сохранения) → GET /api/finance/fact-reports/preview
//  - «Сохранить снепшот» → POST /api/finance/fact-reports (кнопка admin/director)
//  - «Печать» → window.print() c печатной вёрсткой (шапка тенанта слева, Kamizo справа)

import { useEffect, useMemo, useState } from 'react';
import { Printer, Save, Loader2, FileText } from 'lucide-react';
import { useBuildingStore } from '../../../stores/buildingStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useTenantStore } from '../../../stores/tenantStore';
import { useAuthStore } from '../../../stores/authStore';
import { factReportApi, type FactReportPayload } from '../../../services/api/finance-v2';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));

export function FactReportPage() {
  const { buildings, fetchBuildings } = useBuildingStore(s => ({
    buildings: s.buildings,
    fetchBuildings: s.fetchBuildings,
  }));
  const { language } = useLanguageStore();
  const isRu = language === 'ru';
  const tenant = useTenantStore(s => s.config?.tenant);
  const user = useAuthStore(s => s.user);
  const canSave = user && ['admin', 'director'].includes(user.role);

  const [buildingId, setBuildingId] = useState<string>('');
  const [periodFrom, setPeriodFrom] = useState<string>(monthAgo(11));
  const [periodTo, setPeriodTo] = useState<string>(currentMonth());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<FactReportPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetchBuildings(); }, [fetchBuildings]);
  useEffect(() => {
    if (!buildingId && buildings.length) setBuildingId(buildings[0].id);
  }, [buildings, buildingId]);

  const load = async () => {
    if (!buildingId) return;
    setLoading(true); setErr(null);
    try {
      const res = await factReportApi.preview({
        building_id: buildingId,
        period_from: periodFrom,
        period_to: periodTo,
      });
      setData(res);
    } catch (e: any) {
      setErr(e?.message || (isRu ? 'Не удалось загрузить отчёт' : 'Hisobotni yuklab bo‘lmadi'));
      setData(null);
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!buildingId) return;
    setSaving(true); setErr(null);
    try {
      const res = await factReportApi.save({
        building_id: buildingId,
        period_from: periodFrom,
        period_to: periodTo,
      });
      setData(res);
    } catch (e: any) {
      setErr(e?.message || (isRu ? 'Не удалось сохранить' : 'Saqlanmadi'));
    } finally { setSaving(false); }
  };

  const collectionRate = useMemo(() => {
    if (!data) return 0;
    const denom = data.totals.prior_debt + data.totals.accrued;
    return denom > 0 ? Math.round((data.totals.paid / denom) * 1000) / 10 : 0;
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Filters — не печатается */}
      <div className="print:hidden mb-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h1 className="text-lg md:text-xl font-semibold mb-3 flex items-center gap-2">
          <FileText size={20} className="text-brand" />
          {isRu ? 'Факт-отчёт собственникам (ст.29 ЗРУ-581)' : 'Egalarga fakt-hisobot (29-modda ORQ-581)'}
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">{isRu ? 'Дом' : 'Uy'}</span>
            <select
              value={buildingId}
              onChange={e => setBuildingId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white"
            >
              {buildings.map(b => (
                <option key={b.id} value={b.id}>{b.name || b.address}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">{isRu ? 'Период с' : 'Boshi'}</span>
            <input type="month" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">{isRu ? 'Период по' : 'Oxiri'}</span>
            <input type="month" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white" />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={load}
              disabled={loading || !buildingId}
              className="flex-1 h-10 px-4 rounded-lg bg-brand text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {isRu ? 'Построить' : 'Yaratish'}
            </button>
          </div>
        </div>

        {data && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
            >
              <Printer size={16} /> {isRu ? 'Печать / PDF' : 'Chop etish / PDF'}
            </button>
            {canSave && (
              <button
                onClick={save}
                disabled={saving}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isRu ? 'Сохранить снепшот' : 'Snepshotni saqlash'}
              </button>
            )}
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      </div>

      {/* Отчёт — печатная зона */}
      {data && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          {/* Шапка: тенант слева, Kamizo справа */}
          <div className="p-6 border-b border-slate-200 flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                {isRu ? 'Управляющая организация' : 'Boshqaruv tashkiloti'}
              </div>
              <div className="text-lg font-semibold text-slate-900">
                {tenant?.name || (isRu ? 'УК' : 'BT')}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {data.building.name || data.building.address}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Kamizo · {isRu ? 'Управление домом' : 'Uy boshqaruvi'}</div>
              <div className="text-xs text-slate-400 mt-1">kamizo.uz</div>
            </div>
          </div>

          {/* Мета */}
          <div className="px-6 pt-4 pb-2 flex flex-wrap gap-4 text-sm text-slate-700">
            <div>
              <span className="text-slate-500">{isRu ? 'Период:' : 'Davr:'}</span>{' '}
              <span className="font-medium">{data.period_from} — {data.period_to}</span>
            </div>
            <div>
              <span className="text-slate-500">{isRu ? 'Начислений:' : 'Hisob-kitoblar:'}</span>{' '}
              <span className="font-medium">{data.charges_count ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">{isRu ? 'Оплат:' : 'To‘lovlar:'}</span>{' '}
              <span className="font-medium">{data.payments_count ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">{isRu ? 'Собираемость:' : 'Yig‘ish darajasi:'}</span>{' '}
              <span className="font-medium">{collectionRate}%</span>
            </div>
          </div>

          {/* Таблица */}
          <div className="p-6 overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="text-left py-2 px-3 border border-slate-300 font-medium">{isRu ? 'Статья' : 'Modda'}</th>
                  <th className="text-right py-2 px-3 border border-slate-300 font-medium">{isRu ? 'Долг на начало' : 'Boshi qarz'}</th>
                  <th className="text-right py-2 px-3 border border-slate-300 font-medium">{isRu ? 'Начислено' : 'Hisoblangan'}</th>
                  <th className="text-right py-2 px-3 border border-slate-300 font-medium">{isRu ? 'Оплачено' : 'To‘langan'}</th>
                  <th className="text-right py-2 px-3 border border-slate-300 font-medium">{isRu ? 'Долг на конец' : 'Oxiri qarz'}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="hover:bg-slate-50">
                    <td className="py-2 px-3 border border-slate-300">
                      {r.name}
                      {r.legal_code && <span className="ml-2 text-xs text-slate-400">[{r.legal_code}]</span>}
                    </td>
                    <td className="py-2 px-3 border border-slate-300 text-right tabular-nums">{fmt(r.prior_debt)}</td>
                    <td className="py-2 px-3 border border-slate-300 text-right tabular-nums">{fmt(r.accrued)}</td>
                    <td className="py-2 px-3 border border-slate-300 text-right tabular-nums text-emerald-700">{fmt(r.paid)}</td>
                    <td className={`py-2 px-3 border border-slate-300 text-right tabular-nums ${r.arrears > 0 ? 'text-rose-700' : ''}`}>{fmt(r.arrears)}</td>
                  </tr>
                ))}
                {!data.rows.length && (
                  <tr>
                    <td colSpan={5} className="py-6 px-3 border border-slate-300 text-center text-slate-500">
                      {isRu ? 'Нет начислений за этот период' : 'Bu davr uchun hisob-kitoblar yo‘q'}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold">
                  <td className="py-2 px-3 border border-slate-300">{isRu ? 'ИТОГО' : 'JAMI'}</td>
                  <td className="py-2 px-3 border border-slate-300 text-right tabular-nums">{fmt(data.totals.prior_debt)}</td>
                  <td className="py-2 px-3 border border-slate-300 text-right tabular-nums">{fmt(data.totals.accrued)}</td>
                  <td className="py-2 px-3 border border-slate-300 text-right tabular-nums text-emerald-700">{fmt(data.totals.paid)}</td>
                  <td className={`py-2 px-3 border border-slate-300 text-right tabular-nums ${data.totals.arrears > 0 ? 'text-rose-700' : ''}`}>{fmt(data.totals.arrears)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Прибыль УК: план vs факт */}
          <div className="px-6 pb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              {isRu ? 'Доход управляющей организации' : 'Boshqaruv tashkiloti daromadi'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500 mb-1">{isRu ? 'План' : 'Reja'}</div>
                <div className="text-lg font-semibold tabular-nums">{fmt(data.uk_income_plan)} {isRu ? 'сум' : 'so‘m'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500 mb-1">{isRu ? 'Факт' : 'Fakt'}</div>
                <div className="text-lg font-semibold tabular-nums">{fmt(data.uk_income_fact)} {isRu ? 'сум' : 'so‘m'}</div>
              </div>
            </div>
          </div>

          {/* Подпись + правовое основание */}
          <div className="px-6 pb-6 pt-4 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
            <div className="mb-2">
              {isRu
                ? 'Отчёт сформирован в соответствии со ст.29 Закона Республики Узбекистан «Об управлении многоквартирными домами» (ЗРУ-581).'
                : '​Hisobot O‘zbekiston Respublikasining "Ko‘p kvartirali uylarni boshqarish to‘g‘risida"gi qonuni (ORQ-581) 29-moddasiga muvofiq shakllantirilgan.'}
            </div>
            {data.generated_at && (
              <div>
                {isRu ? 'Дата формирования:' : 'Yaratilgan sana:'} {new Date(data.generated_at).toLocaleString('ru-RU')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

export default FactReportPage;
