import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Receipt,
  Building2,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ArrowUpCircle,
  X,
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

/* ─── helpers ──────────────────────────────────────────── */

const fmt = (v: unknown): string => {
  const n = Number(v) || 0;
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

/* ─── component ────────────────────────────────────────── */

export default function ChargesPage() {
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

  /* building statuses for residents */
  const [buildingStatuses, setBuildingStatuses] = useState<{ apartment_number: string; status: string }[]>([]);

  const [loadError, setLoadError] = useState(false);

  /* local filter state — committed on Apply */
  const [localBuilding, setLocalBuilding] = useState(filters.buildingId);
  const [localPeriod, setLocalPeriod] = useState(filters.period);
  const [localStatus, setLocalStatus] = useState(filters.status);

  /* detail modal */
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState('cash');
  const [payDesc, setPayDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
  }, [isResident, user?.buildingId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    [language],
  );

  /* ── payment submit ── */
  const handlePay = useCallback(async () => {
    if (!selected || !payAmount) return;
    setSubmitting(true);
    const ok = await createPayment({
      apartment_id: selected.apartment_id as string,
      amount: Number(payAmount),
      payment_type: payType,
      description: payDesc || undefined,
    } as Parameters<typeof createPayment>[0]);
    setSubmitting(false);
    if (ok) {
      setSelected(null);
      setPayAmount('');
      setPayType('cash');
      setPayDesc('');
      fetchCharges(currentPage);
      if (filters.buildingId) fetchChargesSummary(filters.buildingId, filters.period || undefined);
    }
  }, [selected, payAmount, payType, payDesc, createPayment, fetchCharges, currentPage, filters, fetchChargesSummary]);

  /* ── render ── */
  if (chargesLoading && charges.length === 0) return <PageSkeleton variant="list" />;

  const summaryCards = [
    {
      label: t('Начислено', 'Hisoblangan'),
      value: fmt(summary?.total_charged),
      icon: <DollarSign className="w-5 h-5" />,
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
    <div className="space-y-6">
      {/* ── Filter bar ── */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Building */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {t('Здание', 'Bino')}
            </label>
            <select
              value={localBuilding}
              onChange={(e) => setLocalBuilding(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            >
              <option value="">{t('Все здания', 'Barcha binolar')}</option>
              {buildings.map((b) => (
                <option key={b.id as string} value={b.id as string}>
                  {b.name as string}
                </option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {t('Период', 'Davr')}
            </label>
            <input
              type="month"
              value={localPeriod}
              onChange={(e) => setLocalPeriod(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              {t('Статус', 'Holat')}
            </label>
            <select
              value={localStatus}
              onChange={(e) => setLocalStatus(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
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
            className="h-10 px-5 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            {t('Применить', 'Qo\'llash')}
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((c) => (
          <div
            key={c.label}
            className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center ${c.color}`}>
              {c.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`text-lg font-semibold ${c.color}`}>{c.value}</p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
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
                      onClick={() => setSelected(ch)}
                      className="border-b border-gray-50 hover:bg-primary-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {ch.apartment_number as string}
                      </td>
                      <td className="px-4 py-3">{typeBadge(ch.apartment_type)}</td>
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
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          <div className="flex gap-4 mt-3 text-[10px] text-gray-400">
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
        onClose={() => {
          setSelected(null);
          setPayAmount('');
          setPayType('cash');
          setPayDesc('');
        }}
        title={`${t('Квартира', 'Xonadon')} ${selected?.apartment_number ?? ''}`}
        size="lg"
      >
        {selected && (
          <div className="space-y-6">
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
                  {parseBreakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600">{(item.name || item.label || item.type || `#${i + 1}`) as string}</span>
                      <span className="font-medium text-gray-800">{fmt(item.amount ?? item.value)}</span>
                    </div>
                  ))}
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
                  <label className="text-xs text-gray-500">{t('Сумма', 'Summa')}</label>
                  <input
                    type="number"
                    min={0}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0"
                    className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                  />
                </div>

                {/* type */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">{t('Тип оплаты', 'To\'lov turi')}</label>
                  <select
                    value={payType}
                    onChange={(e) => setPayType(e.target.value)}
                    className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                  >
                    <option value="cash">{t('Наличные', 'Naqd')}</option>
                    <option value="card">{t('Карта', 'Karta')}</option>
                    <option value="transfer">{t('Перевод', 'O\'tkazma')}</option>
                    <option value="online">{t('Онлайн', 'Onlayn')}</option>
                  </select>
                </div>

                {/* description */}
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-xs text-gray-500">{t('Комментарий', 'Izoh')}</label>
                  <textarea
                    value={payDesc}
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
                className="mt-3 w-full h-10 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {paymentTypeIcon[payType]}
                {submitting
                  ? t('Обработка...', 'Qayta ishlanmoqda...')
                  : t('Принять оплату', 'To\'lovni qabul qilish')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
