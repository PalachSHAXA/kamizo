// Sprint 85 commit 2 — shared "Договор управления" widget used by
// both surfaces that own a tenant contract:
//
//   - Super-admin tenant detail (DashboardTab.tsx) — uploadEndpoint
//     and deleteEndpoint pointed at /api/super-admin/tenants/:id/...
//     for any tenant. allowDelete = true. No download because there
//     is no super-admin-can-read-anyone's endpoint today (decision
//     logged in the commit-1 report).
//
//   - Director own-tenant dashboard (OverviewTab.tsx) — uploadEndpoint
//     pointed at /api/admin/tenant/contract (server resolves tenant
//     from JWT). downloadEndpoint pointed at GET
//     /api/admin/tenant/contract. allowDelete = false (director must
//     ask super-admin to delete — backend enforces 403).
//
// The component owns:
//   - empty-state drag-drop zone with file picker
//   - filled-state metadata row + Заменить + Скачать + (optional)
//     Удалить buttons
//   - client-side validation: file.type === 'application/pdf' AND
//     size ≤ 10 MB. Friendlier failure than waiting for the server's
//     415/413.
//   - PATCH upload via fetch + FormData. No streaming progress in
//     this commit — a spinner during the in-flight request is the
//     simplest UX that still tells the dispatcher something is
//     happening. Add XHR.onprogress later if real users complain.
//   - confirm-dialog wrapper on delete reusing the existing
//     ConfirmDialog component.
//
// Bytes never live in component state. Upload bytes flow:
//   <input> → File → FormData → fetch — never copied into React
//   state or persisted. Download bytes flow:
//   fetch → Blob → URL.createObjectURL → <a>.click() → revoke. The
//   blob URL is revoked synchronously after the synthetic anchor
//   click; the browser keeps a strong reference long enough for the
//   download to start.

import { useRef, useState } from 'react';
import { FileText, Upload, Download, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { API_URL, getToken } from '../../services/api/client';
import { downloadBlob } from '../../utils/downloadFile';

interface ContractUploaderProps {
  // Display metadata. All optional so the empty-state path works
  // without any of these being set.
  filename?: string | null;
  uploadedAt?: string | null;
  uploadedByName?: string | null;
  /** True when filename / uploadedAt / uploadedByName describe a real, stored contract. */
  hasContract: boolean;
  /**
   * Path (no host) for `POST <multipart>` to upload a new contract.
   * Examples:
   *   /api/super-admin/tenants/<tid>/contract
   *   /api/admin/tenant/contract
   */
  uploadEndpoint: string;
  /**
   * Optional path for `GET` to stream the contract bytes. Omit on the
   * super-admin surface — there is no GET endpoint for arbitrary
   * tenants yet. When omitted, the "Скачать" button is hidden.
   */
  downloadEndpoint?: string;
  /**
   * Optional path for `DELETE`. Omit / false on the director surface
   * — backend rejects director deletes anyway.
   */
  deleteEndpoint?: string;
  allowDelete?: boolean;
  /**
   * Called after a successful upload / delete so the parent can
   * re-fetch the tenant detail / config and update local state.
   */
  onChanged: () => void;
  /**
   * Language for labels. Defaults to 'ru' because Sprint 85 is
   * Russian-first.
   */
  language?: 'ru' | 'uz';
  /**
   * Optional title override. Defaults to "Договор управления".
   */
  title?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

function formatDate(iso: string | null | undefined, lang: 'ru' | 'uz'): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function ContractUploader({
  filename,
  uploadedAt,
  uploadedByName,
  hasContract,
  uploadEndpoint,
  downloadEndpoint,
  deleteEndpoint,
  allowDelete = false,
  onChanged,
  language = 'ru',
  title,
}: ContractUploaderProps) {
  const isRu = language === 'ru';
  const addToast = useToastStore(s => s.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    // Cheap client-side rejection before paying network for the
    // upload. Server re-checks both via the MIME header AND the
    // magic-bytes test, so a forged MIME on the client doesn't
    // bypass the server's gate.
    if (file.type !== 'application/pdf') {
      addToast('error', isRu ? 'Файл не является PDF' : 'Fayl PDF emas');
      return;
    }
    if (file.size > MAX_BYTES) {
      addToast('error', isRu ? 'Размер превышает 10 МБ' : "Hajmi 10 MB dan oshib ketdi");
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = getToken();
      const resp = await fetch(`${API_URL}${uploadEndpoint}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      if (!resp.ok) {
        // Try to parse a server-side error message; fall back to a
        // generic one if the body isn't JSON.
        let message = isRu ? 'Не удалось загрузить' : 'Yuklab boʻlmadi';
        if (resp.status === 415) {
          message = isRu ? 'Файл не является PDF' : 'Fayl PDF emas';
        } else if (resp.status === 413) {
          message = isRu ? 'Размер превышает 10 МБ' : "Hajmi 10 MB dan oshib ketdi";
        } else if (resp.status === 403) {
          message = isRu ? 'Недостаточно прав' : 'Huquq yetarli emas';
        } else {
          try {
            const body = await resp.json();
            if (body?.error) message = body.error;
          } catch { /* leave generic */ }
        }
        addToast('error', message);
      } else {
        addToast('success', isRu ? 'Договор загружен' : 'Shartnoma yuklandi');
        onChanged();
      }
    } catch {
      addToast('error', isRu ? 'Сетевая ошибка при загрузке' : "Yuklashda tarmoq xatosi");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async () => {
    if (!downloadEndpoint) return;
    setIsDownloading(true);
    try {
      const token = getToken();
      const resp = await fetch(`${API_URL}${downloadEndpoint}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!resp.ok) {
        addToast('error', isRu ? 'Не удалось скачать' : "Yuklab boʻlmadi");
        return;
      }
      const blob = await resp.blob();
      // v130 — was a synthetic <a download> of a blob URL. Works on
      // Chromium / Android Capacitor WebView but silently no-ops on
      // iOS Capacitor WKWebView (confirmed on iPhone 15 Sim after
      // Sprint 85 commit 3). Route through downloadBlob() so iOS uses
      // @capacitor/filesystem → Documents/, Android uses the same,
      // and PWA keeps the synthetic anchor path.
      await downloadBlob(blob, {
        filename: filename || 'contract.pdf',
        language,
      });
    } catch {
      addToast('error', isRu ? 'Сетевая ошибка при скачивании' : "Yuklab olishda tarmoq xatosi");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEndpoint) return;
    setIsDeleting(true);
    try {
      const token = getToken();
      const resp = await fetch(`${API_URL}${deleteEndpoint}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!resp.ok) {
        addToast('error', isRu ? 'Не удалось удалить' : "Oʻchirib boʻlmadi");
        return;
      }
      addToast('success', isRu ? 'Договор удалён' : "Shartnoma oʻchirildi");
      onChanged();
      setShowDeleteConfirm(false);
    } catch {
      addToast('error', isRu ? 'Сетевая ошибка при удалении' : "Oʻchirishda tarmoq xatosi");
    } finally {
      setIsDeleting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="bg-white dark:bg-stone-900/40 border border-gray-200 dark:border-stone-700 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
        <h3 className="font-semibold text-[15px] text-gray-900 dark:text-stone-100">
          {title || (isRu ? 'Договор управления' : 'Boshqaruv shartnomasi')}
        </h3>
      </div>

      {hasContract ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/40 rounded-xl">
            <FileText className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-gray-900 dark:text-stone-100 truncate">
                {filename || (isRu ? 'Договор' : 'Shartnoma')}
              </div>
              <div className="text-[11.5px] text-gray-500 dark:text-stone-400 mt-0.5 truncate">
                {uploadedAt && formatDate(uploadedAt, language)}
                {uploadedAt && uploadedByName ? ' · ' : ''}
                {uploadedByName && (isRu ? `загрузил ${uploadedByName}` : `yukladi ${uploadedByName}`)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {downloadEndpoint && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading || isUploading || isDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-stone-800 dark:hover:bg-stone-700 active:bg-gray-300 text-gray-700 dark:text-stone-200 text-[13px] font-semibold rounded-xl transition-colors touch-manipulation disabled:opacity-60"
              >
                {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {isRu ? 'Скачать' : 'Yuklab olish'}
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-[13px] font-semibold rounded-xl transition-colors touch-manipulation disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {isRu ? 'Заменить файл' : 'Faylni almashtirish'}
            </button>
            {allowDelete && deleteEndpoint && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isUploading || isDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 text-[13px] font-semibold rounded-xl transition-colors touch-manipulation disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isRu ? 'Удалить' : "O'chirish"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 p-6 sm:p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors touch-manipulation ${
            isDragging
              ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
              : 'border-gray-200 dark:border-stone-700 hover:border-orange-300 hover:bg-gray-50 dark:hover:bg-stone-800'
          }`}
          role="button"
          tabIndex={0}
          aria-label={isRu ? 'Загрузить PDF договора' : 'Shartnoma PDF faylini yuklash'}
        >
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-orange-400" />
          )}
          <div className="text-center">
            <div className="text-[13.5px] font-semibold text-gray-700 dark:text-stone-200">
              {isUploading
                ? (isRu ? 'Загрузка…' : "Yuklanmoqda…")
                : (isRu ? 'Перетащите PDF договора или нажмите для выбора' : "Shartnoma PDF faylini sudrab tashlang yoki tanlash uchun bosing")}
            </div>
            <div className="text-[11.5px] text-gray-400 dark:text-stone-500 mt-1 inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {isRu ? 'до 10 МБ, только PDF' : "10 MB gacha, faqat PDF"}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        aria-label={isRu ? 'Файл договора' : 'Shartnoma fayli'}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={isRu ? 'Удалить договор?' : "Shartnomani o'chirishmi?"}
        description={isRu
          ? 'Жители больше не смогут его скачать. Это действие можно отменить, загрузив новый файл.'
          : "Yashovchilar uni yuklab ololmaydi. Bu amalni yangi faylni yuklash orqali bekor qilish mumkin."}
        confirmLabel={isRu ? 'Удалить' : "O'chirish"}
        cancelLabel={isRu ? 'Отмена' : 'Bekor qilish'}
        tone="danger"
        confirmDisabled={isDeleting}
        onConfirm={handleDelete}
        onClose={() => { if (!isDeleting) setShowDeleteConfirm(false); }}
      />
    </div>
  );
}
