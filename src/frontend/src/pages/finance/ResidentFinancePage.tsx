// Resident "Оплата" — Claude Design §09-oplata handoff
// (design/handoff/payment-handoff.md). Sticky in-page header (Кв./ЖК
// eyebrow + Оплата title), dark balance card with state-aware gradient
// (clear / due / overdue), charges accordion list, payments history
// inline expansion.
//
// Wiring: financeApi.getCharges (auto-filtered by user.id server-side)
// and financeApi.getPayments (same), plus useBuildingStore for the real
// ЖК name. Online payment + Акт сверки are LOCKED — both surfaces show
// an info toast since there is no backend yet (no Payme/Click gateway,
// reconciliation only returns JSON not a PDF).

import { useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronDown, Clock, CreditCard, Download, Info, Loader2,
  Receipt, Banknote, Landmark, Globe,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { financeApi } from '../../services/api/finance';

// ── tokens
// Theme-adaptive tokens flow through CSS vars declared in index.css
// (:root + html.dark). Fallbacks preserve the original literals byte-
// for-byte so if a var is ever unset, light-theme rendering matches
// pre-fix pixel-for-pixel. Dark theme flips them via html.dark. Only
// theme-adaptive palette moved:
//  • Surface / borders / text  → theme-aware (page was reading light in dark mode).
//  • Status badges (paid / pending / overdue) → theme-aware because
//    the 0.12-alpha tint over #25201A dark surface drops the pending
//    badge to 2.89:1 (below AA-Normal on 10 px bold text).
// Theme-INVARIANT and intentionally left as literals:
//  • BRAND / BRAND_DARK / SHADOW_BRAND — brand accent, same in both.
//  • TEXT_ON_DARK — text on the ALWAYS-dark balance-card gradient.
//  • Balance-card gradients + glows — the card is a "premium hero"
//    dark surface in BOTH themes (design handoff §09-oplata).
const APP_BG = 'var(--finance-app-bg, #F4F0E8)';
const SURFACE = 'var(--finance-surface, #FFFFFF)';
const TEXT_PRIMARY = 'var(--finance-text-primary, #1C1917)';
const TEXT_SECONDARY = 'var(--finance-text-secondary, #6F6A62)';
const TEXT_MUTED = 'var(--finance-text-muted, #A8A29E)';
const TEXT_ON_DARK = '#F4F0E8';
const BORDER_C = 'var(--finance-border, rgba(28,25,23,0.08))';
const HAIRLINE = 'var(--finance-hairline, rgba(28,25,23,0.06))';
const BRAND = '#F97316';
const BRAND_DARK = '#EA580C';
const STATUS_ACTIVE = 'var(--finance-status-active, #15A06E)';
const STATUS_ACTIVE_BG = 'var(--finance-status-active-bg, rgba(21,160,110,0.12))';
const STATUS_PENDING = 'var(--finance-status-pending, #B45309)';
const STATUS_PENDING_BG = 'var(--finance-status-pending-bg, rgba(180,83,9,0.12))';
const STATUS_CRITICAL = 'var(--finance-status-critical, #E2483D)';
const STATUS_CRITICAL_BG = 'var(--finance-status-critical-bg, rgba(226,72,61,0.12))';
const SHADOW_SM = 'var(--finance-shadow-sm, 0 1px 2px rgba(28,25,23,0.04))';
const SHADOW_BRAND = '0 8px 22px rgba(249,115,22,0.32)';
const RADIUS_XL = 22;
const RADIUS_LG = 16;
const RADIUS_MD = 12;

type ChargeStatus = 'paid' | 'pending' | 'partial' | 'overdue';
type BalanceState = 'clear' | 'due' | 'overdue';

interface Charge {
  id: string;
  apartment_id?: string;
  period?: string;
  amount: number;
  paid_amount: number;
  status: ChargeStatus;
  description?: string;
  estimate_item_name?: string;
  generated_at?: string;
  due_date?: string;
}

interface Payment {
  id: string;
  payment_date?: string;
  amount: number;
  payment_type?: string;
  description?: string;
  receipt_number?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtSum = (n: number): string =>
  n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }).replace(/,/g, ' ');

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];

// period field is "YYYY-MM"
const formatPeriod = (period: string | undefined, lang: 'ru' | 'uz'): string => {
  if (!period) return '—';
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return period;
  const year = m[1];
  const idx = Math.max(0, Math.min(11, Number(m[2]) - 1));
  const monthName = lang === 'ru' ? RU_MONTHS[idx] : UZ_MONTHS[idx];
  return `${monthName} ${year}`;
};

const formatDate = (iso: string | undefined, lang: 'ru' | 'uz'): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

const currentPeriod = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const dueDateForCurrentPeriod = (): string => {
  // Existing offline practice: pay by the 10th of the following month.
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 10);
  return next.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
};

const STATUS_VISUALS: Record<ChargeStatus, { ruLabel: string; uzLabel: string; fg: string; bg: string }> = {
  paid:    { ruLabel: 'Оплачено',   uzLabel: 'To\'langan',   fg: STATUS_ACTIVE,   bg: STATUS_ACTIVE_BG },
  pending: { ruLabel: 'К оплате',   uzLabel: 'To\'lanadi',   fg: STATUS_PENDING,  bg: STATUS_PENDING_BG },
  partial: { ruLabel: 'Частично',   uzLabel: 'Qisman',       fg: STATUS_PENDING,  bg: STATUS_PENDING_BG },
  overdue: { ruLabel: 'Просрочено', uzLabel: 'Muddati o\'tgan', fg: STATUS_CRITICAL, bg: STATUS_CRITICAL_BG },
};

const PAYMENT_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
  online: Globe,
};

export function ResidentFinancePage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const lang: 'ru' | 'uz' = language === 'ru' ? 'ru' : 'uz';
  const addToast = useToastStore(s => s.addToast);

  const fetchBuildingById = useBuildingStore(s => s.fetchBuildingById);
  const residentBuilding = useBuildingStore(s =>
    user?.buildingId ? s.buildings.find(b => b.id === user.buildingId) : undefined
  );
  useEffect(() => {
    if (user?.buildingId && !residentBuilding) fetchBuildingById(user.buildingId);
  }, [user?.buildingId, residentBuilding, fetchBuildingById]);

  const [charges, setCharges] = useState<Charge[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingCharges(true);
    (async () => {
      try {
        const resp = await financeApi.getCharges({ limit: 50 });
        if (cancelled) return;
        const rows = ((resp.data || []) as Charge[]).map(c => ({
          ...c,
          amount: num(c.amount),
          paid_amount: num(c.paid_amount),
          status: (c.status as ChargeStatus) || 'pending',
        }));
        setCharges(rows);
      } catch {
        if (!cancelled) setCharges([]);
      } finally {
        if (!cancelled) setLoadingCharges(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadPayments = async () => {
    if (paymentsOpen) {
      setPaymentsOpen(false);
      return;
    }
    setPaymentsOpen(true);
    if (payments.length > 0) return;
    setLoadingPayments(true);
    try {
      const resp = await financeApi.getPayments({ limit: 10 });
      const rows = ((resp.data || []) as Payment[]).map(p => ({
        ...p,
        amount: num(p.amount),
      }));
      setPayments(rows);
    } catch {
      setPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Derived balance state + total
  const { balanceState, balanceDue, currentMonthDue, hasAnyOverdue } = useMemo(() => {
    let due = 0;
    let monthDue = 0;
    let overdue = false;
    const now = currentPeriod();
    for (const c of charges) {
      const remaining = Math.max(0, c.amount - c.paid_amount);
      if (c.status !== 'paid' && remaining > 0) due += remaining;
      if (c.status === 'overdue') overdue = true;
      if (c.period === now && c.status !== 'paid') monthDue += remaining;
    }
    let state: BalanceState = 'clear';
    if (overdue) state = 'overdue';
    else if (due > 0) state = 'due';
    return { balanceState: state, balanceDue: due, currentMonthDue: monthDue, hasAnyOverdue: overdue };
  }, [charges]);

  const apartmentLabel = user?.apartment
    ? `${lang === 'ru' ? 'Кв.' : 'Kv.'} ${user.apartment}`
    : (lang === 'ru' ? 'Квартира не указана' : 'Kvartira ko\'rsatilmagan');
  const buildingLabel = residentBuilding?.name
    || residentBuilding?.address
    || user?.building
    || user?.address
    || '—';
  const headerEyebrow = `${apartmentLabel} · ${buildingLabel}`;

  const handlePay = () => {
    addToast('info', lang === 'ru'
      ? 'Онлайн-оплата скоро. Сейчас доступна оплата в кассе УК.'
      : 'Onlayn to\'lov tez orada. Hozir BK kassasidan to\'lash mumkin.');
  };

  const handleReconciliation = () => {
    addToast('info', lang === 'ru'
      ? 'Акт сверки скоро. Запросите его у УК.'
      : 'Solishtirish dalolatnomasi tez orada. BK dan so\'rab oling.');
  };

  // ── render ──────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100%',
      background: APP_BG, color: TEXT_PRIMARY,
      paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
      letterSpacing: '-0.01em',
    }}>
      {/* Sticky header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 8px',
      }}>
        <div style={{
          fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
          color: TEXT_SECONDARY, textTransform: 'uppercase',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {headerEyebrow}
        </div>
        <div style={{
          fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em',
          marginTop: 2, color: TEXT_PRIMARY,
        }}>
          {lang === 'ru' ? 'Оплата' : 'To\'lov'}
        </div>
      </div>

      {/* Balance card */}
      <div style={{ padding: '8px 16px 0' }}>
        <BalanceCard
          state={balanceState}
          balance={balanceDue}
          monthLabel={formatPeriod(currentPeriod(), lang)}
          dueDate={dueDateForCurrentPeriod()}
          lang={lang}
          loading={loadingCharges}
          currentMonthDue={currentMonthDue}
          hasAnyOverdue={hasAnyOverdue}
          paymentsOpen={paymentsOpen}
          onPay={handlePay}
          onTogglePayments={loadPayments}
        />
      </div>

      {/* Inline payments history (real data) */}
      {balanceState === 'clear' && paymentsOpen && (
        <div style={{ padding: '12px 16px 0' }}>
          <PaymentsHistorySection
            payments={payments}
            loading={loadingPayments}
            lang={lang}
          />
        </div>
      )}

      {/* Charges */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
            color: TEXT_SECONDARY, textTransform: 'uppercase',
          }}>
            {lang === 'ru' ? 'Начисления' : 'Hisob-kitoblar'}
          </span>
          <button
            type="button"
            onClick={handleReconciliation}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12.5, fontWeight: 700, color: BRAND_DARK,
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 0, font: 'inherit',
            }}>
            <Download size={14} />
            {lang === 'ru' ? 'Акт сверки' : 'Solishtirish'}
            <Info size={11} style={{ color: TEXT_MUTED }} />
          </button>
        </div>

        {loadingCharges ? (
          <ChargesSkeleton />
        ) : charges.length === 0 ? (
          <ChargesEmpty lang={lang} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {charges.map(c => (
              <ChargeCard
                key={c.id}
                charge={c}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                lang={lang}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Balance card
// ─────────────────────────────────────────────────────────────────────────

function BalanceCard({
  state, balance, monthLabel, dueDate, lang, loading,
  currentMonthDue, hasAnyOverdue, paymentsOpen, onPay, onTogglePayments,
}: {
  state: BalanceState;
  balance: number;
  monthLabel: string;
  dueDate: string;
  lang: 'ru' | 'uz';
  loading: boolean;
  currentMonthDue: number;
  hasAnyOverdue: boolean;
  paymentsOpen: boolean;
  onPay: () => void;
  onTogglePayments: () => void;
}) {
  const bg = state === 'overdue'
    ? 'linear-gradient(155deg, #7A2520 0%, #2A1816 100%)'
    : state === 'clear'
      ? 'linear-gradient(155deg, #15734F 0%, #143A2A 100%)'
      : 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)';
  const glow = state === 'overdue'
    ? 'radial-gradient(90% 80% at 88% 0%, rgba(226,72,61,0.5), transparent 55%)'
    : state === 'clear'
      ? 'radial-gradient(90% 80% at 88% 0%, rgba(21,160,110,0.5), transparent 55%)'
      : 'radial-gradient(90% 80% at 88% 0%, rgba(251,146,60,0.5), transparent 55%)';

  const eyebrow = state === 'clear'
    ? (lang === 'ru' ? 'Баланс квартиры' : 'Kvartira balansi')
    : state === 'overdue'
      ? (lang === 'ru' ? 'Просроченная задолженность' : 'Muddati o\'tgan qarz')
      : (lang === 'ru' ? `К оплате за ${monthLabel.toLowerCase()}` : `${monthLabel} uchun to'lov`);

  // Show monthly bucket as the primary amount when nothing is overdue and
  // the resident has a non-zero current-period charge; otherwise show
  // the full outstanding total. Both come from the same charges list,
  // never from a fake number.
  const displaySum = state === 'overdue'
    ? balance
    : (currentMonthDue > 0 ? currentMonthDue : balance);

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      borderRadius: RADIUS_XL, padding: 20,
      background: bg, color: TEXT_ON_DARK,
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.4, background: glow }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(244,240,232,0.7)' }}>
          {eyebrow}
        </div>

        {state === 'clear' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 999,
              background: 'rgba(34,197,94,0.2)', color: '#86EFAC',
              display: 'grid', placeItems: 'center',
            }}>
              <Check size={24} strokeWidth={2.6} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
              {loading
                ? (lang === 'ru' ? 'Загружаем…' : 'Yuklanmoqda…')
                : (lang === 'ru' ? 'Нет задолженности' : 'Qarz yo\'q')}
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            marginTop: 6, flexWrap: 'nowrap',
          }}>
            <span style={{
              fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              {fmtSum(displaySum)}
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(244,240,232,0.7)' }}>
              {lang === 'ru' ? 'сум' : 'so\'m'}
            </span>
          </div>
        )}

        {state !== 'clear' && (
          <div style={{
            fontSize: 12.5, color: 'rgba(244,240,232,0.7)', marginTop: 8,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Clock size={13} />
            {state === 'overdue'
              ? (lang === 'ru'
                ? `Просрочено · начисляется пеня${hasAnyOverdue ? '' : ''}`
                : 'Muddati o\'tdi · jarima hisoblanmoqda')
              : (lang === 'ru' ? `Срок до ${dueDate}` : `Muddat ${dueDate} gacha`)}
          </div>
        )}

        {/* Primary CTA */}
        {state === 'clear' ? (
          <button
            type="button"
            onClick={onTogglePayments}
            style={{
              width: '100%', marginTop: 16, padding: 14,
              borderRadius: RADIUS_MD, border: 'none',
              background: 'rgba(244,240,232,0.15)', color: TEXT_ON_DARK,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              font: 'inherit',
            }}>
            <Receipt size={17} />
            {lang === 'ru'
              ? (paymentsOpen ? 'Скрыть историю' : 'История платежей')
              : (paymentsOpen ? 'Yashirish' : 'To\'lov tarixi')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onPay}
            aria-label={lang === 'ru' ? 'Оплатить (онлайн-оплата скоро)' : 'To\'lov (tez orada)'}
            style={{
              width: '100%', marginTop: 16, padding: 14,
              borderRadius: RADIUS_MD, border: 'none',
              background: BRAND, color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: SHADOW_BRAND,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              font: 'inherit',
            }}>
            <CreditCard size={17} />
            {lang === 'ru' ? 'Оплатить' : 'To\'lash'} {fmtSum(displaySum)}{' '}
            {lang === 'ru' ? 'сум' : 'so\'m'}
            <Info size={13} style={{ opacity: 0.85 }} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Charge card
// ─────────────────────────────────────────────────────────────────────────

function ChargeCard({
  charge, expanded, onToggle, lang,
}: {
  charge: Charge;
  expanded: boolean;
  onToggle: () => void;
  lang: 'ru' | 'uz';
}) {
  const vis = STATUS_VISUALS[charge.status] ?? STATUS_VISUALS.pending;
  const title = charge.description || charge.estimate_item_name
    || (lang === 'ru' ? 'Начисление' : 'Hisob-kitob');
  const period = formatPeriod(charge.period, lang);
  const remaining = Math.max(0, charge.amount - charge.paid_amount);

  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER_C}`,
      borderRadius: RADIUS_LG, boxShadow: SHADOW_SM, overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: 15, background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit',
        }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 1 }}>{period}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 15, fontWeight: 800,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
          }}>
            {fmtSum(charge.amount)}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: vis.fg, background: vis.bg,
            padding: '2px 7px', borderRadius: 999,
            marginTop: 3, display: 'inline-block',
          }}>
            {lang === 'ru' ? vis.ruLabel : vis.uzLabel}
          </span>
        </div>
        <ChevronDown size={16} style={{
          color: TEXT_MUTED,
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s', flex: '0 0 auto',
        }} />
      </button>

      {expanded && (
        <div style={{ padding: '0 15px 14px 15px' }}>
          <div style={{
            borderTop: `1px solid ${HAIRLINE}`,
            paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            <BreakdownRow
              label={lang === 'ru' ? 'Начислено' : 'Hisoblangan'}
              value={`${fmtSum(charge.amount)} ${lang === 'ru' ? 'сум' : 'so\'m'}`}
            />
            <BreakdownRow
              label={lang === 'ru' ? 'Оплачено' : 'To\'langan'}
              value={`${fmtSum(charge.paid_amount)} ${lang === 'ru' ? 'сум' : 'so\'m'}`}
              valueColor={charge.paid_amount > 0 ? STATUS_ACTIVE : undefined}
            />
            <BreakdownRow
              label={lang === 'ru' ? 'Остаток' : 'Qoldiq'}
              value={`${fmtSum(remaining)} ${lang === 'ru' ? 'сум' : 'so\'m'}`}
              valueColor={remaining > 0 ? (charge.status === 'overdue' ? STATUS_CRITICAL : STATUS_PENDING) : STATUS_ACTIVE}
              valueBold
            />
            {charge.due_date && (
              <BreakdownRow
                label={lang === 'ru' ? 'Срок до' : 'Muddat'}
                value={formatDate(charge.due_date, lang)}
              />
            )}
            {charge.generated_at && (
              <BreakdownRow
                label={lang === 'ru' ? 'Дата начисления' : 'Hisoblangan sana'}
                value={formatDate(charge.generated_at, lang)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value, valueColor, valueBold }: {
  label: string; value: string; valueColor?: string; valueBold?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: TEXT_SECONDARY }}>{label}</span>
      <span style={{
        fontWeight: valueBold ? 800 : 650,
        color: valueColor || TEXT_PRIMARY,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Payments history
// ─────────────────────────────────────────────────────────────────────────

function PaymentsHistorySection({ payments, loading, lang }: {
  payments: Payment[]; loading: boolean; lang: 'ru' | 'uz';
}) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
        color: TEXT_SECONDARY, textTransform: 'uppercase', marginBottom: 10,
      }}>
        {lang === 'ru' ? 'Последние оплаты' : 'Oxirgi to\'lovlar'}
      </div>
      {loading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <Loader2 size={20} className="animate-spin" style={{ color: TEXT_MUTED }} />
        </div>
      ) : payments.length === 0 ? (
        <div style={{
          background: SURFACE, border: `1px solid ${BORDER_C}`,
          borderRadius: RADIUS_LG, padding: 16, textAlign: 'center',
          fontSize: 13.5, color: TEXT_MUTED, boxShadow: SHADOW_SM,
        }}>
          {lang === 'ru' ? 'Оплат пока нет' : 'Hozircha to\'lovlar yo\'q'}
        </div>
      ) : (
        <div style={{
          background: SURFACE, border: `1px solid ${BORDER_C}`,
          borderRadius: RADIUS_LG, boxShadow: SHADOW_SM, overflow: 'hidden',
        }}>
          {payments.map((p, i) => {
            const Icon = PAYMENT_ICONS[p.payment_type || 'cash'] ?? Banknote;
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 15px',
                borderTop: i > 0 ? `1px solid ${HAIRLINE}` : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 999,
                  background: STATUS_ACTIVE_BG, color: STATUS_ACTIVE,
                  display: 'grid', placeItems: 'center', flex: '0 0 auto',
                }}>
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em',
                    color: TEXT_PRIMARY,
                  }}>
                    {p.description || (lang === 'ru' ? 'Оплата' : 'To\'lov')}
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 1 }}>
                    {formatDate(p.payment_date, lang)}
                  </div>
                </div>
                <div style={{
                  fontSize: 14.5, fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: STATUS_ACTIVE,
                }}>
                  +{fmtSum(p.amount)} {lang === 'ru' ? 'сум' : 'so\'m'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Charges skeleton / empty
// ─────────────────────────────────────────────────────────────────────────

function ChargesSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          background: SURFACE, border: `1px solid ${BORDER_C}`,
          borderRadius: RADIUS_LG, boxShadow: SHADOW_SM,
          padding: 15, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 14, width: '60%', borderRadius: 6, background: 'var(--finance-skeleton-bg, #EDE7DB)' }} />
            <div style={{ height: 10, width: '40%', borderRadius: 6, background: 'var(--finance-skeleton-bg, #EDE7DB)', marginTop: 6 }} />
          </div>
          <div style={{ height: 18, width: 70, borderRadius: 6, background: 'var(--finance-skeleton-bg, #EDE7DB)' }} />
        </div>
      ))}
    </div>
  );
}

function ChargesEmpty({ lang }: { lang: 'ru' | 'uz' }) {
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER_C}`,
      borderRadius: RADIUS_LG, padding: 20, textAlign: 'center',
      boxShadow: SHADOW_SM,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 999,
        background: STATUS_ACTIVE_BG, color: STATUS_ACTIVE,
        display: 'grid', placeItems: 'center', margin: '0 auto 12px',
      }}>
        <Check size={24} strokeWidth={2.4} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>
        {lang === 'ru' ? 'Начислений пока нет' : 'Hozircha hisob-kitoblar yo\'q'}
      </div>
      <div style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 4, lineHeight: 1.4 }}>
        {lang === 'ru'
          ? 'Как только УК сформирует начисление, оно появится здесь.'
          : 'BK hisob-kitobni shakllantirgan zahoti bu yerda paydo bo\'ladi.'}
      </div>
    </div>
  );
}
