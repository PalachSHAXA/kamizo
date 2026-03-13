import { useState } from 'react';
import { Ban, X } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import type { Request } from '../../types';

interface CancelRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: Request;
  onCancel: (requestId: string, reason: string) => void;
}

export function CancelRequestModal({ isOpen, onClose, request, onCancel }: CancelRequestModalProps) {
  const [reason, setReason] = useState('');
  const { language } = useLanguageStore();

  if (!isOpen) return null;

  const predefinedReasons = language === 'ru' ? [
    'Передумал/Не актуально',
    'Нашёл другого исполнителя',
    'Проблема решилась сама',
    'Ошибся при создании заявки',
    'Слишком долгое ожидание',
  ] : [
    'Qaror o\'zgardi/Dolzarb emas',
    'Boshqa ijrochi topdim',
    'Muammo o\'z-o\'zidan hal bo\'ldi',
    'Ariza yaratishda xato qildim',
    'Juda uzoq kutish',
  ];

  const handleConfirm = () => {
    if (reason.trim()) {
      onCancel(request.id, reason);
      setReason('');
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-red-600 flex items-center gap-2">
            <Ban className="w-5 h-5" />
            {language === 'ru' ? 'Отменить заявку' : 'Arizani bekor qilish'}
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-white/30 active:bg-white/50 rounded-lg touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800">
            {language === 'ru'
              ? <>Вы уверены, что хотите отменить заявку <strong>#{request.number}</strong>? Это действие нельзя отменить.</>
              : <><strong>#{request.number}</strong> arizani bekor qilmoqchimisiz? Bu amalni ortga qaytarib bo&apos;lmaydi.</>}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Причина отмены' : 'Bekor qilish sababi'}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {predefinedReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors touch-manipulation ${
                    reason === r
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field min-h-[80px]"
              placeholder={language === 'ru' ? 'Или укажите свою причину...' : 'Yoki o\'z sababingizni yozing...'}
            />
          </div>

          <div className="flex gap-3">
            <button onClick={handleClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Не отменять' : 'Bekor qilmaslik'}
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 px-4 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!reason.trim()}
            >
              <Ban className="w-4 h-4 mr-2 inline" />
              {language === 'ru' ? 'Отменить заявку' : 'Arizani bekor qilish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
