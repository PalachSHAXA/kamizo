import { AlertCircle, Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  name: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  language: string;
}

export function DeleteConfirmModal({
  name,
  isDeleting,
  onConfirm,
  onCancel,
  language,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-600" />
        </div>
        <h3 className="text-lg font-bold text-center mb-2">
          {language === 'ru' ? 'Удалить жителя?' : 'Yashovchini o\'chirishni tasdiqlaysizmi?'}
        </h3>
        <p className="text-gray-500 text-center text-sm mb-2">
          {name}
        </p>
        <p className="text-gray-400 text-center text-xs mb-6">
          {language === 'ru' ? 'Это действие нельзя отменить. Житель потеряет доступ к системе.' : 'Bu amalni bekor qilib bo\'lmaydi. Yashovchi tizimga kirishni yo\'qotadi.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {language === 'ru' ? 'Удаление...' : 'O\'chirilmoqda...'}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {language === 'ru' ? 'Удалить' : 'O\'chirish'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteAllConfirmModalProps {
  count: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  language: string;
}

export function DeleteAllConfirmModal({
  count,
  isDeleting,
  onConfirm,
  onCancel,
  language,
}: DeleteAllConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-4">
          <Trash2 className="w-7 h-7 text-red-600" />
        </div>
        <h3 className="text-lg font-bold text-center mb-2">
          {language === 'ru' ? 'Удалить всех жителей?' : 'Barcha yashovchilarni o\'chirishni tasdiqlaysizmi?'}
        </h3>
        <p className="text-gray-500 text-center text-sm mb-2">
          {language === 'ru' ? 'Будет удалено' : 'O\'chiriladi'}: <strong>{count}</strong> {language === 'ru' ? 'жителей' : 'yashovchi'}
        </p>
        <p className="text-gray-400 text-center text-xs mb-6">
          {language === 'ru' ? 'Это действие нельзя отменить. Все жители потеряют доступ к системе.' : 'Bu amalni bekor qilib bo\'lmaydi. Barcha yashovchilar tizimga kirishni yo\'qotadi.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {language === 'ru' ? 'Удаление...' : 'O\'chirilmoqda...'}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {language === 'ru' ? 'Удалить всех' : 'Hammasini o\'chirish'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
