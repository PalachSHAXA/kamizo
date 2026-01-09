import { useState } from 'react';
import {
  Search, CheckCircle, XCircle, Loader2, Clock, User,
  Phone, AlertTriangle, Calculator, History
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface CouponInfo {
  id: string;
  code: string;
  ad_id: string;
  ad_title: string;
  ad_phone: string;
  ad_description: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  discount_percent: number;
  status: string;
  issued_at: string;
  expires_at: string;
  activated_at?: string;
}

interface ActivationRecord {
  id: string;
  code: string;
  ad_title: string;
  user_name: string;
  discount_percent: number;
  activation_amount: number;
  discount_amount: number;
  activated_at: string;
}

export function CouponCheckerDashboard() {
  const { token } = useAuthStore();
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [couponInfo, setCouponInfo] = useState<CouponInfo | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string>('');
  const [activationAmount, setActivationAmount] = useState<string>('');
  const [activating, setActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<{
    discount_amount: number;
    final_amount: number;
  } | null>(null);
  const [history, setHistory] = useState<ActivationRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || '';

  const checkCoupon = async () => {
    if (!couponCode.trim() || couponCode.length < 6) return;

    setLoading(true);
    setCouponInfo(null);
    setValid(null);
    setReason('');
    setActivationResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/coupons/check/${couponCode.trim().toUpperCase()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (res.ok) {
        setCouponInfo(data.coupon);
        setValid(data.valid);
        setReason(data.reason || '');
      } else {
        setValid(false);
        setReason(data.error || 'Купон не найден');
      }
    } catch (err) {
      setValid(false);
      setReason('Ошибка проверки купона');
    } finally {
      setLoading(false);
    }
  };

  const activateCoupon = async () => {
    if (!couponInfo || !valid) return;

    const amount = parseFloat(activationAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму');
      return;
    }

    setActivating(true);
    try {
      const res = await fetch(`${API_BASE}/api/coupons/activate/${couponInfo.code}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount })
      });

      const data = await res.json();

      if (res.ok) {
        setActivationResult({
          discount_amount: data.discount_amount,
          final_amount: data.final_amount
        });
        setValid(false);
        setReason('Купон успешно активирован!');
      } else {
        alert(data.error || 'Ошибка активации');
      }
    } catch (err) {
      alert('Ошибка активации купона');
    } finally {
      setActivating(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/api/coupons/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.activations || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const resetCheck = () => {
    setCouponCode('');
    setCouponInfo(null);
    setValid(null);
    setReason('');
    setActivationAmount('');
    setActivationResult(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      checkCoupon();
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Проверка купонов</h1>
          <p className="text-gray-500">Введите код для проверки и активации</p>
        </div>
        <button
          onClick={() => { setShowHistory(true); fetchHistory(); }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <History className="w-5 h-5" />
          История
        </button>
      </div>

      {/* Search Box */}
      <div className="bg-white rounded-2xl shadow-lg border p-6 mb-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={couponCode}
              onChange={e => setCouponCode(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="Введите код купона (6 символов)"
              maxLength={6}
              className="w-full px-4 py-4 text-2xl font-mono tracking-widest text-center border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 uppercase"
              autoFocus
            />
          </div>
          <button
            onClick={checkCoupon}
            disabled={loading || couponCode.length < 6}
            className="px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Search className="w-6 h-6" />
            )}
          </button>
        </div>

        {couponCode && (
          <button
            onClick={resetCheck}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
          >
            Очистить
          </button>
        )}
      </div>

      {/* Result */}
      {(couponInfo || valid === false) && (
        <div className={`bg-white rounded-2xl shadow-lg border overflow-hidden ${
          activationResult ? 'border-green-300' : valid ? 'border-green-200' : 'border-red-200'
        }`}>
          {/* Status Header */}
          <div className={`p-4 ${
            activationResult ? 'bg-green-500' : valid ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <div className="flex items-center gap-3">
              {activationResult ? (
                <CheckCircle className="w-8 h-8 text-white" />
              ) : valid ? (
                <CheckCircle className="w-8 h-8 text-green-600" />
              ) : (
                <XCircle className="w-8 h-8 text-red-600" />
              )}
              <div>
                <div className={`font-bold text-lg ${
                  activationResult ? 'text-white' : valid ? 'text-green-800' : 'text-red-800'
                }`}>
                  {activationResult ? 'Купон активирован!' : valid ? 'Купон действителен' : 'Купон недействителен'}
                </div>
                {reason && (
                  <div className={`text-sm ${
                    activationResult ? 'text-green-100' : valid ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {reason}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Coupon Info */}
          {couponInfo && (
            <div className="p-4 space-y-4">
              {/* Code */}
              <div className="text-center">
                <code className="text-3xl font-mono font-bold tracking-widest text-gray-900">
                  {couponInfo.code}
                </code>
              </div>

              {/* Discount */}
              <div className="flex items-center justify-center">
                <div className="px-6 py-3 bg-purple-100 rounded-xl">
                  <span className="text-3xl font-bold text-purple-700">-{couponInfo.discount_percent}%</span>
                </div>
              </div>

              {/* Ad Info */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="font-semibold text-gray-900">{couponInfo.ad_title}</div>
                {couponInfo.ad_description && (
                  <div className="text-sm text-gray-500">{couponInfo.ad_description}</div>
                )}
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span>{couponInfo.ad_phone}</span>
                </div>
              </div>

              {/* User Info */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{couponInfo.user_name}</div>
                  <div className="text-sm text-gray-500">{couponInfo.user_phone}</div>
                </div>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Выдан: {new Date(couponInfo.issued_at).toLocaleDateString('ru-RU')}
                </div>
                {couponInfo.expires_at && (
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    Истекает: {new Date(couponInfo.expires_at).toLocaleDateString('ru-RU')}
                  </div>
                )}
              </div>

              {/* Activation Form */}
              {valid && !activationResult && (
                <div className="border-t pt-4 mt-4">
                  <label className="block text-sm font-medium mb-2">
                    Сумма покупки (сум)
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="number"
                        value={activationAmount}
                        onChange={e => setActivationAmount(e.target.value)}
                        placeholder="0"
                        className="w-full pl-10 pr-4 py-3 border rounded-xl text-lg"
                        min="0"
                      />
                    </div>
                    <button
                      onClick={activateCoupon}
                      disabled={activating || !activationAmount}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {activating ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-5 h-5" />
                      )}
                      Активировать
                    </button>
                  </div>

                  {/* Preview */}
                  {activationAmount && parseFloat(activationAmount) > 0 && (
                    <div className="mt-3 p-3 bg-green-50 rounded-xl">
                      <div className="flex justify-between text-sm">
                        <span>Сумма покупки:</span>
                        <span>{parseFloat(activationAmount).toLocaleString()} сум</span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Скидка {couponInfo.discount_percent}%:</span>
                        <span>-{(parseFloat(activationAmount) * couponInfo.discount_percent / 100).toLocaleString()} сум</span>
                      </div>
                      <div className="flex justify-between font-bold mt-1 pt-1 border-t border-green-200">
                        <span>К оплате:</span>
                        <span>{(parseFloat(activationAmount) * (1 - couponInfo.discount_percent / 100)).toLocaleString()} сум</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Activation Result */}
              {activationResult && (
                <div className="border-t pt-4 mt-4">
                  <div className="p-4 bg-green-50 rounded-xl space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Сумма покупки:</span>
                      <span className="font-medium">{(activationResult.final_amount + activationResult.discount_amount).toLocaleString()} сум</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Скидка:</span>
                      <span className="font-medium">-{activationResult.discount_amount.toLocaleString()} сум</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-green-200">
                      <span>К оплате:</span>
                      <span className="text-green-700">{activationResult.final_amount.toLocaleString()} сум</span>
                    </div>
                  </div>

                  <button
                    onClick={resetCheck}
                    className="w-full mt-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
                  >
                    Проверить другой купон
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">История активаций</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  История пуста
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(item => (
                    <div key={item.id} className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 bg-white border rounded font-mono text-sm">
                              {item.code}
                            </code>
                            <span className="text-sm text-gray-500">{item.ad_title}</span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">{item.user_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-600 font-medium">
                            -{item.discount_amount?.toLocaleString()} сум
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(item.activated_at).toLocaleString('ru-RU')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
