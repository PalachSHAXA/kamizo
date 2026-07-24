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

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    if (Array.isArray(parsed?.items)) return parsed.items;
    return [];
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

  if (loading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-red-500 font-semibold mb-2">{error}</div>
        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
          {isRu ? 'Обновить' : 'Yangilash'}
        </button>
      </div>
    );
  }

  if (apartments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">
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
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isRu ? 'Мои начисления' : 'Mening hisoblarim'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {apartments.length === 1
              ? (isRu ? `Квартира №${apartments[0].number}` : `Xonadon №${apartments[0].number}`)
              : (isRu ? `Квартир: ${apartments.length}` : `Xonadonlar: ${apartments.length}`)}
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

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
          {isRu ? 'История начислений' : 'Hisoblar tarixi'}
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
                    {formatPeriod(c.period, isRu)}
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
                    📄 {isRu ? 'Скачать квитанцию (PDF)' : 'Kvitansiya (PDF)'}
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
    </div>
  );
}
