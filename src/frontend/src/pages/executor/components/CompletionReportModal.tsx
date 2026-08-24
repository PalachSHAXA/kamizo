import { useRef, useState } from 'react';
import { Camera, X, Check, Loader2, ImageIcon } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { useModalPresence } from '../../../stores/modalStore';
import { useToastStore } from '../../../stores/toastStore';
import { compressImage } from '../../../utils/compressImage';
import type { Request } from '../../../types';

const MAX_PHOTOS = 5;

interface CompletionReportModalProps {
  request: Request;
  submitting: boolean;
  onConfirm: (photos: string[]) => void;
  onClose: () => void;
}

/**
 * Optional photo report of the finished work. Shown when the executor presses
 * "Завершить". Attaching photos is NOT required — the executor can finish with
 * no photo (keeps DB writes minimal; photos are stored only when actually added).
 * Managers/directors view the report later in the request detail.
 */
export function CompletionReportModal({ request, submitting, onConfirm, onClose }: CompletionReportModalProps) {
  const { language } = useLanguageStore();
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);
  useModalPresence();
  const addToast = useToastStore((s) => s.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file
    if (files.length === 0) return;
    setProcessing(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const next: string[] = [];
      for (const file of files.slice(0, room)) {
        if (!file.type.startsWith('image/')) continue;
        next.push(await compressImage(file));
      }
      if (next.length > 0) setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
      if (files.length > room) {
        addToast('warning', t(`Можно прикрепить не более ${MAX_PHOTOS} фото`, `Ko'pi bilan ${MAX_PHOTOS} ta rasm`));
      }
    } catch {
      addToast('error', t('Не удалось обработать фото', 'Rasmni qayta ishlab bo\'lmadi'));
    } finally {
      setProcessing(false);
    }
  };

  const removePhoto = (idx: number) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="modal-backdrop" style={{ zIndex: 10200 }} onClick={submitting ? undefined : onClose}>
      <div
        className="modal-content p-6 w-full max-w-lg mx-4 max-h-[100dvh] overflow-y-auto rounded-t-[20px] sm:rounded-2xl"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{t('Фотоотчёт о работе', 'Ish bo\'yicha foto-hisobot')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('Заявка', 'Ariza')} #{request.number}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label={t('Закрыть', 'Yopish')}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg disabled:opacity-50 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-start gap-2 p-3 mb-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
          <ImageIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          <span>
            {t(
              'По желанию прикрепите фото выполненной работы. Можно завершить и без фото.',
              'Xohlasangiz bajarilgan ish rasmini biriktiring. Rasmsiz ham yakunlash mumkin.',
            )}
          </span>
        </div>

        {/* Thumbnails */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {photos.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  disabled={submitting}
                  aria-label={t('Удалить', 'O\'chirish')}
                  className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center bg-black/60 text-white rounded-full active:scale-95 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add photo */}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing || submitting}
            className="w-full min-h-[52px] mb-4 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50 touch-manipulation"
          >
            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            {processing
              ? t('Обработка…', 'Ishlanmoqda…')
              : photos.length === 0
                ? t('Добавить фото', 'Rasm qo\'shish')
                : t('Добавить ещё', 'Yana qo\'shish')}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handlePick}
        />

        {/* Actions */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary flex-1 min-h-[48px] touch-manipulation"
          >
            {t('Отмена', 'Bekor qilish')}
          </button>
          <button
            onClick={() => !submitting && !processing && onConfirm(photos)}
            disabled={submitting || processing}
            className="btn-primary flex-1 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('Завершить работу', 'Ishni yakunlash')}
          </button>
        </div>
      </div>
    </div>
  );
}
