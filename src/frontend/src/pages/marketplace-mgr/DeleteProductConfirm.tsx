// Sprint 30: extracted from MarketplaceManagerDashboard. Two near-
// identical "Delete product?" confirm dialogs lived inline; folded
// into a single component used by both call sites.

interface DeleteProductConfirmProps {
  language: string;
  variant?: 'normal' | 'destructive-z300';
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteProductConfirm({
  language,
  variant = 'normal',
  onCancel,
  onConfirm,
}: DeleteProductConfirmProps) {
  const zClass = variant === 'destructive-z300' ? 'z-[300]' : 'z-[110]';
  return (
    <div className={`fixed inset-0 ${zClass} bg-black/50 flex items-center justify-center p-4`}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <p className="font-semibold text-gray-800 mb-1 text-lg">
          {language === 'ru' ? 'Удалить товар?' : "Mahsulotni o'chirasizmi?"}
        </p>
        <p className="text-sm text-gray-500 mb-5">
          {language === 'ru' ? 'Это действие нельзя отменить.' : "Bu amalni bekor qilib bo'lmaydi."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 touch-manipulation"
          >
            {language === 'ru' ? 'Отмена' : 'Bekor'}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 min-h-[44px] bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 touch-manipulation"
          >
            {language === 'ru' ? 'Удалить' : "O'chirish"}
          </button>
        </div>
      </div>
    </div>
  );
}
