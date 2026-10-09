/**
 * ResidentFinancePage — "Мои начисления" для резидента/арендатора.
 *
 * Заменяет плейсхолдер "Скоро / Онлайн-оплата — в разработке" из
 * ResidentHomeDesign.BalanceCard. Показывает реальные данные:
 *   — карточка баланса (charged / paid / долг или переплата)
 *   — список начислений по месяцам с раскладкой по статьям
 *   — печатная квитанция (window.print на скрытый iframe) по каждому начислению
 *
 * Работает через residentFinanceApi.getMy() — один вызов, резолвит
 * apartment_id по authenticated user (primary_owner_id).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Car, ChevronDown, Droplet, Flame, Thermometer, Trash2, Wifi } from 'lucide-react';
import { residentFinanceApi, type MyChargeRow, type MyBalance, type MyApartmentRow, type PenaltyRow } from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useTenantStore } from '../../../stores/tenantStore';
import { PageSkeleton } from '../../../components/PageSkeleton';

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');
}

function formatPeriod(period: string, isRu: boolean): string {
  // period = "2026-07" → "Июль 2026" / "Iyul 2026"
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ', { month: 'long', year: 'numeric' });
}

function parseBreakdown(raw: string | null): Array<{ name: string; share: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    return items
      .filter((item): item is { name: unknown; share?: unknown; amount?: unknown } => !!item && typeof item.name === 'string')
      .map(item => ({
        name: item.name,
        share: Number(item.share ?? item.amount) || 0,
      }));
  } catch {
    return [];
  }
}

// ── Печатная квитанция (window.print на новую вкладку) ───────────────

function printReceipt(
  charge: MyChargeRow,
  apt: MyApartmentRow | undefined,
  ownerName: string,
  tenantName: string,
  isRu: boolean,
) {
  const items = parseBreakdown(charge.amount_breakdown);
  const periodLabel = formatPeriod(charge.period, isRu);
  const w = window.open('', '_blank', 'width=800,height=1000');
  if (!w) return;

  const style = `
    body { font-family: system-ui, sans-serif; font-size: 13px; color: #111; padding: 20mm 15mm; }
    h1 { text-align: center; font-size: 20px; margin-bottom: 6px; }
    .sub { text-align: center; color: #555; margin-bottom: 24px; }
    .head { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .head .left { font-weight: 700; font-size: 15px; }
    .head .right { text-align: right; color: #666; font-size: 12px; }
    .info { margin: 12px 0 20px; }
    .info p { margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
    th { background: #f5f5f5; text-align: left; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; background: #fafafa; }
    .totals { margin-top: 18px; padding: 12px; border: 2px solid #E8621A; border-radius: 8px; }
    .totals .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .totals .row.total { font-weight: 700; font-size: 15px; padding-top: 6px; border-top: 1px solid #ddd; margin-top: 6px; }
    .footer { margin-top: 32px; font-size: 11px; color: #777; text-align: center; }
    @media print { .no-print { display: none; } }
  `;

  const debt = Math.max(0, charge.amount - charge.paid_amount);

  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${isRu ? 'Квитанция' : 'Kvitansiya'} — ${periodLabel}</title>
<style>${style}</style></head><body>
  <div class="head">
    <div class="left">${escapeHtml(tenantName)}</div>
    <div class="right">Kamizo · ${isRu ? 'Управление домом' : 'Uy boshqaruvi'}</div>
  </div>
  <h1>${isRu ? 'Квитанция на оплату ЖКХ' : 'Kommunal to\'lov kvitansiyasi'}</h1>
  <div class="sub">${periodLabel}</div>

  <div class="info">
    ${apt ? `<p><b>${isRu ? 'Квартира' : 'Xonadon'}:</b> №${escapeHtml(apt.number)} · ${apt.total_area} м²</p>` : ''}
    <p><b>${isRu ? 'Плательщик' : 'To\'lovchi'}:</b> ${escapeHtml(ownerName)}</p>
    <p><b>${isRu ? 'Срок оплаты' : 'To\'lov muddati'}:</b> ${charge.due_date || '-'}</p>
    <p><b>${isRu ? 'Статус' : 'Holat'}:</b> ${charge.status}</p>
  </div>

  ${items.length > 0 ? `
  <table>
    <thead><tr>
      <th>№</th>
      <th>${isRu ? 'Статья' : 'Modda'}</th>
      <th style="text-align:right">${isRu ? 'Сумма, сум' : 'Summa, so\'m'}</th>
    </tr></thead>
    <tbody>
      ${items.map((it, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(it.name)}</td>
        <td class="num">${fmt(it.share)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="2">${isRu ? 'ИТОГО' : 'JAMI'}</td>
      <td class="num">${fmt(charge.amount)}</td>
    </tr></tfoot>
  </table>
  ` : ''}

  <div class="totals">
    <div class="row"><span>${isRu ? 'Начислено' : 'Hisoblangan'}:</span><span>${fmt(charge.amount)} сум</span></div>
    <div class="row"><span>${isRu ? 'Оплачено' : 'To\'langan'}:</span><span>${fmt(charge.paid_amount)} сум</span></div>
    <div class="row total"><span>${isRu ? 'К оплате' : 'To\'lash kerak'}:</span><span>${fmt(debt)} сум</span></div>
  </div>

  <div class="footer">
    ${isRu
      ? `Документ сформирован автоматически системой Kamizo. При оплате укажите период ${periodLabel} и номер квартиры.`
      : `Hujjat Kamizo tomonidan avtomatik yaratilgan. To'lash vaqtida davr va xonadon raqamini ko'rsating.`}
  </div>

  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  w.document.close();
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c] || c);
}

function ResidentFinanceHeader({ subtitle, isRu, onBack }: { subtitle?: string; isRu: boolean; onBack: () => void }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px',
        background: 'var(--themed-strip-bg, rgba(244,240,232,0.92))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border-c)',
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label={isRu ? 'Назад' : 'Orqaga'}
          style={{
            width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
            background: 'var(--surface)', border: '1px solid var(--border-c)',
            color: 'var(--text-primary)',
            display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0,
          }}
        >
          <ArrowLeft size={19} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            {isRu ? 'Мои начисления' : 'Mening hisoblarim'}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 1 }}>{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResidentFinanceShell({ subtitle, isRu, onBack, children }: { subtitle?: string; isRu: boolean; onBack: () => void; children: ReactNode }) {
  return (
    <div
      className="kz-screen"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}
    >
      <ResidentFinanceHeader subtitle={subtitle} isRu={isRu} onBack={onBack} />
      <div
        className="kz-screen-body"
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 90px)',
        }}
      >
        <div className="max-w-3xl mx-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function ResidentFinancePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';
  const isRu = language === 'ru';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apartments, setApartments] = useState<MyApartmentRow[]>([]);
  const [charges, setCharges] = useState<MyChargeRow[]>([]);
  const [penalties, setPenalties] = useState<PenaltyRow[]>([]);
  const [balance, setBalance] = useState<MyBalance>({
    total_charged: 0, total_paid: 0, total_penalties: 0, debt: 0, overpaid: 0, net: 0,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedService, setExpandedService] = useState<'home' | 'gas' | 'water' | 'internet' | 'heating' | 'waste' | 'parking' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    residentFinanceApi.getMy()
      .then((data) => {
        if (cancelled) return;
        setApartments(data.apartments);
        setCharges(data.charges);
        setPenalties(data.penalties || []);
        setBalance(data.balance);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || (isRu ? 'Ошибка загрузки' : 'Yuklash xatosi'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isRu]);

  const aptById = useMemo(() => {
    const m = new Map<string, MyApartmentRow>();
    apartments.forEach((a) => m.set(a.id, a));
    return m;
  }, [apartments]);

  if (loading) {
    return (
      <ResidentFinanceShell isRu={isRu} onBack={() => navigate('/')}>
        <PageSkeleton variant="list" />
      </ResidentFinanceShell>
    );
  }

  if (error) {
    return (
      <ResidentFinanceShell isRu={isRu} onBack={() => navigate('/')}>
        <div className="text-center py-8">
          <div className="text-red-500 font-semibold mb-2">{error}</div>
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
            {isRu ? 'Обновить' : 'Yangilash'}
          </button>
        </div>
      </ResidentFinanceShell>
    );
  }

  if (apartments.length === 0) {
    return (
      <ResidentFinanceShell isRu={isRu} onBack={() => navigate('/')}>
        <div className="text-center py-8 text-gray-500">
          <div className="text-5xl mb-4">🏠</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            {isRu ? 'Нет квартир в системе' : 'Xonadonlar yo\'q'}
          </h2>
          <p className="text-sm">
            {isRu
              ? 'Ваш аккаунт не привязан к квартире. Обратитесь в УК.'
              : 'Akkauntingiz xonadonga bog\'lanmagan.'}
          </p>
        </div>
      </ResidentFinanceShell>
    );
  }

  const headerSubtitle = apartments.length === 1
    ? (isRu ? `Квартира №${apartments[0].number}` : `Xonadon №${apartments[0].number}`)
    : (isRu ? `Квартир: ${apartments.length}` : `Xonadonlar: ${apartments.length}`);
  const currentCharge = charges[0];
  const currentItems = currentCharge ? parseBreakdown(currentCharge.amount_breakdown) : [];
  const currentDebt = currentCharge ? Math.max(0, currentCharge.amount - currentCharge.paid_amount) : 0;

  return (
    <ResidentFinanceShell subtitle={headerSubtitle} isRu={isRu} onBack={() => navigate('/')}>

      {/* Balance card */}
      <div className={`rounded-2xl p-4 text-white ${balance.debt > 0 ? 'bg-gradient-to-br from-red-500 to-orange-500' : 'bg-gradient-to-br from-emerald-500 to-teal-500'}`}>
        <div className="text-xs opacity-80 uppercase tracking-wide">
          {balance.debt > 0
            ? (isRu ? 'К оплате' : 'To\'lash kerak')
            : balance.overpaid > 0
              ? (isRu ? 'Переплата' : 'Ortiqcha to\'lov')
              : (isRu ? 'Задолженности нет' : 'Qarz yo\'q')}
        </div>
        <div className="text-3xl font-bold mt-1 tabular-nums">
          {fmt(balance.debt > 0 ? balance.debt : balance.overpaid)} сум
        </div>
        <div className={`grid gap-2 mt-4 text-xs ${(balance.total_penalties || 0) > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div className="bg-white/15 rounded-lg p-2">
            <div className="opacity-80">{isRu ? 'Начислено' : 'Hisoblangan'}</div>
            <div className="font-semibold tabular-nums text-sm mt-0.5">{fmt(balance.total_charged)}</div>
          </div>
          <div className="bg-white/15 rounded-lg p-2">
            <div className="opacity-80">{isRu ? 'Оплачено' : 'To\'langan'}</div>
            <div className="font-semibold tabular-nums text-sm mt-0.5">{fmt(balance.total_paid)}</div>
          </div>
          {(balance.total_penalties || 0) > 0 && (
            <div className="bg-white/25 rounded-lg p-2 ring-1 ring-white/40">
              <div className="opacity-80">{isRu ? 'Пени' : 'Peni'}</div>
              <div className="font-semibold tabular-nums text-sm mt-0.5">{fmt(balance.total_penalties || 0)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Makes the purpose of the monthly management charge explicit. */}
      {currentCharge && (
        <section className="space-y-2">
          <div className="flex items-end justify-between px-1">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                {isRu ? 'За что вы платите' : 'Nima uchun to‘laysiz'}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatPeriod(currentCharge.period, isRu)}
              </p>
            </div>
            <span className="text-xs font-semibold text-gray-500">
              {isRu ? `К оплате ${fmt(currentDebt)} сум` : `To‘lash ${fmt(currentDebt)} so‘m`}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_14px_32px_-20px_rgba(5,150,105,0.55)]">
            <Building2
              aria-hidden
              strokeWidth={1.4}
              className="pointer-events-none absolute -bottom-4 -right-3 h-32 w-32 text-white/15"
            />
            <button
              type="button"
              onClick={() => setExpandedService(expandedService === 'home' ? null : 'home')}
              className="relative flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
              aria-expanded={expandedService === 'home'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/25 text-white backdrop-blur-sm">
                <Building2 className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-bold text-white">{isRu ? 'Содержание дома' : 'Uyga xizmat ko‘rsatish'}</span>
                  <span className="inline-flex items-center rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">{isRu ? 'УК' : 'BK'}</span>
                </span>
                <span className="mt-0.5 block text-xs text-white/80">{isRu ? 'Начисление вашей управляющей компании · уборка, лифт, обслуживание' : 'Boshqaruv kompaniyangiz hisobi · tozalash, lift, xizmat'}</span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-extrabold tabular-nums text-white">{fmt(currentCharge.amount)} <small className="font-semibold text-white/80">сум</small></span>
                <ChevronDown className={`ml-auto mt-1 h-4 w-4 text-white/80 transition-transform ${expandedService === 'home' ? 'rotate-180' : ''}`} />
              </span>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedService === 'home' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className={`relative border-t border-white/25 bg-white/10 px-4 py-3 transition-all duration-200 ease-out ${expandedService === 'home' ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
                  {currentItems.length > 0 ? currentItems.map((item) => (
                    <div key={item.name} className="flex justify-between gap-3 py-1 text-xs">
                      <span className="text-white/85">{item.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-white">{fmt(item.share)} сум</span>
                    </div>
                  )) : (
                    <p className="text-xs leading-5 text-white/85">{isRu ? 'Подробный состав начисления появится после утверждения сметы.' : 'Hisobning batafsil tarkibi smeta tasdiqlangandan so‘ng ko‘rinadi.'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-rose-100 bg-rose-50">
            <button
              type="button"
              onClick={() => setExpandedService(expandedService === 'gas' ? null : 'gas')}
              className="flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
              aria-expanded={expandedService === 'gas'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500 text-white">
                <Flame className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-rose-900">{isRu ? 'Газ в квартире' : 'Xonadondagi gaz'}</span>
                <span className="mt-0.5 block text-xs text-rose-700/80">{isRu ? 'Оплата поставщику по вашему лицевому счёту' : 'Shaxsiy hisobingiz bo‘yicha yetkazib beruvchiga to‘lov'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-rose-400 transition-transform ${expandedService === 'gas' ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedService === 'gas' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className={`border-t border-rose-100 bg-rose-100/40 px-4 py-3 text-xs leading-5 text-rose-800 transition-all duration-200 ease-out ${expandedService === 'gas' ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
                  {isRu ? 'Газ не входит в начисление УК. Его сумма зависит от ваших показаний и оплачивается напрямую поставщику газа.' : 'Gaz UK hisobiga kirmaydi. Uning summasi ko‘rsatkichlaringizga bog‘liq va gaz yetkazib beruvchisiga to‘g‘ridan-to‘g‘ri to‘lanadi.'}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-sky-50">
            <button
              type="button"
              onClick={() => setExpandedService(expandedService === 'water' ? null : 'water')}
              className="flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
              aria-expanded={expandedService === 'water'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500 text-white">
                <Droplet className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-sky-900">{isRu ? 'Вода и канализация' : 'Suv va kanalizatsiya'}</span>
                <span className="mt-0.5 block text-xs text-sky-700/80">{isRu ? 'Оплата поставщику по вашим показаниям счётчика' : 'Hisoblagich ko‘rsatkichlari bo‘yicha yetkazib beruvchiga to‘lov'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-sky-400 transition-transform ${expandedService === 'water' ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedService === 'water' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className={`border-t border-sky-100 bg-sky-100/40 px-4 py-3 text-xs leading-5 text-sky-800 transition-all duration-200 ease-out ${expandedService === 'water' ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
                  {isRu ? 'Холодная и горячая вода не входят в начисление УК. Передавайте показания счётчика и оплачивайте напрямую поставщику водоснабжения.' : 'Sovuq va issiq suv UK hisobiga kirmaydi. Hisoblagich ko‘rsatkichlarini topshiring va to‘g‘ridan-to‘g‘ri suv ta’minotchisiga to‘lang.'}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50">
            <button
              type="button"
              onClick={() => setExpandedService(expandedService === 'internet' ? null : 'internet')}
              className="flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
              aria-expanded={expandedService === 'internet'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white">
                <Wifi className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-indigo-900">{isRu ? 'Интернет и ТВ' : 'Internet va TV'}</span>
                <span className="mt-0.5 block text-xs text-indigo-700/80">{isRu ? 'Оплата провайдеру по вашему договору' : 'Shartnoma bo‘yicha provayderga to‘lov'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-indigo-400 transition-transform ${expandedService === 'internet' ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedService === 'internet' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className={`border-t border-indigo-100 bg-indigo-100/40 px-4 py-3 text-xs leading-5 text-indigo-800 transition-all duration-200 ease-out ${expandedService === 'internet' ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
                  {isRu ? 'Интернет и телевидение не входят в начисление УК. Оплачивается напрямую провайдеру по вашему личному договору.' : 'Internet va televidenie UK hisobiga kirmaydi. Shaxsiy shartnomangiz bo‘yicha provayderga to‘g‘ridan-to‘g‘ri to‘lanadi.'}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-orange-100 bg-orange-50">
            <button
              type="button"
              onClick={() => setExpandedService(expandedService === 'heating' ? null : 'heating')}
              className="flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
              aria-expanded={expandedService === 'heating'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
                <Thermometer className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-orange-900">{isRu ? 'Отопление' : 'Isitish'}</span>
                <span className="mt-0.5 block text-xs text-orange-700/80">{isRu ? 'Централизованное тепло · оплата поставщику' : 'Markaziy isitish · ta’minotchiga to‘lov'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-orange-400 transition-transform ${expandedService === 'heating' ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedService === 'heating' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className={`border-t border-orange-100 bg-orange-100/40 px-4 py-3 text-xs leading-5 text-orange-800 transition-all duration-200 ease-out ${expandedService === 'heating' ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
                  {isRu ? 'Отопление не входит в начисление УК. Оплачивается отдельно теплоснабжающей организации.' : 'Isitish UK hisobiga kirmaydi. Issiqlik ta’minoti tashkilotiga alohida to‘lanadi.'}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-lime-100 bg-lime-50">
            <button
              type="button"
              onClick={() => setExpandedService(expandedService === 'waste' ? null : 'waste')}
              className="flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
              aria-expanded={expandedService === 'waste'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime-600 text-white">
                <Trash2 className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-lime-900">{isRu ? 'Вывоз мусора' : 'Chiqindilarni olib chiqish'}</span>
                <span className="mt-0.5 block text-xs text-lime-800/80">{isRu ? 'Вывоз ТКО · оплата оператору' : 'Maishiy chiqindilar · operatorga to‘lov'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-lime-500 transition-transform ${expandedService === 'waste' ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedService === 'waste' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className={`border-t border-lime-100 bg-lime-100/40 px-4 py-3 text-xs leading-5 text-lime-900 transition-all duration-200 ease-out ${expandedService === 'waste' ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
                  {isRu ? 'Вывоз мусора не входит в начисление УК. Оплачивается отдельно региональному оператору по вывозу отходов.' : 'Chiqindilarni olib chiqish UK hisobiga kirmaydi. Hududiy chiqindi operatoriga alohida to‘lanadi.'}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setExpandedService(expandedService === 'parking' ? null : 'parking')}
              className="flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
              aria-expanded={expandedService === 'parking'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-600 text-white">
                <Car className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">{isRu ? 'Паркинг' : 'Avtoturargoh'}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{isRu ? 'Машино-место · отдельная оплата' : 'Avtomobil joyi · alohida to‘lov'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expandedService === 'parking' ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedService === 'parking' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className={`border-t border-slate-200 bg-slate-100/60 px-4 py-3 text-xs leading-5 text-slate-700 transition-all duration-200 ease-out ${expandedService === 'parking' ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
                  {isRu ? 'Паркинг оплачивается отдельно оператору паркинга или УК по договору на машино-место.' : 'Avtoturargoh avtomobil joyi shartnomasi bo‘yicha avtoturargoh operatoriga yoki boshqaruv kompaniyasiga alohida to‘lanadi.'}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Penalty details (только если есть) */}
      {penalties.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2">
            {isRu ? 'Пени за просрочку' : 'Kechikish uchun peni'}
          </div>
          <div className="space-y-2">
            {penalties.map((p) => {
              const ch = charges.find(c => c.id === p.charge_id);
              return (
                <div key={p.id} className="flex justify-between text-xs">
                  <div className="text-amber-900">
                    {ch ? formatPeriod(ch.period, isRu) : p.charge_id.slice(0, 6)}
                    <span className="text-amber-700 ml-2">
                      {isRu ? `${p.days_overdue} дн. просрочки` : `${p.days_overdue} kun kechikish`}
                    </span>
                  </div>
                  <div className="font-semibold tabular-nums text-amber-900">
                    {fmt(p.penalty_amount)} сум
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-amber-700 mt-2 leading-relaxed">
            {isRu
              ? 'Пени начисляются согласно ПКМ №930 после 30-дневного grace-периода. Оплатите основной долг — пени тоже спишутся.'
              : 'Peni VMQ-930 ga muvofiq 30 kun grace davridan keyin hisoblanadi. Asosiy qarzni to\'lang.'}
          </div>
        </div>
      )}

      {/* Charges list */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide px-1">
          {isRu ? 'Архив начислений' : 'Hisoblar arxivi'}
        </h2>

        {charges.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm bg-gray-50 rounded-xl">
            {isRu ? 'Пока нет начислений' : 'Hozircha hisoblar yo\'q'}
          </div>
        ) : charges.map((c) => {
          const debt = Math.max(0, c.amount - c.paid_amount);
          const apt = aptById.get(c.apartment_id);
          const isOpen = expanded === c.id;
          const items = parseBreakdown(c.amount_breakdown);
          return (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : c.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">
                    {isRu ? `Содержание дома · ${formatPeriod(c.period, isRu)}` : `Uyga xizmat · ${formatPeriod(c.period, isRu)}`}
                  </div>
                  {apartments.length > 1 && apt && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {isRu ? 'Кв.' : 'Xon.'} №{apt.number}
                    </div>
                  )}
                </div>
                <div className="text-right ml-3">
                  <div className="text-sm font-bold tabular-nums text-gray-900">
                    {fmt(c.amount)} сум
                  </div>
                  <div className={`text-[11px] mt-0.5 tabular-nums ${debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {debt > 0
                      ? (isRu ? `Долг ${fmt(debt)}` : `Qarz ${fmt(debt)}`)
                      : (isRu ? 'Оплачено' : 'To\'langan')}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3">
                  {items.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-gray-100">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        {isRu ? 'Расшифровка' : 'Batafsil'}
                      </div>
                      {items.map((it, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-600 truncate mr-2">{it.name}</span>
                          <span className="text-gray-900 tabular-nums flex-shrink-0">{fmt(it.share)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => printReceipt(
                      c, apt, user?.name || '—', tenantName, isRu
                    )}
                    className="w-full mt-2 py-2.5 rounded-lg border-2 border-primary-300 text-primary-700 hover:bg-primary-50 font-medium text-sm flex items-center justify-center gap-2"
                  >
                    {isRu ? 'Скачать квитанцию (PDF)' : 'Kvitansiya (PDF)'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info footer */}
      <div className="text-[11px] text-gray-400 text-center pt-4">
        {isRu
          ? 'Онлайн-оплата через Payme/Click — в разработке. Пока квитанцию можно распечатать и оплатить в банке.'
          : 'Payme/Click orqali to\'lov — ishlab chiqilmoqda. Hozircha kvitansiyani chop etib bankda to\'lang.'}
      </div>
    </ResidentFinanceShell>
  );
}
