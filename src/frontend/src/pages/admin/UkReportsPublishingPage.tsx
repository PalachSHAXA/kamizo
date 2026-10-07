import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Archive, Building2, CalendarDays, Download, FileCheck2, FileText,
  Loader2, RefreshCw, Send, Sparkles, UploadCloud,
} from 'lucide-react';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useTenantStore } from '../../stores/tenantStore';
import {
  adminUkReportsApi, branchesApi, type UkReport, type UkReportType, type WorksPreviewPayload,
} from '../../services/api';
import type { BranchApiResponse } from '../../services/api/buildings';
import { factReportApi, type FactReportPayload } from '../../services/api/finance-v2';
import { downloadBlob } from '../../utils/downloadFile';
import { generateUkReportPdf, type UkReportPreview } from '../../utils/ukReportPdf';
import { getUkReportPreset, validateUkReportPeriod, type UkReportPeriodPreset } from '../../utils/ukReportPeriod';

const MAX_PDF_SIZE = 15 * 1024 * 1024;
const REPORT_TYPES: UkReportType[] = ['financial', 'completed_works'];
type PublishingMode = 'generate' | 'upload';

function reportTypeLabel(type: UkReportType, lang: 'ru' | 'uz') {
  if (type === 'financial') return lang === 'ru' ? 'Финансовый отчёт' : 'Moliyaviy hisobot';
  return lang === 'ru' ? 'Отчёт о выполненных работах' : 'Bajarilgan ishlar hisoboti';
}

function periodLabel(from: string, to: string, lang: 'ru' | 'uz') {
  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
  const format = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(locale);
  return `${format(from)} – ${format(to)}`;
}

function lastDayOfMonth(month: string): string {
  if (!month) return '';
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(year, monthNumber, 0);
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

function formatMoney(value: number, lang: 'ru' | 'uz') {
  return `${new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'uz-UZ').format(value || 0)} ${lang === 'ru' ? 'сум' : 'so‘m'}`;
}

function isFinancialPreview(preview: UkReportPreview): preview is FactReportPayload {
  return 'rows' in preview;
}

export function UkReportsPublishingPage() {
  const language = useLanguageStore(s => s.language);
  const lang = language === 'ru' ? 'ru' : 'uz';
  const buildings = useBuildingStore(s => s.buildings);
  const fetchBuildings = useBuildingStore(s => s.fetchBuildings);
  const isLoadingBuildings = useBuildingStore(s => s.isLoadingBuildings);
  const ukName = useTenantStore(s => s.config?.tenant?.name || 'Kamizo');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<PublishingMode>('generate');
  const [type, setType] = useState<UkReportType>('financial');
  const [branches, setBranches] = useState<BranchApiResponse[]>([]);
  const [branchCode, setBranchCode] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const initialPeriod = getUkReportPreset('month');
  const [dateFrom, setDateFrom] = useState(initialPeriod.from);
  const [dateTo, setDateTo] = useState(initialPeriod.to);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UkReportPreview | null>(null);
  const [reports, setReports] = useState<UkReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState(false);
  const [feedback, setFeedback] = useState('');

  const selectedBuilding = buildings.find(building => building.id === buildingId);
  const filteredBuildings = buildings.filter(building => building.branchCode === branchCode);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setListError(false);
    try {
      setReports(await adminUkReportsApi.list(type));
    } catch {
      setReports([]);
      setListError(true);
    } finally {
      setLoadingReports(false);
    }
  }, [type]);

  useEffect(() => {
    if (buildings.length === 0) void fetchBuildings();
    branchesApi.getAll()
      .then(response => setBranches(response.branches || []))
      .catch(() => setFormError(lang === 'ru' ? 'Не удалось загрузить объекты' : 'Obyektlarni yuklab bo‘lmadi'));
  }, [buildings.length, fetchBuildings, lang]);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const resetResult = () => {
    setPreview(null);
    setFormError('');
    setFeedback('');
  };

  const changeBranch = (value: string) => {
    resetResult();
    setBranchCode(value);
    setBuildingId('');
  };

  const applyPreset = (preset: UkReportPeriodPreset) => {
    const period = getUkReportPreset(preset);
    resetResult();
    setDateFrom(period.from);
    setDateTo(period.to);
  };

  const periodError = () => {
    const code = validateUkReportPeriod(dateFrom, dateTo);
    if (code === 'required') return lang === 'ru' ? 'Укажите начало и конец периода' : 'Davr boshi va oxirini kiriting';
    if (code === 'reversed') return lang === 'ru' ? 'Дата начала не может быть позже даты окончания' : 'Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas';
    if (code === 'too_long') return lang === 'ru' ? 'Период не должен превышать один год' : 'Davr bir yildan oshmasligi kerak';
    return '';
  };

  const createPreview = async () => {
    setFormError('');
    setFeedback('');
    const validationError = periodError();
    if (!branchCode || !buildingId) {
      setFormError(lang === 'ru' ? 'Выберите объект и дом' : 'Obyekt va uyni tanlang');
      return;
    }
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setLoadingPreview(true);
    try {
      const result = type === 'financial'
        ? await factReportApi.preview({ building_id: buildingId, period_from: dateFrom.slice(0, 7), period_to: dateTo.slice(0, 7) })
        : await adminUkReportsApi.worksPreview({ building_id: buildingId, date_from: dateFrom, date_to: dateTo });
      setPreview(result);
    } catch (caught) {
      setPreview(null);
      setFormError(caught instanceof Error ? caught.message : (lang === 'ru' ? 'Не удалось сформировать отчёт' : 'Hisobotni shakllantirib bo‘lmadi'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const makePdf = async (payload: UkReportPreview) => generateUkReportPdf({
    type,
    preview: payload,
    ukName,
    buildingName: selectedBuilding?.name || selectedBuilding?.address || '',
    periodLabel: periodLabel(dateFrom, dateTo, lang),
    language: lang,
  });

  const downloadDraft = async () => {
    if (!preview) return;
    setSubmitting(true);
    setFormError('');
    try {
      const pdf = await makePdf(preview);
      await downloadBlob(pdf.blob, { filename: pdf.filename, language: lang });
    } catch {
      setFormError(lang === 'ru' ? 'Не удалось создать PDF' : 'PDF yaratib bo‘lmadi');
    } finally {
      setSubmitting(false);
    }
  };

  const publishBlob = async (blob: Blob, filename: string, reportTitle: string, reportDescription: string, targetBuildingId: string) => {
    const body = new FormData();
    body.append('report_type', type);
    body.append('title', reportTitle);
    body.append('period_label', periodLabel(dateFrom, dateTo, lang));
    body.append('description', reportDescription);
    if (targetBuildingId) body.append('building_id', targetBuildingId);
    body.append('file', blob, filename);
    await adminUkReportsApi.publish(body);
  };

  const publishGenerated = async () => {
    if (!preview || !buildingId) return;
    setSubmitting(true);
    setFormError('');
    try {
      let payload = preview;
      if (type === 'financial') {
        payload = await factReportApi.save({ building_id: buildingId, period_from: dateFrom.slice(0, 7), period_to: dateTo.slice(0, 7) });
      }
      const pdf = await makePdf(payload);
      await publishBlob(pdf.blob, pdf.filename, reportTypeLabel(type, lang), '', buildingId);
      setFeedback(lang === 'ru' ? 'Отчёт опубликован для жителей' : 'Hisobot aholi uchun e’lon qilindi');
      await loadReports();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : (lang === 'ru' ? 'Не удалось опубликовать отчёт' : 'Hisobotni e’lon qilib bo‘lmadi'));
    } finally {
      setSubmitting(false);
    }
  };

  const selectFile = (selected: File | null) => {
    setFormError('');
    setFile(null);
    if (!selected) return;
    if ((selected.type && selected.type !== 'application/pdf') || !selected.name.toLowerCase().endsWith('.pdf')) {
      setFormError(lang === 'ru' ? 'Выберите файл PDF' : 'PDF faylini tanlang');
      return;
    }
    if (selected.size > MAX_PDF_SIZE) {
      setFormError(lang === 'ru' ? 'Размер PDF не должен превышать 15 МБ' : 'PDF hajmi 15 MB dan oshmasligi kerak');
      return;
    }
    setFile(selected);
  };

  const publishManual = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');
    const validationError = periodError();
    if (!title.trim() || !file) {
      setFormError(lang === 'ru' ? 'Укажите название и выберите PDF' : 'Nomni kiriting va PDF faylini tanlang');
      return;
    }
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (branchCode && !buildingId) {
      setFormError(lang === 'ru' ? 'Выберите дом или укажите область «Вся УК»' : 'Uyni tanlang yoki «Butun BK» qamrovini belgilang');
      return;
    }
    setSubmitting(true);
    try {
      await publishBlob(file, file.name, title.trim(), description.trim(), buildingId);
      setTitle('');
      setDescription('');
      setBranchCode('');
      setBuildingId('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFeedback(lang === 'ru' ? 'PDF опубликован для жителей' : 'PDF aholi uchun e’lon qilindi');
      await loadReports();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : (lang === 'ru' ? 'Не удалось опубликовать PDF' : 'PDFni e’lon qilib bo‘lmadi'));
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (report: UkReport) => {
    if (!window.confirm(lang === 'ru' ? `Архивировать «${report.title}»?` : `«${report.title}» arxivlansinmi?`)) return;
    setArchivingId(report.id);
    try {
      await adminUkReportsApi.archive(report.id);
      setReports(current => current.filter(item => item.id !== report.id));
    } catch {
      setListError(true);
    } finally {
      setArchivingId(null);
    }
  };

  const download = async (report: UkReport) => {
    setDownloadingId(report.id);
    try {
      const blob = await adminUkReportsApi.downloadPdf(report);
      await downloadBlob(blob, { filename: report.file_name || `${report.title}.pdf`, language: lang });
    } catch {
      setListError(true);
    } finally {
      setDownloadingId(null);
    }
  };

  const scopeFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-bold text-stone-700">
        {lang === 'ru' ? 'Объект / ЖК' : 'Obyekt / turar joy majmuasi'}
        <select value={branchCode} onChange={event => changeBranch(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 font-normal outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
          <option value="">{mode === 'upload' ? (lang === 'ru' ? 'Вся УК' : 'Butun BK') : (lang === 'ru' ? 'Выберите объект' : 'Obyektni tanlang')}</option>
          {branches.map(branch => <option key={branch.id} value={branch.code}>{branch.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-bold text-stone-700">
        {lang === 'ru' ? 'Дом' : 'Uy'}
        <select value={buildingId} disabled={!branchCode || isLoadingBuildings} onChange={event => { resetResult(); setBuildingId(event.target.value); }} className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 font-normal outline-none disabled:bg-stone-100 disabled:text-stone-400">
          <option value="">{branchCode ? (lang === 'ru' ? 'Выберите дом' : 'Uyni tanlang') : (lang === 'ru' ? 'Сначала выберите объект' : 'Avval obyektni tanlang')}</option>
          {filteredBuildings.map(building => <option key={building.id} value={building.id}>{building.name || building.address}</option>)}
        </select>
      </label>
      {mode === 'upload' && !branchCode && <p className="sm:col-span-2 -mt-2 text-xs text-stone-500">{lang === 'ru' ? 'Область публикации: все дома управляющей компании.' : 'Nashr qamrovi: boshqaruv kompaniyasining barcha uylari.'}</p>}
    </div>
  );

  const periodFields = (
    <div className="rounded-2xl bg-stone-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-stone-700"><CalendarDays className="h-4 w-4 text-orange-600" />{lang === 'ru' ? 'Отчётный период' : 'Hisobot davri'}</p>
        <div className="flex flex-wrap gap-1.5">
          {(['month', 'quarter', 'year'] as UkReportPeriodPreset[]).map(preset => (
            <button key={preset} type="button" onClick={() => applyPreset(preset)} className="min-h-10 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 hover:border-orange-300">
              {preset === 'month' ? (lang === 'ru' ? 'Текущий месяц' : 'Joriy oy') : preset === 'quarter' ? (lang === 'ru' ? 'Квартал' : 'Chorak') : (lang === 'ru' ? 'Год' : 'Yil')}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {type === 'financial' ? <>
          <label className="text-xs font-semibold text-stone-500">{lang === 'ru' ? 'Начальный месяц' : 'Boshlanish oyi'}<input type="month" required value={dateFrom.slice(0, 7)} onChange={event => { resetResult(); setDateFrom(`${event.target.value}-01`); }} className="mt-1 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900" /></label>
          <label className="text-xs font-semibold text-stone-500">{lang === 'ru' ? 'Конечный месяц' : 'Tugash oyi'}<input type="month" required value={dateTo.slice(0, 7)} onChange={event => { resetResult(); setDateTo(lastDayOfMonth(event.target.value)); }} className="mt-1 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900" /></label>
        </> : <>
          <label className="text-xs font-semibold text-stone-500">{lang === 'ru' ? 'С даты' : 'Boshlanish sanasi'}<input type="date" required value={dateFrom} onChange={event => { resetResult(); setDateFrom(event.target.value); }} className="mt-1 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900" /></label>
          <label className="text-xs font-semibold text-stone-500">{lang === 'ru' ? 'По дату' : 'Tugash sanasi'}<input type="date" required value={dateTo} onChange={event => { resetResult(); setDateTo(event.target.value); }} className="mt-1 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900" /></label>
        </>}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600">{lang === 'ru' ? 'Публикация отчётов' : 'Hisobotlarni e’lon qilish'}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-[-0.035em] text-stone-900">{lang === 'ru' ? 'Отчёты для жителей' : 'Aholi uchun hisobotlar'}</h1>
        <p className="mt-2 text-sm text-stone-500">{lang === 'ru' ? 'Сформируйте отчёт по данным Kamizo или загрузите готовый PDF.' : 'Kamizo ma’lumotlari asosida hisobot yarating yoki tayyor PDF yuklang.'}</p>
      </header>

      <div className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-1 sm:grid-cols-2" role="tablist" aria-label={lang === 'ru' ? 'Способ публикации' : 'Nashr usuli'}>
        {(['generate', 'upload'] as PublishingMode[]).map(item => <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => { resetResult(); setMode(item); setBranchCode(''); setBuildingId(''); }} className={`min-h-12 rounded-xl px-4 text-sm font-bold ${mode === item ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-50'}`}>{item === 'generate' ? (lang === 'ru' ? 'Сформировать в Kamizo' : 'Kamizo’da shakllantirish') : (lang === 'ru' ? 'Загрузить готовый PDF' : 'Tayyor PDF yuklash')}</button>)}
      </div>

      <div className="grid grid-cols-2 rounded-2xl border border-stone-200 bg-white p-1" role="tablist" aria-label={lang === 'ru' ? 'Тип отчёта' : 'Hisobot turi'}>
        {REPORT_TYPES.map(item => <button key={item} type="button" role="tab" aria-selected={type === item} onClick={() => { resetResult(); setType(item); }} className={`min-h-12 rounded-xl px-2 text-xs font-bold sm:text-sm ${type === item ? 'bg-orange-600 text-white' : 'text-stone-500 hover:bg-orange-50'}`}>{reportTypeLabel(item, lang)}</button>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="min-w-0 rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          {mode === 'generate' ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 border-b border-stone-100 pb-4"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-600"><Sparkles className="h-5 w-5" /></div><div><h2 className="font-extrabold text-stone-900">{reportTypeLabel(type, lang)}</h2><p className="text-xs text-stone-500">{lang === 'ru' ? 'Выберите дом и период' : 'Uy va davrni tanlang'}</p></div></div>
              {scopeFields}
              {periodFields}
              {formError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{formError}</div>}
              {feedback && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{feedback}</div>}
              <button type="button" disabled={loadingPreview} onClick={() => void createPreview()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60">{loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loadingPreview ? (lang === 'ru' ? 'Формирование...' : 'Shakllantirilmoqda...') : (lang === 'ru' ? 'Сформировать предварительный просмотр' : 'Ko‘rib chiqish uchun shakllantirish')}</button>

              {preview && (
                <div className="space-y-4 border-t border-stone-100 pt-5">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-orange-600">{lang === 'ru' ? 'Предварительный просмотр' : 'Ko‘rib chiqish'}</p><h3 className="mt-1 text-xl font-extrabold text-stone-900">{selectedBuilding?.name}</h3><p className="text-sm text-stone-500">{periodLabel(dateFrom, dateTo, lang)}</p></div>
                  {isFinancialPreview(preview) ? <FinancialPreview preview={preview} lang={lang} /> : <WorksPreview preview={preview} lang={lang} />}
                  <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={submitting} onClick={() => void downloadDraft()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-stone-300 px-4 text-sm font-bold text-stone-700"><Download className="h-4 w-4" />{lang === 'ru' ? 'Скачать черновик PDF' : 'PDF qoralamasini yuklab olish'}</button><button type="button" disabled={submitting} onClick={() => void publishGenerated()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-60"><Send className="h-4 w-4" />{lang === 'ru' ? 'Опубликовать жителям' : 'Aholi uchun e’lon qilish'}</button></div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={publishManual} className="space-y-5">
              <div className="flex items-center gap-3 border-b border-stone-100 pb-4"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-600"><UploadCloud className="h-5 w-5" /></div><div><h2 className="font-extrabold text-stone-900">{lang === 'ru' ? 'Готовый PDF' : 'Tayyor PDF'}</h2><p className="text-xs text-stone-500">PDF · {lang === 'ru' ? 'до 15 МБ' : '15 MB gacha'}</p></div></div>
              {scopeFields}
              {periodFields}
              <label className="block text-sm font-bold text-stone-700">{lang === 'ru' ? 'Название отчёта' : 'Hisobot nomi'}<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 px-3 font-normal outline-none focus:border-orange-400" /></label>
              <label className="block text-sm font-bold text-stone-700">{lang === 'ru' ? 'Описание (необязательно)' : 'Tavsif (ixtiyoriy)'}<textarea maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-stone-200 px-3 py-2 font-normal outline-none focus:border-orange-400" /></label>
              <label className="block cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center hover:border-orange-300"><input ref={fileInputRef} required type="file" accept="application/pdf,.pdf" onChange={event => selectFile(event.target.files?.[0] || null)} className="sr-only" />{file ? <FileCheck2 className="mx-auto h-7 w-7 text-emerald-600" /> : <FileText className="mx-auto h-7 w-7 text-stone-400" />}<span className="mt-2 block truncate text-sm font-bold text-stone-700">{file?.name || (lang === 'ru' ? 'Выбрать PDF' : 'PDF faylini tanlash')}</span><span className="mt-1 block text-xs text-stone-400">{file ? `${(file.size / 1024 / 1024).toFixed(1)} МБ` : (lang === 'ru' ? 'Максимум 15 МБ' : 'Maksimum 15 MB')}</span></label>
              {formError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{formError}</div>}
              {feedback && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{feedback}</div>}
              <button disabled={submitting} type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 text-sm font-bold text-white disabled:opacity-60"><UploadCloud className="h-4 w-4" />{submitting ? (lang === 'ru' ? 'Публикация...' : 'E’lon qilinmoqda...') : (lang === 'ru' ? 'Опубликовать жителям' : 'Aholi uchun e’lon qilish')}</button>
            </form>
          )}
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-stone-900">{lang === 'ru' ? 'Опубликованные отчёты' : 'E’lon qilingan hisobotlar'}</h2><span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-600">{reports.length}</span></div>
          <div className="space-y-3">
            {loadingReports && [0, 1, 2].map(item => <div key={item} className="h-32 animate-pulse rounded-[20px] border border-stone-200 bg-white" />)}
            {!loadingReports && listError && <button type="button" onClick={() => void loadReports()} className="flex min-h-32 w-full flex-col items-center justify-center rounded-[20px] border border-red-200 bg-red-50 text-sm font-bold text-red-800"><RefreshCw className="mb-2 h-5 w-5" />{lang === 'ru' ? 'Повторить загрузку' : 'Qayta yuklash'}</button>}
            {!loadingReports && !listError && reports.length === 0 && <div className="flex min-h-40 flex-col items-center justify-center rounded-[20px] border border-dashed border-stone-300 bg-white/60 px-5 text-center"><FileText className="h-8 w-8 text-stone-300" /><p className="mt-3 font-bold text-stone-700">{lang === 'ru' ? 'Опубликованных отчётов пока нет' : 'Hozircha e’lon qilingan hisobotlar yo‘q'}</p></div>}
            {!loadingReports && !listError && reports.map(report => <article key={report.id} className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.08em] text-orange-600">{report.period_label}</p><h3 className="mt-1 text-lg font-extrabold text-stone-900">{report.title}</h3>{report.description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-stone-500">{report.description}</p>}<div className="mt-4 flex items-end justify-between gap-3"><p className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-stone-500"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{buildings.find(building => building.id === report.building_id)?.name || (report.building_id ? (lang === 'ru' ? 'Выбранный дом' : 'Tanlangan uy') : (lang === 'ru' ? 'Вся УК' : 'Butun BK'))}</span></p><div className="flex shrink-0 gap-2"><button type="button" disabled={downloadingId === report.id} onClick={() => void download(report)} aria-label={lang === 'ru' ? 'Открыть PDF' : 'PDFni ochish'} className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 text-stone-600 disabled:opacity-50"><Download className="h-4 w-4" /></button><button type="button" disabled={archivingId === report.id} onClick={() => void archive(report)} aria-label={lang === 'ru' ? 'Архивировать' : 'Arxivlash'} className="grid h-11 w-11 place-items-center rounded-xl border border-red-100 text-red-600 disabled:opacity-50"><Archive className="h-4 w-4" /></button></div></div></article>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function FinancialPreview({ preview, lang }: { preview: FactReportPayload; lang: 'ru' | 'uz' }) {
  const metrics = [
    [lang === 'ru' ? 'Начислено' : 'Hisoblandi', preview.totals.accrued],
    [lang === 'ru' ? 'Оплачено' : 'To‘landi', preview.totals.paid],
    [lang === 'ru' ? 'Задолженность' : 'Qarzdorlik', preview.totals.arrears],
  ] as const;
  return <><div className="grid gap-2 sm:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-1 break-words font-extrabold text-stone-900">{formatMoney(value, lang)}</p></div>)}</div><div className="overflow-x-auto rounded-xl border border-stone-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="p-3">{lang === 'ru' ? 'Статья' : 'Modda'}</th><th className="p-3">{lang === 'ru' ? 'Долг на начало' : 'Boshlang‘ich qarz'}</th><th className="p-3">{lang === 'ru' ? 'Начислено' : 'Hisoblandi'}</th><th className="p-3">{lang === 'ru' ? 'Оплачено' : 'To‘landi'}</th><th className="p-3">{lang === 'ru' ? 'Долг' : 'Qarz'}</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={`${row.name}-${index}`} className="border-t border-stone-100"><td className="p-3 font-semibold">{row.name}</td><td className="p-3">{formatMoney(row.prior_debt, lang)}</td><td className="p-3">{formatMoney(row.accrued, lang)}</td><td className="p-3">{formatMoney(row.paid, lang)}</td><td className="p-3">{formatMoney(row.arrears, lang)}</td></tr>)}</tbody></table></div></>;
}

function WorksPreview({ preview, lang }: { preview: WorksPreviewPayload; lang: 'ru' | 'uz' }) {
  const metrics = [
    [lang === 'ru' ? 'Получено заявок' : 'Qabul qilindi', preview.summary.requests_received],
    [lang === 'ru' ? 'Выполнено заявок' : 'Arizalar bajarildi', preview.summary.requests_completed],
    [lang === 'ru' ? 'Плановые работы' : 'Rejali ishlar', preview.summary.work_orders_completed],
  ] as const;
  const items = [...preview.completed_requests, ...preview.completed_work_orders];
  return <><div className="grid gap-2 sm:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-1 text-xl font-extrabold text-stone-900">{value}</p></div>)}</div><div className="rounded-xl border border-stone-200"><h4 className="border-b border-stone-100 p-3 text-sm font-bold text-stone-800">{lang === 'ru' ? 'Список выполненных работ' : 'Bajarilgan ishlar ro‘yxati'}</h4>{items.length === 0 ? <p className="p-4 text-sm text-stone-500">{lang === 'ru' ? 'За выбранный период выполненных работ нет.' : 'Tanlangan davrda bajarilgan ishlar yo‘q.'}</p> : <ul className="divide-y divide-stone-100">{items.map(item => <li key={item.id} className="p-3"><p className="text-sm font-semibold text-stone-800">{item.number ? `${item.number} · ` : ''}{item.title}</p><p className="mt-1 text-xs text-stone-500">{new Date(item.completed_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ')}</p></li>)}</ul>}</div></>;
}
