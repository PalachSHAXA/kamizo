import { useState, useEffect } from 'react';
import { CreditCard, Plus, Search, Filter, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { usePaymentsStore } from '../stores/paymentsStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { PageSkeleton } from '../components/PageSkeleton';
import { EmptyState } from '../components/common/EmptyState';

interface Payment {
  id: string;
  created_at: string;
  apartment_number?: string;
  apartment_id: string;
  amount: number;
  payment_type: string;
  period?: string;
  status?: string;
  description?: string;
}

export function PaymentsPage() {
  const { language } = useLanguageStore();
  const { addToast } = useToastStore();
  const {
    payments, isLoading, filters, pagination,
    fetchPayments, createPayment, setFilters,
  } = usePaymentsStore();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    apartment_id: '',
    amount: '',
    payment_type: 'cash',
    period: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  // Default period filter to current month so <input type="month"> shows a real value
  // instead of the empty "--------- ---- г." placeholder on first render
  useEffect(() => {
    if (!filters.period) {
      const d = new Date();
      const currentPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      setFilters({ ...filters, period: currentPeriod });
    }
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
  };

  const handleSearch = () => {
    fetchPayments();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.apartment_id || !form.amount) {
      addToast('error', t('Заполните обязательные поля', 'Majburiy maydonlarni to\'ldiring'));
      return;
    }
    setSubmitting(true);
    const ok = await createPayment({
      apartment_id: form.apartment_id,
      amount: parseFloat(form.amount),
      payment_type: form.payment_type,
      period: form.period || undefined,
      description: form.description || undefined,
    });
    setSubmitting(false);
    if (ok) {
      setShowModal(false);
      setForm({ apartment_id: '', amount: '', payment_type: 'cash', period: '', description: '' });
    }
  };

  const statusLabel = (status: string) => {
    const map: Record<string, [string, string, string]> = {
      confirmed: [t('Подтверждён', 'Tasdiqlangan'), 'bg-green-100 text-green-800', ''],
      pending: [t('Ожидает', 'Kutilmoqda'), 'bg-yellow-100 text-yellow-800', ''],
      cancelled: [t('Отменён', 'Bekor qilingan'), 'bg-red-100 text-red-800', ''],
    };
    const [label, cls] = map[status] || [status, 'bg-gray-100 text-gray-600'];
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
  };

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      cash: t('Наличные', 'Naqd'),
      card: t('Карта', 'Karta'),
      transfer: t('Перевод', 'O\'tkazma'),
    };
    return map[type] || type;
  };

  if (isLoading && payments.length === 0) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('Платежи', 'To\'lovlar')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Управление платежами и начислениями', 'To\'lovlar va hisob-kitoblarni boshqarish')}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('Добавить платёж', 'To\'lov qo\'shish')}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white/60 rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('Квартира...', 'Kvartira...')}
              value={filters.apartment_id || ''}
              onChange={(e) => handleFilterChange('apartment_id', e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
            />
          </div>
          <input
            type="month"
            value={filters.period || ''}
            onChange={(e) => handleFilterChange('period', e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
          />
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
          >
            <option value="">{t('Все статусы', 'Barcha holatlar')}</option>
            <option value="confirmed">{t('Подтверждён', 'Tasdiqlangan')}</option>
            <option value="pending">{t('Ожидает', 'Kutilmoqda')}</option>
            <option value="cancelled">{t('Отменён', 'Bekor qilingan')}</option>
          </select>
          <button
            onClick={handleSearch}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            <Filter className="w-4 h-4" />
            {t('Применить', 'Qo\'llash')}
          </button>
        </div>
      </div>

      {/* Table */}
      {payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-12 h-12 text-gray-300" />}
          title={t('Нет платежей', 'To\'lovlar yo\'q')}
          description={t('Платежи появятся здесь после создания', 'To\'lovlar yaratilgandan keyin bu yerda ko\'rinadi')}
          action={{ label: t('Добавить платёж', 'To\'lov qo\'shish'), onClick: () => setShowModal(true) }}
        />
      ) : (
        <div className="bg-white/60 rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Дата', 'Sana')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Квартира', 'Kvartira')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Сумма', 'Summa')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Тип', 'Turi')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Период', 'Davr')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Статус', 'Holat')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Описание', 'Tavsif')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(payments as unknown as Payment[]).map((p) => (
                  <tr key={p.id} className="hover:bg-white/40 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.apartment_number || p.apartment_id}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={p.amount >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {p.amount >= 0 ? '+' : ''}{Number(p.amount).toLocaleString()} {t('сум', 'so\'m')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{typeLabel(p.payment_type)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.period || '—'}</td>
                    <td className="px-4 py-3">{statusLabel(p.status || 'confirmed')}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{p.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-sm text-gray-500">
                {t('Страница', 'Sahifa')} {pagination.page} {t('из', '/')} {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchPayments(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fetchPayments(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{t('Новый платёж', 'Yangi to\'lov')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('ID квартиры *', 'Kvartira ID *')}</label>
                <input
                  type="text"
                  value={form.apartment_id}
                  onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                  placeholder={t('UUID квартиры', 'Kvartira UUID')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('Сумма *', 'Summa *')}</label>
                <input
                  type="number"
                  step="100"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                  placeholder={t('Сумма в сумах', 'So\'m miqdori')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('Тип оплаты', 'To\'lov turi')}</label>
                <select
                  value={form.payment_type}
                  onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                >
                  <option value="cash">{t('Наличные', 'Naqd')}</option>
                  <option value="card">{t('Карта', 'Karta')}</option>
                  <option value="transfer">{t('Перевод', 'O\'tkazma')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('Период', 'Davr')}</label>
                <input
                  type="month"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('Описание', 'Tavsif')}</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                  placeholder={t('Комментарий к платежу', 'To\'lov sharhi')}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  {t('Отмена', 'Bekor qilish')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('Создать', 'Yaratish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
