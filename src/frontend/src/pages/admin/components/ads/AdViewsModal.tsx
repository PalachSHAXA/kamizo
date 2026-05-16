import { X, RefreshCw, Eye, User } from 'lucide-react';

// Sprint 32: extracted from admin/components/AdsTab. Modal listing
// residents who saw a specific ad. Parent owns the load state +
// fetched list.

export interface AdView {
  id?: string;
  user_name?: string;
  user_phone?: string;
  apartment_number?: string;
  viewed_at?: string;
}

interface AdViewsModalProps {
  adTitle: string;
  views: AdView[];
  loading: boolean;
  onClose: () => void;
}

export function AdViewsModal({ adTitle, views, loading, onClose }: AdViewsModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[80dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-bold text-base">Просмотры</h3>
            <p className="text-xs text-gray-500 mt-0.5">{adTitle} — {views.length} чел.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60dvh] p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : views.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Ещё никто не просмотрел</p>
            </div>
          ) : (
            <div className="space-y-1">
              {views.map((v, i) => (
                <div key={v.id || i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{v.user_name || 'Без имени'}</div>
                    <div className="text-xs text-gray-400">
                      {v.user_phone && <span>{v.user_phone}</span>}
                      {v.apartment_number && <span> · кв. {v.apartment_number}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {v.viewed_at ? new Date(v.viewed_at).toLocaleDateString('ru-RU') : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
