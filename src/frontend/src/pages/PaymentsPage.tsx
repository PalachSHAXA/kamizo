import { useEffect } from 'react';
import { CreditCard, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePaymentsStore } from '../stores/paymentsStore';
import { useLanguageStore } from '../stores/languageStore';
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
  const {
    payments, isLoading, filters, pagination,
    fetchPayments, setFilters,
  } = usePaymentsStore();

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
      {/* Header — Sprint 40: brand-orange avatar pattern */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('Платежи', "To'lovlar")}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('Управление платежами и начислениями', "To'lovlar va hisob-kitoblar")}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/60 rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
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
          description={t('Новые платежи учитываются в разделе «Начисления»', 'Yangi to\'lovlar «Hisob-kitob» bo\'limida yuritiladi')}
        />
      ) : (
        <div className="bg-white/60 rounded-xl border border-gray-100 overflow-hidden">
          {/* Sprint 3: mobile card list — 7-column table doesn't fit a phone. */}
          <ul className="md:hidden divide-y divide-gray-100">
            {(payments as unknown as Payment[]).map((p) => (
              <li key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}</div>
                    <div className="text-base font-semibold text-gray-900 mt-0.5">
                      {t('Кв.', 'Kv.')} {p.apartment_number || p.apartment_id}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{typeLabel(p.payment_type)} · {p.period || '—'}</div>
                    {p.description && (
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-base font-bold ${p.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {p.amount >= 0 ? '+' : ''}{Number(p.amount).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">{t('сум', "so'm")}</div>
                    <div className="mt-1">{statusLabel(p.status || 'confirmed')}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 text-left bg-white/95 backdrop-blur-sm">
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
    </div>
  );
}
