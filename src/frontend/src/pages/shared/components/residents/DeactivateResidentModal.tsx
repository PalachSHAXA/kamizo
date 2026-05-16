import { Loader2, UserX } from 'lucide-react';

// Sprint 33: extracted from ResidentCardModal. The dialog that
// deactivates a resident's account. Parent owns the reason / comment
// state and the deactivation handler.

export const CHANGE_REASONS = [
  { value: 'ownership_sale', ru: 'Смена собственника (купля-продажа)', uz: 'Mulkdor almashishi (oldi-sotdi)' },
  { value: 'ownership_inheritance', ru: 'Смена собственника (наследство)', uz: 'Mulkdor almashishi (meros)' },
  { value: 'ownership_gift', ru: 'Смена собственника (дарение)', uz: 'Mulkdor almashishi (hadya)' },
  { value: 'name_change', ru: 'Изменение ФИО (брак/развод)', uz: "FISh o'zgarishi (nikoh/ajralish)" },
  { value: 'resident_request', ru: 'По запросу жителя', uz: "Yashovchi so'rovi bo'yicha" },
  { value: 'court_decision', ru: 'Решение суда', uz: 'Sud qarori' },
  { value: 'other', ru: 'Другое', uz: 'Boshqa' },
];

interface DeactivateResidentModalProps {
  residentName: string;
  reason: string;
  setReason: (r: string) => void;
  comment: string;
  setComment: (c: string) => void;
  loading: boolean;
  language: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeactivateResidentModal({
  residentName,
  reason,
  setReason,
  comment,
  setComment,
  loading,
  language,
  onCancel,
  onConfirm,
}: DeactivateResidentModalProps) {
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[300]"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 sm:p-6 border border-white/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <UserX className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{t('Деактивация аккаунта', 'Akkauntni faolsizlantirish')}</h3>
            <p className="text-xs text-gray-500">{residentName}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          {t(
            'Аккаунт жителя будет деактивирован. Житель не сможет войти в систему. Данные сохранятся.',
            "Yashovchi akkauntini faolsizlantiriladi. Yashovchi tizimga kira olmaydi. Ma'lumotlar saqlanadi.",
          )}
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('Причина *', 'Sabab *')}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
            >
              <option value="">{t('Выберите причину', 'Sababni tanlang')}</option>
              {CHANGE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {language === 'ru' ? r.ru : r.uz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('Комментарий', 'Izoh')}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50">
            {t('Отмена', 'Bekor')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !reason}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('Деактивировать', 'Faolsizlantirish')}
          </button>
        </div>
      </div>
    </div>
  );
}
