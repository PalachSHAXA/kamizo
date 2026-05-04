import { useState, useRef, useEffect, useMemo } from 'react';
import {
  QrCode, X, Clock, Package, Users, Car, User,
  Share2, Download, Copy, ChevronRight, ArrowLeft, Calendar,
  History, CheckCircle2, XCircle
} from 'lucide-react';
import { EmptyState, StatusBadge, ConfirmDialog } from '../components/common';
import type { StatusTone } from '../theme';
import { generateQRCodeCanvas } from '../components/LazyQRCode';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { apiRequest } from '../services/api';
import {
  VISITOR_TYPE_LABELS, ACCESS_TYPE_LABELS, GUEST_ACCESS_STATUS_LABELS,
  type GuestAccessCode, type VisitorType, type AccessType
} from '../types';
import { safeLabel } from '../utils/safeLabel';

// Server log shape — matches /api/guest-codes/scan-history.
// Mirrors the same interface used in GuardQRScannerPage but lives here too
// so we don't cross-import a guard-only file.
interface VisitLog {
  id: string;
  code_id: string;
  scanned_by_id: string;
  scanned_by_name: string;
  scanned_by_role: string;
  action: string;
  visitor_type: string;
  resident_name: string;
  resident_apartment: string;
  scanned_at: string;
}

// Map guest-access status to semantic StatusTone for StatusBadge
function toneFor(status: string): StatusTone {
  if (status === 'active') return 'active';
  if (status === 'used') return 'info';
  if (status === 'revoked') return 'critical';
  return 'expired';
}

const safeVisitorLabel = (t: unknown) => safeLabel(VISITOR_TYPE_LABELS, t, VISITOR_TYPE_LABELS.other);
const safeAccessLabel = (t: unknown) => safeLabel(ACCESS_TYPE_LABELS, t, ACCESS_TYPE_LABELS.custom);
const safeStatusLabel = (s: unknown) => safeLabel(GUEST_ACCESS_STATUS_LABELS, s, GUEST_ACCESS_STATUS_LABELS.expired);

// QR Code display component
function QRCodeDisplay({ codeId, onClose }: { codeId: string; onClose: () => void }) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const { guestAccessCodes } = useDataStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // Get latest code from store to ensure updated values (like currentUses)
  const code = guestAccessCodes.find(c => c.id === codeId);

  useEffect(() => {
    if (canvasRef.current && code) {
      generateQRCodeCanvas(canvasRef.current, code.qrToken, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-render QR when token changes; code object identity changes on every store update
  }, [code?.qrToken]);

  if (!code) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.qrToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `guest-pass-${code.id}.png`;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    }
  };

  // Create combined image with QR code and caption text
  const createImageWithCaption = async (): Promise<Blob | null> => {
    if (!canvasRef.current) return null;

    const qrCanvas = canvasRef.current;
    const qrSize = qrCanvas.width;

    // Create new canvas with extra space for text
    const combinedCanvas = document.createElement('canvas');
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) return null;

    const padding = 30;
    const textAreaHeight = 160;
    combinedCanvas.width = qrSize + padding * 2;
    combinedCanvas.height = qrSize + padding * 2 + textAreaHeight;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

    // Draw QR code
    ctx.drawImage(qrCanvas, padding, padding);

    // Add text below QR code
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'center';
    const centerX = combinedCanvas.width / 2;
    let y = qrSize + padding + 30;

    // Title
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(language === 'ru' ? 'Пропуск для гостя' : 'Mehmon uchun ruxsatnoma', centerX, y);
    y += 28;

    // Address
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#4b5563';
    const addressText = `${code.residentAddress}, ${language === 'ru' ? 'кв.' : 'xon.'} ${code.residentApartment}`;
    ctx.fillText(addressText, centerX, y);
    y += 24;

    // Resident name
    ctx.fillText(code.residentName, centerX, y);
    y += 28;

    // Valid until
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#059669';
    const validUntil = new Date(code.validUntil).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ');
    ctx.fillText(`${language === 'ru' ? 'Действует до:' : 'Gacha:'} ${validUntil}`, centerX, y);

    return new Promise((resolve) => {
      combinedCanvas.toBlob(resolve, 'image/png');
    });
  };

  const handleShare = async () => {
    // Share cascade:
    //  1) Web Share with file — mobile default.
    //  2) Web Share with text only — when canShare(files) is false
    //     (Chrome on Android sometimes rejects PNG files).
    //  3) Clipboard write (image) — desktop.
    //  4) Clipboard write (text) — when image clipboard is blocked.
    //  5) Download — absolute fallback.
    // Previously the button silently no-op'd if steps 1-3 all failed
    // without surfacing any feedback.
    const combinedBlob = await createImageWithCaption();
    const passText = language === 'ru'
      ? `Пропуск для гостя\n${code.residentAddress}, кв. ${code.residentApartment}\nОт: ${code.residentName}\nКод: ${code.qrToken}`
      : `Mehmon uchun ruxsatnoma\n${code.residentAddress}, ${code.residentApartment}-xona\nKimdan: ${code.residentName}\nKod: ${code.qrToken}`;

    if (combinedBlob && navigator.share) {
      const file = new File([combinedBlob], `guest-pass-${code.id}.png`, { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: language === 'ru' ? 'Пропуск' : 'Ruxsatnoma', text: passText });
          return;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
      // Try share without files (text-only)
      try {
        await navigator.share({ title: language === 'ru' ? 'Пропуск' : 'Ruxsatnoma', text: passText });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Desktop: copy image to clipboard
    if (combinedBlob) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': combinedBlob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        addToast('info', language === 'ru'
          ? 'QR-код скопирован в буфер обмена. Вставьте его в чат (Ctrl+V)'
          : 'QR-kod buferga nusxalandi. Chatga qo\'ying (Ctrl+V)');
        return;
      } catch { /* fall through */ }
    }

    // Text clipboard fallback — image clipboard is blocked on some browsers
    try {
      await navigator.clipboard.writeText(passText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast('success', language === 'ru'
        ? 'Данные пропуска скопированы. Отправьте их гостю.'
        : 'Ruxsatnoma ma\'lumotlari nusxalandi.');
      return;
    } catch { /* fall through */ }

    // Final fallback — download the image so the user has something tangible
    handleDownload();
    addToast('info', language === 'ru'
      ? 'QR-код сохранён в Загрузки — отправьте файл гостю'
      : 'QR-kod Yuklamalarga saqlandi');
  };

  const visitorLabel = safeVisitorLabel(code.visitorType);
  const accessLabel = safeAccessLabel(code.accessType);
  const statusLabel = safeStatusLabel(code.status);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base sm:text-lg font-bold">
            {language === 'ru' ? 'QR-код пропуска' : 'Ruxsatnoma QR-kodi'}
          </h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl touch-manipulation" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code */}
        <div className="p-6 flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl shadow-lg border-2 border-gray-100">
            <canvas ref={canvasRef} />
          </div>

          {/* Status badge — unified via StatusBadge */}
          <div className="mt-4">
            <StatusBadge status={toneFor(code.status)}>
              {language === 'ru' ? statusLabel.label : statusLabel.labelUz}
            </StatusBadge>
          </div>

          {/* Info */}
          <div className="mt-4 w-full space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Тип' : 'Turi'}:</span>
              <span className="font-medium flex items-center gap-1">
                {visitorLabel.icon} {language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Срок' : 'Muddat'}:</span>
              <span className="font-medium">{language === 'ru' ? accessLabel.label : accessLabel.labelUz}</span>
            </div>
            {code.visitorName && (
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Гость' : 'Mehmon'}:</span>
                <span className="font-medium">{code.visitorName}</span>
              </div>
            )}
            {code.visitorVehiclePlate && (
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Авто гостя' : 'Mehmon avto'}:</span>
                <span className="font-medium font-mono tracking-wider">{code.visitorVehiclePlate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Действует до' : 'Gacha amal qiladi'}:</span>
              <span className="font-medium">{new Date(code.validUntil).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}</span>
            </div>
            {/* Revocation reason */}
            {code.status === 'revoked' && code.revocationReason && (
              <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-200">
                <div className="text-red-700 text-sm font-medium">
                  {language === 'ru' ? 'Причина отмены' : 'Bekor qilish sababi'}:
                </div>
                <div className="text-red-600 text-sm mt-1">
                  {code.revocationReason}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t grid grid-cols-3 gap-2">
          <button
            onClick={handleShare}
            className="flex flex-col items-center gap-1 p-3 min-h-[44px] bg-primary-50 hover:bg-primary-100 active:bg-primary-200 rounded-lg sm:rounded-xl transition-colors touch-manipulation"
          >
            <Share2 className="w-5 h-5 text-primary-600" />
            <span className="text-xs text-primary-700">{language === 'ru' ? 'Поделиться' : 'Ulashish'}</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex flex-col items-center gap-1 p-3 min-h-[44px] bg-green-50 hover:bg-green-100 active:bg-green-200 rounded-lg sm:rounded-xl transition-colors touch-manipulation"
          >
            <Download className="w-5 h-5 text-green-600" />
            <span className="text-xs text-green-700">{language === 'ru' ? 'Сохранить' : 'Saqlash'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex flex-col items-center gap-1 p-3 min-h-[44px] bg-purple-50 hover:bg-purple-100 active:bg-purple-200 rounded-lg sm:rounded-xl transition-colors touch-manipulation"
          >
            <Copy className="w-5 h-5 text-purple-600" />
            <span className="text-xs text-purple-700">
              {copied ? (language === 'ru' ? 'Скопировано!' : 'Nusxa olindi!') : (language === 'ru' ? 'Код' : 'Kod')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Hero card showing the most recent guest pass.
// Sits at the top of the page so the resident can hand off the active pass
// to a guest without scrolling through the history list.
function LatestPassHero({
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
      generateQRCodeCanvas(canvasRef.current, code.qrToken, {
        width: 200,
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

        {/* Body: QR on left, info + actions stacked on right */}
        <div className="relative flex items-start gap-4">
          <button
            onClick={onOpen}
            className="bg-white p-2 rounded-[14px] shrink-0 active:scale-[0.97] transition-transform touch-manipulation shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
            aria-label={language === 'ru' ? 'Открыть QR' : 'QR-ni ochish'}
          >
            <canvas ref={canvasRef} className="w-[140px] h-[140px] block" />
          </button>

          <div className="min-w-0 flex-1 flex flex-col">
            {/* Info block */}
            <div className="pt-0.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                {language === 'ru' ? visitorLabel.label : visitorLabel.labelUz}
              </div>
              <div className="text-[18px] leading-tight font-extrabold text-white mt-0.5 truncate">
                {headline}
              </div>
              <div className="text-[12px] text-white/85 mt-1 truncate">{accessText}</div>
              {code.visitorVehiclePlate && (
                <div className="text-[12px] text-white/85 mt-0.5 font-mono tracking-wider truncate">
                  {code.visitorVehiclePlate}
                </div>
              )}
              {usesText && (
                <div className="text-[11px] text-white/75 mt-0.5 truncate">{usesText}</div>
              )}
            </div>

            {/* Action stack — vertical, compact, right of QR */}
            <div className="mt-3 space-y-1.5">
              <button
                onClick={handleShare}
                className="w-full px-2.5 py-2 min-h-[36px] rounded-[10px] bg-white/18 hover:bg-white/24 active:bg-white/30 text-white font-bold text-[12px] active:scale-[0.97] transition-all touch-manipulation flex items-center gap-1.5 border border-white/20 backdrop-blur-sm"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{language === 'ru' ? 'Поделиться' : 'Ulashish'}</span>
              </button>
              <button
                onClick={handleCopy}
                className="w-full px-2.5 py-2 min-h-[36px] rounded-[10px] bg-white/18 hover:bg-white/24 active:bg-white/30 text-white font-bold text-[12px] active:scale-[0.97] transition-all touch-manipulation flex items-center gap-1.5 border border-white/20 backdrop-blur-sm"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{language === 'ru' ? 'Код' : 'Kod'}</span>
              </button>
              <button
                onClick={isActive ? onRevoke : onOpen}
                className={`w-full px-2.5 py-2 min-h-[36px] rounded-[10px] font-bold text-[12px] active:scale-[0.97] transition-all touch-manipulation flex items-center gap-1.5 border backdrop-blur-sm ${
                  isActive
                    ? 'bg-white/95 text-red-600 border-white/40 hover:bg-white'
                    : 'bg-white/95 hover:bg-white border-white/40'
                }`}
                style={!isActive ? { color: 'rgb(var(--brand-rgb))' } : undefined}
              >
                {isActive ? <X className="w-3.5 h-3.5 shrink-0" /> : <QrCode className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">
                  {isActive
                    ? (language === 'ru' ? 'Отозвать' : 'Bekor')
                    : (language === 'ru' ? 'Открыть' : 'Ochish')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Create pass form component
function CreatePassForm({
  onClose,
  onCreated,
  initialVisitorType,
  initialAccessType,
}: {
  onClose: () => void;
  onCreated: (code: GuestAccessCode) => void;
  initialVisitorType?: VisitorType;
  initialAccessType?: AccessType;
}) {
  const { user } = useAuthStore();
  const { createGuestAccessCode } = useDataStore();
  const { language } = useLanguageStore();

  // Quick-create tiles pre-fill both visitor and access type — skip wizard
  // straight to step 3 (details) when both are passed in.
  const skipToDetails = !!initialVisitorType && !!initialAccessType;
  const [step, setStep] = useState(skipToDetails ? 3 : 1);
  const [visitorType, setVisitorType] = useState<VisitorType | null>(initialVisitorType ?? null);
  const [accessType, setAccessType] = useState<AccessType | null>(initialAccessType ?? null);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [hasVehicle, setHasVehicle] = useState(initialVisitorType === 'taxi');
  const [visitorVehiclePlate, setVisitorVehiclePlate] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [notes, setNotes] = useState('');

  const visitorTypes: { type: VisitorType; icon: React.ReactNode }[] = [
    { type: 'courier', icon: <Package className="w-8 h-8" /> },
    { type: 'guest', icon: <Users className="w-8 h-8" /> },
    { type: 'taxi', icon: <Car className="w-8 h-8" /> },
    { type: 'other', icon: <User className="w-8 h-8" /> },
  ];

  const accessTypes: AccessType[] = ['single_use', 'day', 'week', 'custom'];

  const [isCreating, setIsCreating] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);

  // Name is required for person-type visitors — without it the guard has
  // nothing to match against at the gate. Couriers/taxis are identified by
  // package/plate so name stays optional.
  const needsVisitorName = visitorType === 'guest' || visitorType === 'other';
  const canSubmit =
    !!visitorType &&
    !!accessType &&
    !isCreating &&
    (!needsVisitorName || visitorName.trim().length >= 2) &&
    (accessType !== 'custom' || !!customDate);

  const handleCreate = async () => {
    if (!visitorType || !accessType || !user || isCreating) {
      return;
    }

    if (needsVisitorName && visitorName.trim().length < 2) {
      setCreateError(language === 'ru'
        ? 'Укажите имя гостя — охраннику нужно кого-то ждать на входе'
        : 'Mehmon ismini kiriting — qo\'riqchi kimni kutishini bilishi kerak');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      let validUntil: string | undefined;
      if (accessType === 'custom' && customDate) {
        const parsed = new Date(customDate);
        if (isNaN(parsed.getTime())) {
          setCreateError(language === 'ru' ? 'Некорректная дата' : 'Noto\'g\'ri sana');
          setIsCreating(false);
          return;
        }
        // Prevent dates too far in the future (max 1 year)
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 1);
        if (parsed > maxDate) {
          setCreateError(language === 'ru' ? 'Дата не может быть более 1 года от текущей' : 'Sana joriy sanadan 1 yildan oshmasligi kerak');
          setIsCreating(false);
          return;
        }
        if (parsed <= new Date()) {
          setCreateError(language === 'ru' ? 'Дата должна быть в будущем' : 'Sana kelajakda bo\'lishi kerak');
          setIsCreating(false);
          return;
        }
        validUntil = parsed.toISOString();
      }

      const code = await createGuestAccessCode({
        residentId: user.id,
        residentName: user.name,
        residentPhone: user.phone || 'Не указан',
        residentApartment: user.apartment || '',
        residentAddress: user.address || '',
        visitorType,
        visitorName: visitorName || undefined,
        visitorPhone: visitorPhone || undefined,
        visitorVehiclePlate: visitorVehiclePlate || undefined,
        accessType,
        validUntil,
        notes: notes || undefined,
      });

      if (code) {
        onCreated(code);
      } else {
        setCreateError(language === 'ru' ? 'Не удалось создать пропуск' : 'Ruxsatnoma yaratib bo\'lmadi');
      }
    } catch (err: unknown) {
      console.error('Failed to create pass:', err);
      setCreateError((err instanceof Error ? err.message : null) || (language === 'ru' ? 'Ошибка создания' : 'Yaratishda xatolik'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl touch-manipulation" aria-label="Назад">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-base sm:text-lg font-bold">
              {language === 'ru' ? 'Создать пропуск' : 'Ruxsatnoma yaratish'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl touch-manipulation" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1 flex items-center">
                <div className={`w-full h-1.5 rounded-full ${s <= step ? 'bg-primary-500' : 'bg-gray-200'}`} />
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2 text-center">
            {language === 'ru' ? `Шаг ${step} из 3` : `${step}-qadam 3 dan`}
          </div>
        </div>

        <div className="p-4">
          {/* Step 1: Visitor Type */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'Кого ожидаете?' : 'Kimni kutayapsiz?'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {visitorTypes.map(({ type, icon }) => {
                  const label = VISITOR_TYPE_LABELS[type];
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setVisitorType(type);
                        // Reset vehicle fields when changing visitor type
                        setHasVehicle(type === 'taxi');
                        setVisitorVehiclePlate('');
                        setStep(2);
                      }}
                      className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                        visitorType === type
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={visitorType === type ? 'text-primary-600' : 'text-gray-600'}>
                        {icon}
                      </div>
                      <span className="font-medium text-sm">
                        {language === 'ru' ? label.label : label.labelUz}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Access Type */}
          {step === 2 && (
            <div className="space-y-3">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'На какой срок?' : 'Qancha muddatga?'}
              </h3>
              <div className="space-y-2">
                {accessTypes.map((type) => {
                  const label = ACCESS_TYPE_LABELS[type];
                  // Compute concrete end time for display
                  const now = new Date();
                  let endTime = '';
                  if (type === 'single_use') {
                    const t = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    endTime = language === 'ru' ? `до ${t.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : `${t.toLocaleString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} gacha`;
                  } else if (type === 'day') {
                    const t = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    endTime = language === 'ru' ? `до ${t.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : `${t.toLocaleString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} gacha`;
                  } else if (type === 'week') {
                    const t = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    endTime = language === 'ru' ? `до ${t.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : `${t.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })} gacha`;
                  }
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setAccessType(type);
                        setStep(3);
                      }}
                      className={`w-full px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition-all text-left ${
                        accessType === type
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        accessType === type ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {type === 'single_use' && <span className="text-base font-bold">1</span>}
                        {type === 'day' && <Clock className="w-4 h-4" />}
                        {type === 'week' && <Calendar className="w-4 h-4" />}
                        {type === 'custom' && <Calendar className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {language === 'ru' ? label.label : label.labelUz}
                        </div>
                        <div className="text-xs text-gray-500">
                          {endTime || (language === 'ru' ? label.description : label.descriptionUz)}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'Дополнительно' : 'Qo\'shimcha'}
              </h3>

              {accessType === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Действует до *' : 'Gacha amal qiladi *'}
                  </label>
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => { setCustomDate(e.target.value); setCreateError(null); }}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    min={new Date().toISOString().slice(0, 16)}
                    max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 16); })()}
                  />
                </div>
              )}

              {(visitorType === 'guest' || visitorType === 'other') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Имя гостя' : 'Mehmon ismi'}
                      {needsVisitorName && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                      placeholder={language === 'ru' ? 'Иван Иванов' : 'Ism Familiya'}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Телефон гостя' : 'Mehmon telefoni'}
                    </label>
                    <input
                      type="tel"
                      value={visitorPhone}
                      onChange={(e) => setVisitorPhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    />
                  </div>
                </>
              )}

              {/* Vehicle: taxi always shows plate, others show toggle */}
              {visitorType === 'taxi' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Гос. номер такси' : 'Taksi davlat raqami'}
                  </label>
                  <input
                    type="text"
                    value={visitorVehiclePlate}
                    onChange={(e) => setVisitorVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="01 A 123 BC"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 font-mono tracking-widest"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        {language === 'ru' ? 'Приедет на авто?' : 'Avtomobil bilan keladimi?'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setHasVehicle(!hasVehicle); if (hasVehicle) setVisitorVehiclePlate(''); }}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${hasVehicle ? 'bg-primary-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${hasVehicle ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  {hasVehicle && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {language === 'ru' ? 'Гос. номер автомобиля' : 'Davlat raqami'}
                      </label>
                      <input
                        type="text"
                        value={visitorVehiclePlate}
                        onChange={(e) => setVisitorVehiclePlate(e.target.value.toUpperCase())}
                        placeholder="01 A 123 BC"
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 font-mono tracking-widest"
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Примечание' : 'Izoh'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={language === 'ru' ? 'Опционально...' : 'Ixtiyoriy...'}
                  rows={2}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 resize-none"
                />
              </div>

              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                  {createError}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={!canSubmit}
                className="w-full py-4 min-h-[44px] bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:bg-gray-300 text-gray-900 font-bold rounded-lg sm:rounded-xl transition-colors touch-manipulation"
              >
                {isCreating
                  ? (language === 'ru' ? 'Создание...' : 'Yaratilmoqda...')
                  : (language === 'ru' ? 'Создать пропуск' : 'Ruxsatnoma yaratish')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Quick-create tiles: 4 most-common visitor scenarios, one tap to start
// the create flow with both visitor type and access duration pre-selected.
type QuickPreset = {
  visitor: VisitorType;
  access: AccessType;
  icon: React.ReactNode;
  bg: string;
  fg: string;
  titleRu: string;
  titleUz: string;
  subRu: string;
  subUz: string;
};

const QUICK_PRESETS: QuickPreset[] = [
  {
    visitor: 'guest', access: 'day',
    icon: <Users className="w-4 h-4" />, bg: 'bg-emerald-50', fg: 'text-emerald-600',
    titleRu: 'Гость', titleUz: 'Mehmon', subRu: 'до 24 ч', subUz: '24 soatgacha',
  },
  {
    visitor: 'courier', access: 'single_use',
    icon: <Package className="w-4 h-4" />, bg: 'bg-amber-50', fg: 'text-amber-600',
    titleRu: 'Доставка', titleUz: 'Yetkazib berish', subRu: 'на 24 ч', subUz: '24 soat',
  },
  {
    visitor: 'other', access: 'day',
    icon: <User className="w-4 h-4" />, bg: 'bg-sky-50', fg: 'text-sky-600',
    titleRu: 'Услуги', titleUz: 'Xizmatlar', subRu: 'мастер', subUz: 'usta',
  },
  {
    visitor: 'taxi', access: 'single_use',
    icon: <Car className="w-4 h-4" />, bg: 'bg-violet-50', fg: 'text-violet-600',
    titleRu: 'Такси', titleUz: 'Taksi', subRu: '1 проезд', subUz: '1 marta',
  },
];

function QuickCreateTiles({ onPick }: { onPick: (preset: QuickPreset) => void }) {
  const { language } = useLanguageStore();
  return (
    <div className="px-3 md:px-0 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">
        {language === 'ru' ? 'Создать новый' : 'Yangi yaratish'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_PRESETS.map((p) => (
          <button
            key={`${p.visitor}-${p.access}`}
            onClick={() => onPick(p)}
            className="bg-white rounded-[14px] p-3 flex items-center gap-3 text-left active:scale-[0.97] transition-transform touch-manipulation min-h-[60px] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${p.bg} ${p.fg}`}>
              {p.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[14px] text-gray-900 leading-tight truncate">
                {language === 'ru' ? p.titleRu : p.titleUz}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                {language === 'ru' ? p.subRu : p.subUz}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Main page component
export function ResidentGuestAccessPage() {
  const { user } = useAuthStore();
  const { guestAccessCodes, fetchGuestCodes, revokeGuestAccessCode, isLoadingGuestCodes } = useDataStore();
  const { language } = useLanguageStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createPreset, setCreatePreset] = useState<{ visitor: VisitorType; access: AccessType } | null>(null);
  const [selectedCode, setSelectedCode] = useState<GuestAccessCode | null>(null);
  const [filter] = useState<'all' | 'active' | 'used' | 'expired' | 'revoked' | 'archive'>('all');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<GuestAccessCode | null>(null);
  const [showHistorySheet, setShowHistorySheet] = useState(false);

  // Visit history — list of scans from guards/security on this resident's
  // own QR codes. The backend endpoint returns ALL tenant logs, we filter
  // client-side by code_id ∈ user's codes. Useful answer to "приходил ли
  // курьер?" without having to call the УК.
  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);

  // Fetch codes on mount
  useEffect(() => {
    fetchGuestCodes();
  }, [fetchGuestCodes]);

  // Fetch the scan-history once codes are loaded so we know which IDs are ours.
  // Re-fetched whenever the codes list changes (new code created → maybe new
  // logs available too).
  useEffect(() => {
    if (!user?.id) return;
    apiRequest<{ logs: VisitLog[] }>('/api/guest-codes/scan-history')
      .then(res => setVisitLogs(res.logs || []))
      .catch(() => setVisitLogs([]))
      .finally(() => setLogsLoaded(true));
  }, [user?.id, guestAccessCodes.length]);

  // Filter logs to those tied to THIS resident's codes (last 30 entries).
  const myCodeIds = useMemo(() => new Set(guestAccessCodes.map(c => c.id)), [guestAccessCodes]);
  const myVisitLogs = useMemo(
    () => visitLogs.filter(log => myCodeIds.has(log.code_id)).slice(0, 30),
    [visitLogs, myCodeIds]
  );

  const allCodes = guestAccessCodes;

  // Update expired status
  const now = new Date();
  const codes = allCodes.map(c => {
    if (c.status === 'active' && now > new Date(c.validUntil)) {
      return { ...c, status: 'expired' as const };
    }
    return c;
  });

  // Archive cutoff: 30 days. Expired/used codes older than this go to "Архив" tab,
  // not cluttering "Все".
  const ARCHIVE_CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;
  const archiveCutoffDate = new Date(now.getTime() - ARCHIVE_CUTOFF_MS);

  function isArchived(c: typeof codes[number]): boolean {
    if (c.status === 'active') return false;
    const until = new Date(c.validUntil);
    return until < archiveCutoffDate;
  }

  const filteredCodes =
    filter === 'all'
      ? codes.filter(c => !isArchived(c))
      : filter === 'archive'
        ? codes.filter(isArchived)
        : codes.filter(c => c.status === filter && !isArchived(c));

  const activeCodes = codes.filter(c => c.status === 'active');

  // Pick the latest pass to feature at the top of the page.
  // Active passes win over historical ones — that's what the resident is most
  // likely to hand off right now. Within each group, sort by createdAt desc.
  const latestPass = useMemo(() => {
    const byCreated = (a: typeof codes[number], b: typeof codes[number]) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const activeSorted = [...activeCodes].sort(byCreated);
    if (activeSorted[0]) return activeSorted[0];
    const recentSorted = [...codes].filter(c => !isArchived(c)).sort(byCreated);
    return recentSorted[0] ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isArchived depends on `now` which we don't want to track
  }, [codes, activeCodes]);

  const handleCreated = (code: GuestAccessCode) => {
    setShowCreateForm(false);
    setSelectedCode(code);
  };

  const handleRevoke = async () => {
    if (!showRevokeConfirm || !user) return;
    await revokeGuestAccessCode(
      showRevokeConfirm.id,
      user.id,
      user.name,
      user.role,
      language === 'ru' ? 'Отменено жителем' : 'Turar joy egasi tomonidan bekor qilindi'
    );
    setShowRevokeConfirm(null);
  };

  // Two views: "active" (recent, non-archived) shown on main screen,
  // "archive" opened via the "История →" link as a separate sheet/list.
  const recentCodes = codes.filter(c => !isArchived(c));
  const archivedCodes = codes.filter(isArchived);
  const visibleCodes = showHistorySheet ? archivedCodes : recentCodes;
  // Keep `filter` reachable so we don't break it; not surfaced in UI now.
  void filter; void filteredCodes;

  return (
    <div className="space-y-4 md:space-y-5 pb-24 md:pb-0">
      {/* Header — eyebrow + big title + history shortcut */}
      <div className="flex items-end justify-between gap-4 px-3 md:px-0">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {language === 'ru' ? 'QR-доступ' : 'QR-kirish'}
          </div>
          <h1 className="text-[22px] md:text-[26px] leading-tight font-extrabold text-gray-900 mt-0.5">
            {language === 'ru' ? 'Гости и доставка' : 'Mehmonlar va yetkazib berish'}
          </h1>
        </div>
        <button
          onClick={() => setShowHistorySheet(s => !s)}
          className="w-11 h-11 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center text-gray-600 active:scale-[0.95] transition-transform touch-manipulation shrink-0"
          aria-label={language === 'ru' ? 'История' : 'Tarix'}
          title={language === 'ru' ? 'История' : 'Tarix'}
        >
          <History className="w-5 h-5" />
        </button>
      </div>

      {/* Latest pass hero — boarding-pass styled card so the resident can
          show/hand off the active QR without scrolling the list. */}
      {latestPass && !showHistorySheet && (
        <LatestPassHero
          code={latestPass}
          onOpen={() => setSelectedCode(latestPass)}
          onRevoke={() => setShowRevokeConfirm(latestPass)}
        />
      )}

      {/* Quick-create tiles: 2x2 grid of common scenarios */}
      {!showHistorySheet && (
        <QuickCreateTiles
          onPick={(p) => {
            setCreatePreset({ visitor: p.visitor, access: p.access });
            setShowCreateForm(true);
          }}
        />
      )}

      {/* Section header for the codes list */}
      <div className="flex items-center justify-between px-4 md:px-1 pt-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {showHistorySheet
            ? (language === 'ru' ? 'Архив' : 'Arxiv')
            : (language === 'ru' ? 'Все коды' : 'Barcha kodlar')}
        </div>
        {archivedCodes.length > 0 && (
          <button
            onClick={() => setShowHistorySheet(s => !s)}
            className="text-[12px] font-bold flex items-center gap-1 active:opacity-70 transition-opacity touch-manipulation"
            style={{ color: 'rgb(var(--brand-rgb))' }}
          >
            {showHistorySheet
              ? (language === 'ru' ? '← Назад' : '← Orqaga')
              : (language === 'ru' ? 'История →' : 'Tarix →')}
          </button>
        )}
      </div>

      {/* Codes list */}
      {isLoadingGuestCodes ? (
        <div className="bg-white rounded-[14px] p-8 text-center mx-3 md:mx-0">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center animate-pulse">
            <QrCode className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="font-medium text-gray-500">
            {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
          </h3>
        </div>
      ) : visibleCodes.length === 0 ? (
        <div className="px-3 md:px-0">
          <EmptyState
            icon={<QrCode className="w-12 h-12" />}
            title={showHistorySheet
              ? (language === 'ru' ? 'Архив пуст' : 'Arxiv bo\'sh')
              : (language === 'ru' ? 'Пропусков нет' : 'Ruxsatnomalar yo\'q')}
            description={showHistorySheet
              ? (language === 'ru' ? 'Старые пропуска появятся здесь через 30 дней' : 'Eski ruxsatnomalar 30 kundan keyin paydo bo\'ladi')
              : (language === 'ru' ? 'Создайте пропуск через карточки выше' : 'Yuqoridagi kartochkalar orqali ruxsatnoma yarating')}
          />
        </div>
      ) : (
        <div className="px-3 md:px-0 bg-white rounded-[14px] divide-y divide-gray-100 overflow-hidden mx-3 md:mx-0">
          {visibleCodes.map((code) => {
            const visitorLabel = safeVisitorLabel(code.visitorType);
            const accessLabel = safeAccessLabel(code.accessType);
            const isExpired = code.status === 'expired';
            const isRevoked = code.status === 'revoked';
            const isUsed = code.status === 'used';
            const headline = code.visitorName || (language === 'ru' ? visitorLabel.label : visitorLabel.labelUz);
            const until = new Date(code.validUntil);
            const isToday = until.toDateString() === new Date().toDateString();
            const untilStr = isToday
              ? (language === 'ru' ? `до ${until.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} сегодня` : `bugun ${until.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} gacha`)
              : (language === 'ru' ? `до ${until.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : `${until.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })} gacha`);
            const usesPart = code.maxUses > 1 ? ` · ${code.currentUses}/${code.maxUses}` : '';
            const accessPart = ` · ${language === 'ru' ? accessLabel.label : accessLabel.labelUz}`;

            const pillBg =
              code.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
              isUsed ? 'bg-blue-50 text-blue-600' :
              isRevoked ? 'bg-red-50 text-red-600' :
              'bg-gray-100 text-gray-500';
            const pillText =
              code.status === 'active' ? (language === 'ru' ? 'Активен' : 'Faol') :
              isUsed ? (language === 'ru' ? 'Использован' : 'Ishlatilgan') :
              isRevoked ? (language === 'ru' ? 'Отозван' : 'Bekor') :
              (language === 'ru' ? 'Истёк' : 'Tugagan');
            const iconBg =
              code.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
              isUsed ? 'bg-blue-50 text-blue-600' :
              isRevoked ? 'bg-red-50 text-red-600' :
              'bg-gray-100 text-gray-500';

            return (
              <button
                key={code.id}
                onClick={() => setSelectedCode(code)}
                className={`w-full p-3 flex items-center gap-3 text-left active:bg-gray-50 transition-colors touch-manipulation ${
                  isExpired || isRevoked ? 'opacity-70' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                  <span className="text-base leading-none">{visitorLabel.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[14px] text-gray-900 truncate">
                    {headline}
                  </div>
                  <div className="text-[12px] text-gray-500 truncate">
                    {untilStr}{usesPart}{accessPart}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0 ${pillBg}`}>
                  {pillText}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Visit history — answers 'кто и когда заходил по моему QR'.
          Hidden until the resident has at least one code in the system,
          otherwise the section is just an empty cup. */}
      {logsLoaded && guestAccessCodes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" />
              <span className="text-[13px] font-bold text-gray-700">
                {language === 'ru' ? 'История посещений' : 'Tashriflar tarixi'}
              </span>
              {myVisitLogs.length > 0 && (
                <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {myVisitLogs.length}
                </span>
              )}
            </div>
          </div>

          {myVisitLogs.length === 0 ? (
            <div className="bg-white rounded-[14px] p-4 text-center text-[12px] text-gray-400">
              {language === 'ru'
                ? 'Здесь появятся записи когда кто-то зайдёт по вашему QR'
                : 'Sizning QR orqali kim kirsa, bu yerda paydo bo\'ladi'}
            </div>
          ) : (
            <div className="bg-white rounded-[14px] divide-y divide-gray-100 overflow-hidden">
              {myVisitLogs.map(log => {
                const isAllowed = log.action === 'entry_allowed';
                const visitor = safeVisitorLabel(log.visitor_type);
                const ts = new Date(log.scanned_at);
                const timeStr = ts.toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                });
                return (
                  <div key={log.id} className="p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isAllowed ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {isAllowed
                        ? <CheckCircle2 className="w-4 h-4" />
                        : <XCircle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-gray-900 truncate">
                        {visitor.icon} {language === 'ru' ? visitor.label : visitor.labelUz}
                        {' · '}
                        <span className={isAllowed ? 'text-green-600' : 'text-red-600'}>
                          {isAllowed
                            ? (language === 'ru' ? 'пропущен' : 'kirgan')
                            : (language === 'ru' ? 'отказ' : 'rad etilgan')}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {timeStr}
                        {log.scanned_by_name && (
                          <>{' · '}{language === 'ru' ? 'охрана' : 'qo\'riqchi'}: {log.scanned_by_name}</>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateForm && (
        <CreatePassForm
          onClose={() => { setShowCreateForm(false); setCreatePreset(null); }}
          onCreated={(c) => { handleCreated(c); setCreatePreset(null); }}
          initialVisitorType={createPreset?.visitor}
          initialAccessType={createPreset?.access}
        />
      )}

      {selectedCode && (
        <QRCodeDisplay
          codeId={selectedCode.id}
          onClose={() => setSelectedCode(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!showRevokeConfirm}
        tone="danger"
        title={language === 'ru' ? 'Отменить пропуск?' : 'Ruxsatnomani bekor qilasizmi?'}
        description={language === 'ru'
          ? 'Пропуск будет деактивирован и не сможет быть использован'
          : 'Ruxsatnoma o\'chiriladi va ishlatib bo\'lmaydi'}
        confirmLabel={language === 'ru' ? 'Да, отменить' : 'Ha, bekor qilish'}
        cancelLabel={language === 'ru' ? 'Нет' : 'Yo\'q'}
        onClose={() => setShowRevokeConfirm(null)}
        onConfirm={handleRevoke}
      />
    </div>
  );
}
