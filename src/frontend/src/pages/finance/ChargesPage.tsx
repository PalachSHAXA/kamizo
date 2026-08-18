import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Receipt,
  Building2,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  ArrowUpCircle,
  CreditCard,
  Banknote,
  Landmark,
  Globe,
} from 'lucide-react';
import { useFinanceStore } from '../../stores/financeStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { financeApi } from '../../services/api/finance';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';
import { ResidentFinancePage } from './ResidentFinancePage';
import { FinanceDemoReadOnlyBanner } from './FinanceDemoReadOnlyBanner';

/* ─── helpers ──────────────────────────────────────────── */

const fmt = (v: unknown): string => {
  const n = Number(v) || 0;
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' сум';
};

const statusColor: Record<string, { bg: string; text: string }> = {
  paid: { bg: 'bg-green-100', text: 'text-green-700' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700' },
  pending: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

const paymentTypeIcon: Record<string, React.ReactNode> = {
  cash: <Banknote className="w-4 h-4" />,
  card: <CreditCard className="w-4 h-4" />,
  transfer: <Landmark className="w-4 h-4" />,
  online: <Globe className="w-4 h-4" />,
};

interface PaymentAttempt {
  key: string;
  targetId: string;
  fingerprint: string;
}

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/* ─── component ────────────────────────────────────────── */

// Residents (and commercial_owner-style tenants) see the Claude Design
// §09-oplata redesign — sticky header, dark balance card, accordion
// charges list, real getCharges/getPayments wiring. Staff (admin /
// director / manager) keep the full filter + payments UX in StaffChargesPage.
export default function ChargesPage() {
  const userRole = useAuthStore((s) => s.user?.role);
  if (userRole === 'resident' || userRole === 'tenant' || userRole === 'commercial_owner') {
    return <ResidentFinancePage />;
  }
  return <StaffChargesPage />;
}

function StaffChargesPage() {
  const language = useLanguageStore((s) => s.language);
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const buildings = useBuildingStore((s) => s.buildings);
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);

  const charges = useFinanceStore((s) => s.charges);
  const chargesLoading = useFinanceStore((s) => s.chargesLoading);
  const chargesPagination = useFinanceStore((s) => s.chargesPagination);
  const chargesSummary = useFinanceStore((s) => s.chargesSummary);
  const fetchCharges = useFinanceStore((s) => s.fetchCharges);
  const fetchChargesSummary = useFinanceStore((s) => s.fetchChargesSummary);
  const createPayment = useFinanceStore((s) => s.createPayment);
  const filters = useFinanceStore((s) => s.filters);
  const setFilters = useFinanceStore((s) => s.setFilters);

  const user = useAuthStore((s) => s.user);
  const isResident = user?.role === 'resident' || user?.role === 'tenant';
  const isDemoSession = user?.demoSession === true;

  /* building statuses for residents */
  const [buildingStatuses, setBuildingStatuses] = useState<{ apartment_number: string; status: string }[]>([]);

  const [loadError, setLoadError] = useState(false);

  /* local filter state — committed on Apply */
  // Default to current month when store filter is empty (prevents "--------- ---- г." rendering)
  const getCurrentPeriod = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const [localBuilding, setLocalBuilding] = useState(filters.buildingId);
  const [localPeriod, setLocalPeriod] = useState(filters.period || getCurrentPeriod());
  const [localStatus, setLocalStatus] = useState(filters.status);

  /* detail modal */
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState('cash');
  const [payDesc, setPayDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const paymentAttemptRef = useRef<PaymentAttempt | null>(null);
  const paymentTargetRef = useRef<string | null>(null);
  const paymentModalContentRef = useRef<HTMLDivElement>(null);

  /* ── mount: load buildings ── */
  useEffect(() => {
    if (buildings.length === 0) fetchBuildings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── when filters change → fetch data ── */
  useEffect(() => {
    const load = async () => {
      try {
        setLoadError(false);
        await fetchCharges(1);
        if (filters.buildingId) {
          await fetchChargesSummary(filters.buildingId, filters.period || undefined);
        } else {
          await fetchChargesSummary('', filters.period || undefined);
        }
      } catch {
        setLoadError(true);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.buildingId, filters.period, filters.status]);

  /* fetch building charge statuses for residents */
  useEffect(() => {
    if (isResident && user?.buildingId) {
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      financeApi.getBuildingChargeStatus(user.buildingId, period)
        .then((res) => setBuildingStatuses(res.statuses || []))
        .catch(() => setBuildingStatuses([]));
    }
  }, [isResident, user?.buildingId]);  

  useEffect(() => {
    const dialog = paymentModalContentRef.current?.closest('[role="dialog"]');
    if (!dialog) return;
    dialog.setAttribute('aria-busy', String(submitting));
    return () => dialog.removeAttribute('aria-busy');
  }, [selected, submitting]);

  const applyFilters = useCallback(() => {
    setFilters({ buildingId: localBuilding, period: localPeriod, status: localStatus });
  }, [localBuilding, localPeriod, localStatus, setFilters]);

  /* ── pagination helpers ── */
  const pag = chargesPagination as { page?: number; totalPages?: number; hasNext?: boolean; hasPrev?: boolean } | null;
  const currentPage = pag?.page ?? 1;
  const totalPages = pag?.totalPages ?? 1;

  const goPage = useCallback(
    (p: number) => fetchCharges(p),
    [fetchCharges],
  );

  /* ── summary data ── */
  const summary = chargesSummary as {
    total_charged?: number;
    total_paid?: number;
    total_debt?: number;
    total_overpaid?: number;
  } | null;

  /* ── breakdown parser ── */
  const parseBreakdown = useMemo(() => {
    if (!selected) return [];
    try {
      const raw = selected.amount_breakdown;
      if (!raw) return [];
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
      if (typeof parsed === 'object') return Object.entries(parsed).map(([k, v]) => ({ name: k, amount: v }));
      return [];
    } catch {
      return [];
    }
  }, [selected]);

  /* ── status label ── */
  const statusLabel = useCallback(
    (s: string) => {
      const map: Record<string, string> = {
        paid: t('Оплачено', 'To\'langan'),
        partial: t('Частично', 'Qisman'),
        overdue: t('Просрочено', 'Muddati o\'tgan'),
        pending: t('Ожидает', 'Kutilmoqda'),
      };
      return map[s] || s;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- i18n t function is recreated on each render — disabling exhaustive-deps to avoid spurious memo invalidation
    [language],
  );

  /* ── type badge ── */
  const typeBadge = useCallback(
    (tp: unknown) => {
      if (tp === 'commercial')
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
            {t('Коммерч.', 'Tijorat')}
          </span>
        );
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          {t('Жилое', 'Turar-joy')}
        </span>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- i18n t function is recreated on each render — disabling exhaustive-deps to avoid spurious memo invalidation
    [language],
  );

  const openPaymentTarget = useCallback((charge: Record<string, unknown>) => {
    if (isDemoSession || submittingRef.current) return;
    const targetId = charge.apartment_id as string;
    if (paymentTargetRef.current !== targetId) {
      paymentTargetRef.current = targetId;
      paymentAttemptRef.current = null;
    }
    setSelected(charge);
  }, [isDemoSession]);

  const resetPaymentTarget = useCallback(() => {
    paymentAttemptRef.current = null;
    paymentTargetRef.current = null;
    setSelected(null);
    setPayAmount('');
    setPayType('cash');
    setPayDesc('');
  }, []);

  const closePaymentTarget = useCallback(() => {
    if (submittingRef.current) return;
    resetPaymentTarget();
  }, [resetPaymentTarget]);

  const activateChargeFromKeyboard = useCallback((event: React.KeyboardEvent, charge: Record<string, unknown>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPaymentTarget(charge);
  }, [openPaymentTarget]);

  /* ── payment submit ── */
  const handlePay = useCallback(async () => {
    if (isDemoSession || submittingRef.current || !selected || !payAmount) return;
    submittingRef.current = true;
    setSubmitting(true);
    const normalizedDescription = payDesc.trim() || undefined;
    const payload = {
      apartment_id: selected.apartment_id as string,
      amount: Number(payAmount),
      payment_type: payType,
      description: normalizedDescription,
    } as Parameters<typeof createPayment>[0];
    const targetId = payload.apartment_id;
    const fingerprint = JSON.stringify(payload);
    let attempt = paymentAttemptRef.current;
    if (!attempt || attempt.targetId !== targetId || attempt.fingerprint !== fingerprint) {
      attempt = { key: createIdempotencyKey(), targetId, fingerprint };
      paymentAttemptRef.current = attempt;
    }
    try {
      const ok = await createPayment(payload, attempt.key);
      if (ok && paymentAttemptRef.current === attempt && paymentTargetRef.current === targetId) {
        resetPaymentTarget();
        fetchCharges(currentPage);
        if (filters.buildingId) fetchChargesSummary(filters.buildingId, filters.period || undefined);
      }
    } catch {
      // The store normally converts API failures to false after showing its toast.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [isDemoSession, selected, payAmount, payType, payDesc, createPayment, resetPaymentTarget, fetchCharges, currentPage, filters, fetchChargesSummary]);

  /* ── render ── */
  if (chargesLoading && charges.length === 0) return <PageSkeleton variant="list" />;

  const summaryCards = [
    {
      label: t('Начислено', 'Hisoblangan'),
      value: fmt(summary?.total_charged),
      icon: <Banknote className="w-5 h-5" />,
      color: 'text-primary-600',
      bg: 'bg-primary-50',
    },
    {
      label: t('Оплачено', 'To\'langan'),
      value: fmt(summary?.total_paid),
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: t('Долг', 'Qarz'),
      value: fmt(summary?.total_debt),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: t('Переплата', 'Ortiqcha to\'lov'),
      value: fmt(summary?.total_overpaid),
      icon: <ArrowUpCircle className="w-5 h-5" />,
      color: 'text-primary-600',
      bg: 'bg-primary-50',
    },
  ];

  return (
    <div className="admin-form-controls w-full min-w-0 space-y-6 pb-24 md:pb-0">
      {/* Header — Sprint 40: brand-orange avatar */}
      <div className="flex min-w-0 flex-col items-stretch gap-3 px-1 min-[360px]:flex-row min-[360px]:items-center">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
          <Receipt className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('Начисления', "Hisob-kitob")}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('Учёт коммунальных платежей', "Kommunal to'lovlar")}</p>
        </div>
      </div>

      {isDemoSession && <FinanceDemoReadOnlyBanner />}

      {/* ── Filter bar ── */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col items-stretch gap-3 min-[360px]:flex-row min-[360px]:flex-wrap min-[360px]:items-end">
          {/* Building */}
          <div className="flex w-full min-w-0 flex-col gap-1 min-[360px]:w-auto min-[360px]:min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {t('Комплекс', 'Kompleks')}
            </label>
            <select
              value={localBuilding}
              onChange={(e) => setLocalBuilding(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            >
              <option value="">{t('Все комплексы', 'Barcha komplekslar')}</option>
              {buildings.map((b) => (
                <option key={b.id as string} value={b.id as string}>
                  {b.name as string}
                </option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div className="flex w-full min-w-0 flex-col gap-1 min-[360px]:w-auto min-[360px]:min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {t('Период', 'Davr')}
            </label>
            <input
              type="month"
              value={localPeriod}
              onChange={(e) => setLocalPeriod(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            />
          </div>

          {/* Status */}
          <div className="flex w-full min-w-0 flex-col gap-1 min-[360px]:w-auto min-[360px]:min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              {t('Статус', 'Holat')}
            </label>
            <select
              value={localStatus}
              onChange={(e) => setLocalStatus(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            >
              <option value="">{t('Все', 'Barchasi')}</option>
              <option value="pending">{t('Ожидает', 'Kutilmoqda')}</option>
              <option value="paid">{t('Оплачено', 'To\'langan')}</option>
              <option value="partial">{t('Частично', 'Qisman')}</option>
              <option value="overdue">{t('Просрочено', 'Muddati o\'tgan')}</option>
            </select>
          </div>

          {/* Apply */}
          <button
            onClick={applyFilters}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-5 text-sm font-medium text-white transition-colors hover:bg-primary-600 min-[360px]:w-auto"
          >
            <Filter className="w-4 h-4" />
            {t('Применить', 'Qo\'llash')}
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="charges-kpi-grid grid gap-3 sm:gap-4">
        {summaryCards.map((c) => (
          <div
            key={c.label}
            className="min-w-0 bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 shrink-0 rounded-lg ${c.bg} flex items-center justify-center ${c.color}`}>
              {c.icon}
            </div>
            <div className="min-w-0">
              <p className="break-words text-xs text-gray-500">{c.label}</p>
              <p className={`break-words text-base min-[375px]:text-lg font-semibold ${c.color}`}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      {loadError && charges.length === 0 ? (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm">
          <EmptyState
            icon={<AlertTriangle className="w-12 h-12" />}
            title={t('Ошибка загрузки', 'Yuklashda xatolik')}
            description={t('Попробуйте обновить страницу', 'Sahifani yangilang')}
          />
        </div>
      ) : charges.length === 0 && !chargesLoading ? (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm">
          <EmptyState
            icon={<Receipt className="w-12 h-12" />}
            title={t('Нет начислений', 'Hisob-kitoblar yo\'q')}
            description={t(
              'Измените фильтры или сформируйте начисления из раздела «Сметы»',
              'Filtrlarni o\'zgartiring yoki "Smetalar" bo\'limidan hisob-kitoblarni yarating',
            )}
          />
        </div>
      ) : (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-50">
            {charges.map((ch) => {
              const charged = Number(ch.amount) || 0;
              const paid = Number(ch.paid_amount) || 0;
              const debt = charged - paid;
              const st = (ch.status as string) || 'pending';
              const sc = statusColor[st] || statusColor.pending;
              return (
                <div key={ch.id as string}
                  role={isDemoSession ? undefined : 'button'}
                  tabIndex={isDemoSession ? undefined : 0}
                  aria-label={isDemoSession ? undefined : `${t('Открыть оплату квартиры', 'Xonadon to\'lovini ochish')} ${ch.apartment_number as string}`}
                  onClick={isDemoSession ? undefined : () => openPaymentTarget(ch)}
                  onKeyDown={isDemoSession ? undefined : (event) => activateChargeFromKeyboard(event, ch)}
                  className={`p-4 transition-colors ${isDemoSession ? '' : 'hover:bg-primary-50/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-semibold text-gray-800">{t('Кв.', 'Xon.')} {ch.apartment_number as string}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>{statusLabel(st)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-gray-400 text-xs">{t('Начислено', 'Hisoblan.')}</p><p className="font-medium text-gray-800">{fmt(charged)}</p></div>
                    <div><p className="text-gray-400 text-xs">{t('Оплачено', "To'langan")}</p><p className="font-medium text-green-600">{fmt(paid)}</p></div>
                    <div><p className="text-gray-400 text-xs">{t('Долг', 'Qarz')}</p><p className="font-medium text-red-600">{debt > 0 ? fmt(debt) : '—'}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    {t('Квартира', 'Xonadon')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    {t('Тип', 'Turi')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">
                    {t('Площадь', 'Maydon')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">
                    {t('Начислено', 'Hisoblangan')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">
                    {t('Оплачено', 'To\'langan')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">
                    {t('Долг', 'Qarz')}
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">
                    {t('Статус', 'Holat')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {charges.map((ch) => {
                  const charged = Number(ch.amount) || 0;
                  const paid = Number(ch.paid_amount) || 0;
                  const debt = charged - paid;
                  const st = (ch.status as string) || 'pending';
                  const sc = statusColor[st] || statusColor.pending;
                  return (
                    <tr
                      key={ch.id as string}
                      onClick={isDemoSession ? undefined : () => openPaymentTarget(ch)}
                      className={`border-b border-gray-50 transition-colors ${isDemoSession ? '' : 'hover:bg-primary-50/40 cursor-pointer'}`}
                    >
                      <td className="px-4 py-0 font-medium text-gray-800">
                        {isDemoSession ? (
                          <span>{ch.apartment_number as string}</span>
                        ) : <button
                          type="button"
                          aria-label={`${t('Открыть оплату квартиры', 'Xonadon to\'lovini ochish')} ${ch.apartment_number as string}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openPaymentTarget(ch);
                          }}
                          onKeyDown={(event) => activateChargeFromKeyboard(event, ch)}
                          className="inline-flex min-w-[44px] min-h-[44px] -ml-2 px-2 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                        >
                          {ch.apartment_number as string}
                        </button>}
                      </td>
                      <td className="px-4 py-3">{typeBadge(ch.property_type)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {ch.area ? `${ch.area} ${t('м²', 'm²')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {fmt(charged)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                        {fmt(paid)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">
                        {debt > 0 ? fmt(debt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}
                        >
                          {statusLabel(st)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button
                disabled={!(pag?.hasPrev)}
                onClick={() => goPage(currentPage - 1)}
                className="flex min-h-[44px] min-w-[44px] items-center gap-1 text-sm text-gray-600 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {t('Назад', 'Orqaga')}
              </button>
              <span className="text-sm text-gray-500">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={!(pag?.hasNext)}
                onClick={() => goPage(currentPage + 1)}
                className="flex min-h-[44px] min-w-[44px] items-center gap-1 text-sm text-gray-600 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('Вперёд', 'Oldinga')}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Building status for residents ── */}
      {isResident && buildingStatuses.length > 0 && (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {t('Статусы оплат по дому', 'Uy bo\'yicha to\'lov holatlari')}
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {buildingStatuses.map((s) => (
              <div key={s.apartment_number} className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.status === 'paid' ? 'bg-green-500' :
                  s.status === 'partial' ? 'bg-yellow-500' :
                  s.status === 'overdue' ? 'bg-red-500' : 'bg-gray-300'
                }`} />
                <span className="text-gray-600">{s.apartment_number}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{t('Оплачено', 'To\'langan')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />{t('Частично', 'Qisman')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{t('Долг', 'Qarz')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" />{t('Ожидает', 'Kutilmoqda')}</span>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      <Modal
        isOpen={!!selected}
        onClose={closePaymentTarget}
        title={`${t('Квартира', 'Xonadon')} ${selected?.apartment_number ?? ''}`}
        size="lg"
        showClose={!submitting}
      >
        {selected && (
          <div ref={paymentModalContentRef} className="space-y-6">
            {/* top info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t('Начислено', 'Hisoblangan'), value: fmt(selected.amount), color: 'text-gray-800' },
                { label: t('Оплачено', 'To\'langan'), value: fmt(selected.paid_amount), color: 'text-green-600' },
                {
                  label: t('Долг', 'Qarz'),
                  value: fmt((Number(selected.amount) || 0) - (Number(selected.paid_amount) || 0)),
                  color: 'text-red-600',
                },
                { label: t('Статус', 'Holat'), value: statusLabel((selected.status as string) || 'pending'), color: 'text-gray-800' },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* breakdown */}
            {parseBreakdown.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  {t('Расшифровка начисления', 'Hisoblash tafsiloti')}
                </h4>
                <div className="bg-gray-50 rounded-lg divide-y divide-gray-100">
                  {parseBreakdown.map((item, i) => {
                    const r = item as Record<string, unknown>;
                    return (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600">{(r.name || r.label || r.type || `#${i + 1}`) as string}</span>
                      <span className="font-medium text-gray-800">{fmt(r.amount ?? r.value)}</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* payment form */}
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary-600" />
                {t('Принять оплату', 'To\'lovni qabul qilish')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* amount */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="payment-amount" className="text-xs text-gray-500">{t('Сумма', 'Summa')}</label>
                  <input
                    id="payment-amount"
                    type="number"
                    min={0}
                    value={payAmount}
                    disabled={submitting}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0"
                    className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                  />
                </div>

                {/* type */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="payment-type" className="text-xs text-gray-500">{t('Тип оплаты', 'To\'lov turi')}</label>
                  <select
                    id="payment-type"
                    value={payType}
                    disabled={submitting}
                    onChange={(e) => setPayType(e.target.value)}
                    className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                  >
                    <option value="cash">{t('Наличные', 'Naqd')}</option>
                    <option value="card">{t('Карта', 'Karta')}</option>
                    <option value="transfer">{t('Перевод', 'O\'tkazma')}</option>
                    <option value="online">{t('Онлайн', 'Onlayn')}</option>
                  </select>
                </div>

                {/* description */}
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label htmlFor="payment-description" className="text-xs text-gray-500">{t('Комментарий', 'Izoh')}</label>
                  <textarea
                    id="payment-description"
                    value={payDesc}
                    disabled={submitting}
                    onChange={(e) => setPayDesc(e.target.value)}
                    rows={2}
                    placeholder={t('Необязательно', 'Ixtiyoriy')}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                  />
                </div>
              </div>

              <button
                onClick={handlePay}
                disabled={submitting || !payAmount || Number(payAmount) <= 0}
                className="mt-3 w-full h-11 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {paymentTypeIcon[payType]}
                <span role="status" aria-live="polite">
                  {submitting
                    ? t('Обработка...', 'Qayta ishlanmoqda...')
                    : t('Принять оплату', 'To\'lovni qabul qilish')}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
