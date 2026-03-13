import { useState } from 'react';
import { Ban, X } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import type { Request } from '../../types';

interface DeclineRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: Request;
  onDecline: (requestId: string, reason: string) => void;
}

export function DeclineRequestModal({ isOpen, onClose, request, onDecline }: DeclineRequestModalProps) {
  const { language } = useLanguageStore();
  const [reason, setReason] = useState('');
  const isInProgress = request.status === 'in_progress';

  if (!isOpen) return null;

  const predefinedReasons = isInProgress ? (
    language === 'ru' ? [
      'Заболел/Не могу продолжить работу',
      'Необходима помощь другого специалиста',
      'Нет необходимых материалов для завершения',
      'Срочные личные обстоятельства',
      'Требуется другая специализация',
    ] : [
      'Kasal bo\'ldim/Ishni davom ettira olmayman',
      'Boshqa mutaxassis yordami kerak',
      'Tugatish uchun kerakli materiallar yo\'q',
      'Shoshilinch shaxsiy holatlar',
      'Boshqa mutaxassislik talab qilinadi',
    ]
  ) : (
    language === 'ru' ? [
      'Не смогу прибыть в указанное время',
      'Нет необходимых материалов/инструментов',
      'Заболел/Не могу работать',
      'Слишком далеко от текущего местоположения',
      'Загружен другими заявками',
    ] : [
      'Ko\'rsatilgan vaqtda kelolmayman',
      'Kerakli materiallar/asboblar yo\'q',
      'Kasal bo\'ldim/Ishlay olmayman',
      'Hozirgi joydan juda uzoq',
      'Boshqa arizalar bilan band',
    ]
  );

  const handleConfirm = () => {
    if (reason.trim()) {
      onDecline(request.id, reason);
      setReason('');
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4 rounded-none sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-red-600 flex items-center gap-2">
            <Ban className="w-5 h-5" />
            {isInProgress
              ? (language === 'ru' ? 'Освободить заявку' : 'Arizani bo\'shatish')
              : (language === 'ru' ? 'Отказаться от заявки' : 'Arizadan voz kechish')}
          </h2>
          <button onClick={handleClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            {language === 'ru'
              ? <>Заявка <strong>#{request.number}</strong> будет возвращена в очередь и может быть назначена другому исполнителю.{isInProgress && ' Прогресс работы будет сброшен.'}</>
              : <><strong>#{request.number}</strong> ariza navbatga qaytariladi va boshqa ijrochiga tayinlanishi mumkin.{isInProgress && ' Ish jarayoni tiklanadi.'}</>}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Причина отказа' : 'Rad etish sababi'}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {predefinedReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 min-h-[44px] text-sm rounded-lg transition-colors touch-manipulation ${
                    reason === r
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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
              placeholder={language === 'ru' ? 'Или укажите свою причину...' : 'Yoki o\'z sababingizni ko\'rsating...'}
            />
          </div>

          <div className="flex gap-3">
            <button onClick={handleClose} className="btn-secondary flex-1 min-h-[44px] touch-manipulation">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 min-h-[44px] py-2 px-4 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              disabled={!reason.trim()}
            >
              <Ban className="w-4 h-4 mr-2 inline" />
              {isInProgress
                ? (language === 'ru' ? 'Освободить' : 'Bo\'shatish')
                : (language === 'ru' ? 'Отказаться' : 'Rad etish')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
