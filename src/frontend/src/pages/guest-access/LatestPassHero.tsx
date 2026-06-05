// Resident pass hero — Claude Design §06-propuska ticket card.
// Brown gradient ticket with side notches, perforation, status pill,
// QR + meta block on top, 3-button action row below. Behaviour is
// preserved from the previous implementation: handleShare uses
// navigator.share with clipboard fallback, handleCopy writes qrToken
// to clipboard, "Отозвать" defers to the existing ConfirmDialog
// through onRevoke. Source of truth: design/handoff/passes-handoff.md.

import { useRef, useEffect } from 'react';
import { Share2, Copy, X, QrCode } from 'lucide-react';
import { generateQRCodeCanvas } from '../../components/LazyQRCode';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import type { GuestAccessCode } from '../../types';
import { safeVisitorLabel, safeAccessLabel } from './utils';

const TEXT_ON_DARK = '#F4F0E8';

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

  // Render the real QR into the 108×108 holder (2× pixel ratio).
  useEffect(() => {
    if (canvasRef.current) {
      generateQRCodeCanvas(canvasRef.current, code.qrToken, {
        width: 216,
        margin: 1,
        color: { dark: '#1C1917', light: '#ffffff' },
      });
    }
  }, [code.qrToken]);

  const visitorLabel = safeVisitorLabel(code.visitorType);
  const accessLabel = safeAccessLabel(code.accessType);
  const isActive = code.status === 'active';

  // Time-left text. "действует ещё N ч/мин" for active, status word for the rest.
  const validUntil = new Date(code.validUntil);
  const now = new Date();
  const msLeft = validUntil.getTime() - now.getTime();
  let timeLeftText: string;
  if (isActive && msLeft > 0) {
    const totalMin = Math.max(1, Math.round(msLeft / 60000));
    if (totalMin < 60) {
      timeLeftText = language === 'ru'
        ? `действует ещё ${totalMin} мин`
        : `${totalMin} daq qoldi`;
    } else {
      const hours = Math.round(totalMin / 60);
      timeLeftText = language === 'ru'
        ? `действует ещё ${hours} ч`
        : `${hours} soat qoldi`;
    }
  } else if (code.status === 'used') {
    timeLeftText = language === 'ru' ? 'использован' : 'ishlatilgan';
  } else if (code.status === 'revoked') {
    timeLeftText = language === 'ru' ? 'отозван' : 'bekor qilingan';
  } else {
    timeLeftText = language === 'ru' ? 'истёк' : 'tugagan';
  }

  // Status pill colours per handoff (green / blue / red).
  const statusPill = isActive
    ? { fg: '#86EFAC', bg: 'rgba(34,197,94,0.18)', dot: '#22C55E', label: language === 'ru' ? 'Активен' : 'Faol' }
    : code.status === 'used'
      ? { fg: '#93C5FD', bg: 'rgba(59,130,246,0.18)', dot: '#3B82F6', label: language === 'ru' ? 'Использован' : 'Ishlatilgan' }
      : code.status === 'revoked'
        ? { fg: '#FCA5A5', bg: 'rgba(226,72,61,0.18)', dot: '#E2483D', label: language === 'ru' ? 'Отозван' : 'Bekor' }
        : { fg: '#FCA5A5', bg: 'rgba(226,72,61,0.18)', dot: '#E2483D', label: language === 'ru' ? 'Истёк' : 'Tugagan' };

  // Eyebrow + headline + meta block
  const headline = code.visitorName
    || (language === 'ru' ? visitorLabel.label : visitorLabel.labelUz);
  const accessText = language === 'ru' ? accessLabel.label : accessLabel.labelUz;
  const usesText = code.maxUses > 1
    ? (language === 'ru'
      ? `Использовано: ${code.currentUses} из ${code.maxUses}`
      : `Ishlatilgan: ${code.currentUses} / ${code.maxUses}`)
    : null;

  // ─── handlers (unchanged from prior implementation) ─────────────────
  const handleShare = async () => {
    const untilStr = validUntil.toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const text = language === 'ru'
      ? `Пропуск Kamizo · ${language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}\n${code.residentAddress}, кв. ${code.residentApartment}\nДействует до ${untilStr}\nКод: ${code.qrToken}`
      : `Kamizo ruxsatnomasi · ${visitorLabel.labelUz}\n${code.residentAddress}, ${code.residentApartment}-xona\n${untilStr} gacha amal qiladi\nKod: ${code.qrToken}`;
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
      addToast('success', language === 'ru' ? 'Данные пропуска скопированы' : "Ma'lumotlar nusxalandi");
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
    <div style={{ position: 'relative', filter: 'drop-shadow(0 16px 32px rgba(28,25,23,0.22))' }}>
      {/* Side notches — punched out of the ticket by painting the page bg */}
      <div aria-hidden style={{
        position: 'absolute', left: -9, top: '58%', width: 18, height: 18,
        borderRadius: 999, background: 'var(--app-bg)', zIndex: 2,
      }} />
      <div aria-hidden style={{
        position: 'absolute', right: -9, top: '58%', width: 18, height: 18,
        borderRadius: 999, background: 'var(--app-bg)', zIndex: 2,
      }} />

      <div style={{
        borderRadius: 28,
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)',
        color: TEXT_ON_DARK,
      }}>
        {/* Top half: meta + QR row */}
        <div style={{ position: 'relative', padding: '18px 18px 0' }}>
          <div aria-hidden style={{
            position: 'absolute', inset: 0, opacity: 0.4,
            background: 'radial-gradient(90% 80% at 90% 0%, rgba(251,146,60,0.5), transparent 55%)',
            pointerEvents: 'none',
          }} />

          {/* Status pill (left) + time-left text (right) */}
          <div style={{
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: statusPill.fg, background: statusPill.bg,
              padding: '4px 10px', borderRadius: 999,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999,
                background: statusPill.dot,
                animation: isActive ? 'kzPulse 1.6s infinite' : 'none',
              }} />
              {statusPill.label}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(244,240,232,0.7)', fontWeight: 600 }}>
              {timeLeftText}
            </span>
          </div>

          {/* QR + meta row */}
          <div style={{
            position: 'relative', marginTop: 14, marginBottom: 16,
            display: 'flex', gap: 16, alignItems: 'center',
          }}>
            <button
              type="button"
              onClick={onOpen}
              aria-label={language === 'ru' ? 'Открыть QR' : 'QR ni ochish'}
              style={{
                padding: 7, background: '#fff', borderRadius: 14,
                flex: '0 0 auto', border: 'none', cursor: 'pointer',
                display: 'block',
              }}
            >
              <canvas ref={canvasRef} style={{ width: 108, height: 108, display: 'block' }} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                color: 'rgba(244,240,232,0.55)', textTransform: 'uppercase',
              }}>
                {language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}
              </div>
              <div style={{
                fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15,
                marginTop: 3, color: TEXT_ON_DARK,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {headline}
              </div>
              <div style={{
                fontSize: 12.5, color: 'rgba(244,240,232,0.7)', marginTop: 8, lineHeight: 1.5,
              }}>
                {accessText}
                {code.visitorVehiclePlate ? <><br/>{code.visitorVehiclePlate}</> : null}
                {usesText ? <><br/>{usesText}</> : null}
              </div>
            </div>
          </div>
        </div>

        {/* Perforation */}
        <div aria-hidden style={{
          borderTop: '2px dashed rgba(244,240,232,0.22)',
          margin: '0 14px',
        }} />

        {/* Action grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 14 }}>
          <ActionButton
            Icon={Share2}
            label={language === 'ru' ? 'Поделиться' : 'Ulashish'}
            onClick={handleShare}
          />
          <ActionButton
            Icon={Copy}
            label={language === 'ru' ? 'Код' : 'Kod'}
            onClick={handleCopy}
          />
          {isActive ? (
            <ActionButton
              Icon={X}
              label={language === 'ru' ? 'Отозвать' : 'Bekor'}
              onClick={onRevoke}
              danger
            />
          ) : (
            <ActionButton
              Icon={QrCode}
              label={language === 'ru' ? 'Открыть' : 'Ochish'}
              onClick={onOpen}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  Icon, label, onClick, danger,
}: {
  Icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: 10,
        borderRadius: 14,
        border: 'none',
        cursor: 'pointer',
        background: danger ? 'rgba(226,72,61,0.18)' : 'rgba(244,240,232,0.12)',
        color: danger ? '#FCA5A5' : TEXT_ON_DARK,
        fontSize: 12, fontWeight: 650 as unknown as number,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
