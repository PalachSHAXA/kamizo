// Sprint 21: extracted from ResidentGuestAccessPage. The modal that
// renders the QR for one access code with share / copy / download
// actions, plus the on-demand scan history fetch for that code.

import { useState, useRef, useEffect } from 'react';
import { X, Share2, Download, Copy } from 'lucide-react';
import { StatusBadge } from '../../components/common';
import { generateQRCodeCanvas } from '../../components/LazyQRCode';
import { useGuestAccessStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useModalPresence } from '../../stores/modalStore';
import { useToastStore } from '../../stores/toastStore';
import {
  toneFor, safeVisitorLabel, safeAccessLabel, safeStatusLabel,
} from './utils';

export function QRCodeDisplay({ codeId, onClose }: { codeId: string; onClose: () => void }) {
  // Hide the global BottomBar while this modal is mounted.
  useModalPresence();

  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const guestAccessCodes = useGuestAccessStore(s => s.guestAccessCodes);
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
      {/* Use the canonical `.modal-content` shell (defined in index.css)
          so the bg, border + text colors all flip under html.dark via the
          v96 modal-shell override + the existing text-gray-* safety net.
          Previously this used a literal `bg-white` shell which stayed
          white in dark mode while the text-gray-500 labels flipped to
          light beige via the safety net — invisible on the still-white
          card. See DESIGN.md root-cause #1. */}
      <div className="modal-content max-w-md">
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
          {/* The QR code MUST remain on a literal white background in
              BOTH themes — scanners require black-on-white contrast and a
              dark warm-tone background would degrade decode reliability.
              This is the "real artifact" exception in DESIGN.md §When
              NOT to follow these rules. */}
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
