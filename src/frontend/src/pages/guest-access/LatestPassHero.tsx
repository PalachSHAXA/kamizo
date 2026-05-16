// Sprint 21: extracted from ResidentGuestAccessPage. The most recent
// pass shown as a "hero" tile at the top of the page — large QR with
// share / copy / collapse actions.

import { useRef, useEffect } from 'react';
import { QrCode, X, Share2, Copy } from 'lucide-react';
import { generateQRCodeCanvas } from '../../components/LazyQRCode';
import { useToastStore } from '../../stores/toastStore';
import type { GuestAccessCode } from '../../types';
import { safeVisitorLabel, safeAccessLabel } from './utils';

export function LatestPassHero({
  code,
  onOpen,
  onRevoke,
}: {
  code: GuestAccessCode;
  onOpen: () => void;
  onRevoke: () => void;
}) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      // Render at 2× the displayed size so the QR stays crisp on retina;
      // displayed at ~118px below. Previous 200×200 was overkill and pushed
      // the action buttons against the screen edge on narrow phones.
      // Render at 2× the displayed 96px so the QR stays crisp on retina
      // without dominating the card. Bumped down from 118 → 96 because the
      // wider QR squeezed the action stack on narrow phones.
      generateQRCodeCanvas(canvasRef.current, code.qrToken, {
        width: 192,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
    }
  }, [code.qrToken]);

  const visitorLabel = safeVisitorLabel(code.visitorType);
  const accessLabel = safeAccessLabel(code.accessType);
  const isActive = code.status === 'active';

  // Compact "until" text — just hours:minutes if today, else day+month
  const validUntil = new Date(code.validUntil);
  const isToday = validUntil.toDateString() === new Date().toDateString();
  const untilText = isToday
    ? validUntil.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { hour: '2-digit', minute: '2-digit' })
    : validUntil.toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const statusColor =
    code.status === 'active' ? '#22c55e' :
    code.status === 'used' ? '#3b82f6' :
    code.status === 'revoked' ? '#ef4444' :
    '#9ca3af';
  const statusText =
    code.status === 'active' ? (language === 'ru' ? 'Активен' : 'Faol') :
    code.status === 'used' ? (language === 'ru' ? 'Использован' : 'Ishlatilgan') :
    code.status === 'revoked' ? (language === 'ru' ? 'Отозван' : 'Bekor qilingan') :
    (language === 'ru' ? 'Истёк' : 'Tugagan');

  // Subtitle line — the big white text under the visitor type label.
  // Falls back to access type name when no visitor name (e.g. courier).
  const headline = code.visitorName
    || (language === 'ru' ? visitorLabel.label : visitorLabel.labelUz);

  // Meta line — access scope ("Подъезд + двор" style) + uses counter
  const accessText = language === 'ru' ? accessLabel.label : accessLabel.labelUz;
  const usesText = code.maxUses > 1
    ? (language === 'ru' ? `Использовано: ${code.currentUses} из ${code.maxUses}` : `Ishlatilgan: ${code.currentUses} / ${code.maxUses}`)
    : null;

  const handleShare = async () => {
    const text = language === 'ru'
      ? `Пропуск Kamizo · ${language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}\n${code.residentAddress}, кв. ${code.residentApartment}\nДействует до ${untilText}\nКод: ${code.qrToken}`
      : `Kamizo ruxsatnomasi · ${visitorLabel.labelUz}\n${code.residentAddress}, ${code.residentApartment}-xona\n${untilText} gacha amal qiladi\nKod: ${code.qrToken}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: language === 'ru' ? 'Пропуск' : 'Ruxsatnoma', text });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      addToast('success', language === 'ru' ? 'Данные пропуска скопированы' : 'Ma\'lumotlar nusxalandi');
    } catch {
      onOpen();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.qrToken);
      addToast('success', language === 'ru' ? 'Код скопирован' : 'Kod nusxalandi');
    } catch { /* ignore */ }
  };

  return (
    <div className="px-3 md:px-0">
      <div
        className="relative rounded-[22px] overflow-hidden p-4 shadow-[0_12px_28px_rgba(var(--brand-rgb),0.32)]"
        style={{
          background: 'linear-gradient(135deg, #FB923C 0%, #F97316 45%, #EA580C 100%)',
        }}
      >
        {/* Decorative orb in top-right corner — soft warm highlight */}
        <div
          className="absolute -top-12 -right-12 w-44 h-44 rounded-full opacity-50 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)', filter: 'blur(6px)' }}
        />

        {/* Top row: status pill + until time */}
        <div className="relative flex items-center justify-between mb-3">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/95 shadow-sm"
            style={{ color: statusColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
            {statusText}
          </span>
          <span className="text-[12px] font-semibold text-white/90">
            {language === 'ru' ? 'до' : 'gacha'} {untilText}
          </span>
        </div>

        {/* Body: smaller QR on the left + info on top-right + action buttons
            stacked under the info on the right. The QR was shrunk to 92×92
            so the right column has enough horizontal room (~150px+) to
            host icon-only round buttons without truncation. */}
        <div className="relative flex items-start gap-3.5">
          <button
            onClick={onOpen}
            className="bg-white p-2 rounded-[14px] shrink-0 active:scale-[0.97] transition-transform touch-manipulation shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
            aria-label={language === 'ru' ? 'Открыть QR' : 'QR-ni ochish'}
          >
            <canvas ref={canvasRef} className="w-[92px] h-[92px] block" />
          </button>

          <div className="min-w-0 flex-1 flex flex-col">
            {/* Info block */}
            <div className="pt-0.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                {language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}
              </div>
              <div className="text-[16px] leading-tight font-extrabold text-white mt-0.5 truncate">
                {headline}
              </div>
              <div className="text-[11.5px] text-white/85 mt-1 truncate">{accessText}</div>
              {code.visitorVehiclePlate && (
                <div className="text-[11.5px] text-white/85 mt-0.5 font-mono tracking-wider truncate">
                  {code.visitorVehiclePlate}
                </div>
              )}
              {usesText && (
                <div className="text-[10.5px] text-white/75 mt-0.5 truncate">{usesText}</div>
              )}
            </div>

            {/* Action stack — icon-only square tiles right of the QR. Three
                buttons fit the right column even on iPhone SE (375 → ~155px
                available after gap+QR). aria-label carries the verbose
                name; tooltip via title for desktop. */}
            <div className="mt-2.5 flex items-center gap-1.5">
              <button
                onClick={handleShare}
                aria-label={language === 'ru' ? 'Поделиться пропуском' : 'Ulashish'}
                title={language === 'ru' ? 'Поделиться' : 'Ulashish'}
                className="w-9 h-9 rounded-[11px] bg-white/18 hover:bg-white/24 active:bg-white/30 text-white flex items-center justify-center active:scale-[0.95] transition-all touch-manipulation border border-white/20 backdrop-blur-sm shrink-0"
              >
                <Share2 className="w-[16px] h-[16px]" strokeWidth={2.2} />
              </button>
              <button
                onClick={handleCopy}
                aria-label={language === 'ru' ? 'Скопировать код' : 'Kodni nusxalash'}
                title={language === 'ru' ? 'Копировать код' : 'Kodni nusxalash'}
                className="w-9 h-9 rounded-[11px] bg-white/18 hover:bg-white/24 active:bg-white/30 text-white flex items-center justify-center active:scale-[0.95] transition-all touch-manipulation border border-white/20 backdrop-blur-sm shrink-0"
              >
                <Copy className="w-[16px] h-[16px]" strokeWidth={2.2} />
              </button>
              <button
                onClick={isActive ? onRevoke : onOpen}
                aria-label={isActive ? (language === 'ru' ? 'Отозвать пропуск' : 'Bekor qilish') : (language === 'ru' ? 'Открыть QR' : 'QR ni ochish')}
                title={isActive ? (language === 'ru' ? 'Отозвать' : 'Bekor') : (language === 'ru' ? 'Открыть' : 'Ochish')}
                className={`w-9 h-9 rounded-[11px] flex items-center justify-center active:scale-[0.95] transition-all touch-manipulation border backdrop-blur-sm shrink-0 ${
                  isActive
                    ? 'bg-white/95 text-red-600 border-white/40 hover:bg-white'
                    : 'bg-white/95 hover:bg-white border-white/40'
                }`}
                style={!isActive ? { color: 'rgb(var(--brand-rgb))' } : undefined}
              >
                {isActive ? <X className="w-[16px] h-[16px]" strokeWidth={2.2} /> : <QrCode className="w-[16px] h-[16px]" strokeWidth={2.2} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Create pass form component
