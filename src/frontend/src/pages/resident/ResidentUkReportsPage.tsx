import { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, Building2, CalendarDays, Download, FileText, RefreshCw, UsersRound } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { ApiError, residentUkReportsApi, type ResidentUkEstimate, type UkReport, type UkReportType } from '../../services/api';
import { downloadBlob } from '../../utils/downloadFile';

type ResidentReportTab = 'estimate' | UkReportType;

const REPORT_TYPES: ResidentReportTab[] = ['estimate', 'financial', 'completed_works'];

function formatDate(value: string, language: 'ru' | 'uz') {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
}

function formatPeriod(value: string, language: 'ru' | 'uz') {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
    month: 'long', year: 'numeric',
  });
}

function formatNumber(value: number, language: 'ru' | 'uz', maximumFractionDigits = 0) {
  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
    maximumFractionDigits,
  }).format(value);
}

function modelLabel(model: ResidentUkEstimate['estimate']['model'], language: 'ru' | 'uz') {
  const labels = {
    TARIFF_CALCULATED: language === 'ru' ? 'Рассчитан по расходам дома' : 'Uy xarajatlari asosida hisoblangan',
    TARIFF_MANUAL: language === 'ru' ? 'Утверждённый фиксированный тариф' : 'Tasdiqlangan qat’iy tarif',
    TARIFF_FLAT: language === 'ru' ? 'Общие расходы разделены на площадь дома' : 'Umumiy xarajatlar uy maydoniga bo‘lingan',
  };
  return labels[model];
}

function sectionLabel(section: string, language: 'ru' | 'uz') {
  if (section === 'production') return language === 'ru' ? 'Содержание дома' : 'Uyga xizmat ko‘rsatish';
  if (section === 'periodic') return language === 'ru' ? 'Периодические расходы' : 'Davriy xarajatlar';
  return language === 'ru' ? 'Другие расходы' : 'Boshqa xarajatlar';
}

function incomeLabel(type: string, language: 'ru' | 'uz') {
  const labels: Record<string, [string, string]> = {
    commercial: ['Коммерческие помещения', 'Tijorat binolari'],
    basement: ['Подвальные помещения', 'Yerto‘la xonalari'],
    parking: ['Парковка', 'Avtoturargoh'],
    telecom: ['Телеком-операторы', 'Telekom operatorlari'],
    advertising: ['Реклама', 'Reklama'],
    other: ['Другие доходы', 'Boshqa daromadlar'],
  };
  const label = labels[type];
  return label ? label[language === 'ru' ? 0 : 1] : type;
}

export function ResidentUkReportsPage() {
  const language = useLanguageStore(s => s.language);
  const buildingId = useAuthStore(s => s.user?.buildingId);
  const buildings = useBuildingStore(s => s.buildings);
  const fetchBuildingById = useBuildingStore(s => s.fetchBuildingById);
  const lang = language === 'ru' ? 'ru' : 'uz';
  const [type, setType] = useState<ResidentReportTab>('estimate');
  const [estimate, setEstimate] = useState<ResidentUkEstimate | null>(null);
  const [reports, setReports] = useState<UkReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadReports = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      if (type === 'estimate') {
        const nextEstimate = await residentUkReportsApi.estimate();
        if (currentRequest === requestId.current) setEstimate(nextEstimate);
      } else {
        const nextReports = await residentUkReportsApi.list(type);
        if (currentRequest === requestId.current) setReports(nextReports);
      }
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      if (type === 'estimate' && loadError instanceof ApiError && loadError.status === 404) {
        setEstimate(null);
      } else {
        if (type === 'estimate') setEstimate(null);
        else setReports([]);
        setError(true);
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (buildingId && !buildings.some(building => building.id === buildingId)) {
      void fetchBuildingById(buildingId);
    }
  }, [buildingId, buildings, fetchBuildingById]);

  const downloadReport = async (report: UkReport) => {
    setDownloadingId(report.id);
    try {
      const blob = await residentUkReportsApi.downloadPdf(report);
      await downloadBlob(blob, {
        filename: report.file_name || `${report.title}.pdf`,
        language: lang,
      });
    } catch {
      setError(true);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl pb-24 md:pb-8">
      <section className="overflow-hidden rounded-[26px] bg-[#2A2018] px-5 py-6 text-[#F4F0E8] shadow-[0_18px_50px_-30px_rgba(42,32,24,0.7)] sm:px-7 sm:py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-300">
              {lang === 'ru' ? 'Прозрачность управления' : 'Boshqaruv shaffofligi'}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl">
              {lang === 'ru' ? 'Отчёт УК' : 'UK hisoboti'}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-stone-300">
              {lang === 'ru'
                ? 'Смета, финансовые документы и результаты работ по вашему дому.'
                : 'Uyingiz bo‘yicha smeta, moliyaviy hujjatlar va bajarilgan ishlar natijalari.'}
            </p>
          </div>
          <div className="hidden h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 sm:grid">
            <FileText className="h-7 w-7 text-orange-300" strokeWidth={1.8} />
          </div>
        </div>
      </section>

      <div className="mt-5 flex overflow-hidden rounded-2xl border border-stone-200 bg-white p-1 shadow-sm" role="tablist">
        {REPORT_TYPES.map(item => {
          const active = type === item;
          const shortLabel = item === 'estimate'
            ? (lang === 'ru' ? 'Смета' : 'Smeta')
            : item === 'financial'
              ? (lang === 'ru' ? 'Финансы' : 'Moliya')
              : (lang === 'ru' ? 'Работы' : 'Ishlar');
          const fullLabel = item === 'estimate'
            ? (lang === 'ru' ? 'Смета' : 'Smeta')
            : item === 'financial'
              ? (lang === 'ru' ? 'Финансовый отчёт' : 'Moliyaviy hisobot')
              : (lang === 'ru' ? 'Выполненные работы' : 'Bajarilgan ishlar');
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-label={fullLabel}
              aria-selected={active}
              onClick={() => setType(item)}
              className={`h-12 min-w-0 flex-1 whitespace-nowrap rounded-xl px-1 text-xs font-bold transition-colors active:scale-[0.98] sm:px-2 sm:text-sm ${active ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'}`}
            >
              <span aria-hidden="true" className="sm:hidden">{shortLabel}</span>
              <span aria-hidden="true" className="hidden sm:inline">{fullLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-3" role="tabpanel">
        {loading && [0, 1, 2].map(item => (
          <div key={item} className="animate-pulse rounded-[22px] border border-stone-200 bg-white p-5">
            <div className="h-3 w-28 rounded bg-stone-200" />
            <div className="mt-4 h-5 w-3/4 rounded bg-stone-200" />
            <div className="mt-3 h-3 w-full rounded bg-stone-100" />
            <div className="mt-2 h-3 w-2/3 rounded bg-stone-100" />
          </div>
        ))}

        {!loading && error && (
          <div className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-8 text-center">
            <p className="font-bold text-red-900">
              {type === 'estimate'
                ? (lang === 'ru' ? 'Не удалось загрузить смету' : 'Smetani yuklab bo‘lmadi')
                : (lang === 'ru' ? 'Не удалось загрузить отчёты' : 'Hisobotlarni yuklab bo‘lmadi')}
            </p>
            <button type="button" onClick={() => void loadReports()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-900 px-4 text-sm font-bold text-white active:scale-[0.98]">
              <RefreshCw className="h-4 w-4" />
              {lang === 'ru' ? 'Повторить' : 'Qayta urinish'}
            </button>
          </div>
        )}

        {!loading && !error && type === 'estimate' && !estimate && (
          <div className="rounded-[22px] border border-dashed border-stone-300 bg-white/60 px-5 py-12 text-center">
            <Banknote className="mx-auto h-9 w-9 text-stone-300" strokeWidth={1.5} />
            <p className="mt-4 font-bold text-stone-800">{lang === 'ru' ? 'Действующей сметы пока нет' : 'Hozircha amaldagi smeta yo‘q'}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
              {lang === 'ru' ? 'После утверждения сметы здесь появятся тариф и подробный состав расходов.' : 'Smeta tasdiqlangach, bu yerda tarif va xarajatlarning batafsil tarkibi paydo bo‘ladi.'}
            </p>
          </div>
        )}

        {!loading && !error && type === 'estimate' && estimate && (
          <EstimateDetails data={estimate} language={lang} />
        )}

        {!loading && !error && type !== 'estimate' && reports.length === 0 && (
          <div className="rounded-[22px] border border-dashed border-stone-300 bg-white/60 px-5 py-12 text-center">
            <FileText className="mx-auto h-9 w-9 text-stone-300" strokeWidth={1.5} />
            <p className="mt-4 font-bold text-stone-800">{lang === 'ru' ? 'Отчётов пока нет' : 'Hozircha hisobotlar yo‘q'}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
              {lang === 'ru' ? 'Опубликованные управляющей компанией документы появятся здесь.' : 'Boshqaruv kompaniyasi e’lon qilgan hujjatlar shu yerda paydo bo‘ladi.'}
            </p>
          </div>
        )}

        {!loading && !error && type !== 'estimate' && reports.map(report => (
          <article key={report.id} className="rounded-[22px] border border-stone-200 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(28,25,23,0.45)] sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-orange-700">
                  <span>{report.period_label}</span>
                  <span className="text-stone-300">/</span>
                  <span className="normal-case tracking-normal text-stone-400">{formatDate(report.published_at, lang)}</span>
                </div>
                <h2 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-stone-900">{report.title}</h2>
                {report.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-6 text-stone-600">{report.description}</p>}
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600">
                  <Building2 className="h-3.5 w-3.5" />
                  {buildings.find(building => building.id === report.building_id)?.name || (report.building_id ? (lang === 'ru' ? 'Ваш дом' : 'Sizning uyingiz') : (lang === 'ru' ? 'Вся УК' : 'Butun UK'))}
                </div>
              </div>
              <button
                type="button"
                disabled={downloadingId === report.id}
                onClick={() => void downloadReport(report)}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 text-sm font-bold text-white transition-colors hover:bg-orange-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              >
                <Download className={`h-4 w-4 ${downloadingId === report.id ? 'animate-bounce' : ''}`} />
                {downloadingId === report.id
                  ? (lang === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                  : (lang === 'ru' ? 'Открыть PDF' : 'PDF ni ochish')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function EstimateDetails({ data, language }: { data: ResidentUkEstimate; language: 'ru' | 'uz' }) {
  const tariff = data.tariff.vat_enabled ? data.tariff.tariff_with_vat : data.tariff.per_sqm;
  const money = (value: number) => `${formatNumber(value, language, 2)} ${language === 'ru' ? 'сум' : "so‘m"}`;
  const period = formatPeriod(data.estimate.period, language);
  const scope = data.estimate.scope_level === 'complex'
    ? (language === 'ru' ? 'Смета рассчитана для жилого комплекса' : 'Smeta turar joy majmuasi uchun hisoblangan')
    : (language === 'ru' ? 'Смета рассчитана для вашего дома' : 'Smeta sizning uyingiz uchun hisoblangan');

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] bg-stone-900 text-white shadow-[0_16px_40px_-28px_rgba(28,25,23,0.8)]">
        <div className="grid gap-6 p-5 sm:grid-cols-[1.25fr_0.75fr] sm:p-7">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-300">
              {language === 'ru' ? 'Действующий тариф' : 'Amaldagi tarif'}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="break-all text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">{formatNumber(tariff, language, 2)}</span>
              <span className="text-sm font-semibold text-stone-300">{language === 'ru' ? 'сум / м² в месяц' : "so‘m / m² oyiga"}</span>
            </div>
            {data.tariff.vat_enabled && (
              <p className="mt-2 text-xs text-stone-400">
                {language === 'ru' ? `Включая НДС ${formatNumber(data.tariff.vat_rate * 100, language, 2)}%` : `QQS bilan ${formatNumber(data.tariff.vat_rate * 100, language, 2)}%`}
              </p>
            )}
            <div className="mt-5 border-t border-white/10 pt-4 text-sm leading-6 text-stone-300">
              {language === 'ru'
                ? 'Начисление за вашу квартиру = площадь квартиры × тариф.'
                : 'Xonadoningiz uchun to‘lov = xonadon maydoni × tarif.'}
            </div>
          </div>
          <div className="min-w-0 border-t border-white/10 pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <p className="break-words text-lg font-bold">{data.estimate.title}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /><div><dt className="text-stone-400">{language === 'ru' ? 'Период' : 'Davr'}</dt><dd className="font-semibold capitalize">{period}</dd></div></div>
              <div className="flex items-start gap-2.5"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /><div className="min-w-0"><dt className="text-stone-400">{language === 'ru' ? 'Дом' : 'Uy'}</dt><dd className="break-words font-semibold">{data.building.name}</dd>{data.building.address && <dd className="break-words text-xs text-stone-400">{data.building.address}</dd>}</div></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-stone-200 bg-white p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={language === 'ru' ? 'Площадь дома' : 'Uy maydoni'} value={`${formatNumber(data.building.residential_area, language, 2)} м²`} />
          <Metric label={language === 'ru' ? 'Расходы в месяц' : 'Oylik xarajatlar'} value={money(data.summary.monthly_expenses)} />
          <Metric label={language === 'ru' ? 'Расходы в год' : 'Yillik xarajatlar'} value={money(data.summary.annual_expenses)} />
          <Metric label={language === 'ru' ? 'Экономия жителей в год' : 'Aholining yillik tejami'} value={money(data.summary.annual_savings)} accent />
        </div>
        <div className="mt-5 grid gap-3 border-t border-stone-100 pt-5 text-sm sm:grid-cols-2">
          <div><span className="text-stone-500">{language === 'ru' ? 'Как рассчитано: ' : 'Hisoblash usuli: '}</span><strong className="text-stone-800">{modelLabel(data.estimate.model, language)}</strong></div>
          <div><span className="text-stone-500">{language === 'ru' ? 'Охват: ' : 'Qamrov: '}</span><strong className="text-stone-800">{scope}</strong></div>
          <div><span className="text-stone-500">{language === 'ru' ? 'Действует с: ' : 'Amal qilish sanasi: '}</span><strong className="text-stone-800">{formatDate(data.estimate.effective_date, language)}</strong></div>
          <div><span className="text-stone-500">{language === 'ru' ? 'Другие доходы уменьшают платёж: ' : 'Boshqa daromadlar to‘lovni kamaytiradi: '}</span><strong className="text-emerald-700">{money(data.summary.monthly_income_offsets)} / {language === 'ru' ? 'мес.' : 'oy'}</strong></div>
          {data.summary.show_profit && (
            <div><span className="text-stone-500">{language === 'ru' ? 'Прибыль УК: ' : 'BK foydasi: '}</span><strong className="text-stone-800">{formatNumber(data.summary.profit_percent ?? 0, language, 2)}%</strong></div>
          )}
        </div>
      </section>

      <EstimateTable
        icon={<UsersRound className="h-5 w-5" />}
        title={language === 'ru' ? 'Штат и фонд оплаты труда' : 'Xodimlar va ish haqi fondi'}
        description={language === 'ru' ? `Только должности, без персональных данных. ФОТ в месяц: ${money(data.summary.fot_monthly)}.` : `Faqat lavozimlar, shaxsiy ma’lumotlarsiz. Oylik ish haqi fondi: ${money(data.summary.fot_monthly)}.`}
        headers={language === 'ru' ? ['Должность', 'Единицы', 'Фонд в месяц'] : ['Lavozim', 'Birlik', 'Oylik fond']}
        rows={data.staff.map(item => [item.title, formatNumber(item.units, language, 2), money(item.monthly_fund)])}
        empty={language === 'ru' ? 'Штатные позиции не указаны.' : 'Shtat lavozimlari ko‘rsatilmagan.'}
      />

      <EstimateTable
        icon={<FileText className="h-5 w-5" />}
        title={language === 'ru' ? 'Состав расходов' : 'Xarajatlar tarkibi'}
        description={language === 'ru' ? 'Все статьи, включённые в расчёт тарифа.' : 'Tarif hisobiga kiritilgan barcha moddalar.'}
        headers={language === 'ru' ? ['Статья', 'В месяц', 'В год'] : ['Modda', 'Oyiga', 'Yiliga']}
        rows={data.expenses.map(item => [`${item.name} · ${sectionLabel(item.section, language)}`, money(item.monthly), money(item.annual)])}
        empty={language === 'ru' ? 'Статьи расходов не указаны.' : 'Xarajat moddalari ko‘rsatilmagan.'}
      />

      <EstimateTable
        icon={<Banknote className="h-5 w-5" />}
        title={language === 'ru' ? 'Доходы, уменьшающие тариф' : 'Tarifni kamaytiradigan daromadlar'}
        description={language === 'ru' ? 'Эти поступления компенсируют часть расходов дома и дают экономию жителям.' : 'Bu tushumlar uy xarajatlarining bir qismini qoplaydi va aholiga tejash imkonini beradi.'}
        headers={language === 'ru' ? ['Источник', 'В месяц', 'В год'] : ['Manba', 'Oyiga', 'Yiliga']}
        rows={data.incomes.map(item => [incomeLabel(item.type, language), money(item.monthly), money(item.annual)])}
        empty={language === 'ru' ? 'Дополнительные доходы не предусмотрены.' : 'Qo‘shimcha daromadlar ko‘zda tutilmagan.'}
      />
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 border-l-2 border-stone-200 pl-3">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className={`mt-1 break-words text-lg font-extrabold tracking-[-0.02em] ${accent ? 'text-emerald-700' : 'text-stone-900'}`}>{value}</p>
    </div>
  );
}

function EstimateTable({ icon, title, description, headers, rows, empty }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  headers: [string, string, string];
  rows: string[][];
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-stone-200 bg-white">
      <div className="flex items-start gap-3 px-5 py-5 sm:px-6">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">{icon}</div>
        <div className="min-w-0"><h2 className="font-extrabold text-stone-900">{title}</h2><p className="mt-1 text-sm leading-5 text-stone-500">{description}</p></div>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-stone-100 px-5 py-5 text-sm text-stone-500 sm:px-6">{empty}</p>
      ) : (
        <div role="table" className="border-t border-stone-100 text-sm">
          <div role="row" className="grid grid-cols-[minmax(0,1.35fr)_minmax(64px,0.65fr)_minmax(88px,0.8fr)] gap-2 bg-stone-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-stone-500 sm:px-6 sm:text-xs">
            {headers.map(header => <div key={header} role="columnheader" className="min-w-0 break-words last:text-right">{header}</div>)}
          </div>
          <div className="divide-y divide-stone-100">
            {rows.map((row, index) => (
              <div key={`${row[0]}-${index}`} role="row" className="grid grid-cols-[minmax(0,1.35fr)_minmax(64px,0.65fr)_minmax(88px,0.8fr)] gap-2 px-3 py-3 sm:px-6">
                {row.map((cell, cellIndex) => <div key={cellIndex} role="cell" className={`min-w-0 break-words ${cellIndex === 0 ? 'font-semibold text-stone-800' : 'text-stone-600'} ${cellIndex === 2 ? 'text-right font-semibold tabular-nums' : ''}`}>{cell}</div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
