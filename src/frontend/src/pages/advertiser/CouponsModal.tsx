import { X, Loader2 } from 'lucide-react';

// Sprint 22: extracted from AdvertiserDashboard. The list-of-issued
// coupons modal for a single ad — shown when the advertiser taps
// "View coupons" on an ad card. Parent owns load state and selectedAd.

interface Coupon {
  id: string;
  code: string;
  user_name: string;
  user_phone: string;
  discount_percent: number;
  status: string;
  issued_at: string;
  activated_at?: string;
  activated_by_name?: string;
  activation_amount?: number;
  discount_amount?: number;
}

interface CouponsModalProps {
  adTitle: string;
  couponsIssued: number;
  couponsActivated: number;
  coupons: Coupon[];
  loading: boolean;
  language: string;
  onClose: () => void;
}

export function CouponsModal({
  adTitle,
  couponsIssued,
  couponsActivated,
  coupons,
  loading,
  language,
  onClose,
}: CouponsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">
              {language === 'ru' ? 'Купоны' : 'Kuponlar'}: {adTitle}
            </h2>
            <p className="text-sm text-gray-500">
              {language === 'ru' ? 'Выдано' : 'Berilgan'}: {couponsIssued} |{' '}
              {language === 'ru' ? 'Активировано' : 'Faollashtirilgan'}: {couponsActivated}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {language === 'ru' ? 'Купоны пока не выданы' : 'Kuponlar hali berilmagan'}
            </div>
          ) : (
            <div className="space-y-3">
              {coupons.map((coupon) => (
                <div
                  key={coupon.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-white border rounded font-mono text-sm">
                        {coupon.code}
                      </code>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          coupon.status === 'activated'
                            ? 'bg-green-100 text-green-700'
                            : coupon.status === 'expired'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {coupon.status === 'activated'
                          ? language === 'ru' ? 'Активирован' : 'Faollashtirilgan'
                          : coupon.status === 'expired'
                          ? language === 'ru' ? 'Истёк' : 'Tugagan'
                          : language === 'ru' ? 'Выдан' : 'Berilgan'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {coupon.user_name} • {coupon.user_phone}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {language === 'ru' ? 'Выдан' : 'Berilgan'}:{' '}
                      {new Date(coupon.issued_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-600">
                      -{coupon.discount_percent}%
                    </div>
                    {coupon.status === 'activated' && coupon.activation_amount && (
                      <div className="text-sm text-green-600">
                        {language === 'ru' ? 'Скидка' : 'Chegirma'}:{' '}
                        {coupon.discount_amount?.toLocaleString()}{' '}
                        {language === 'ru' ? 'сум' : "so'm"}
                      </div>
                    )}
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
