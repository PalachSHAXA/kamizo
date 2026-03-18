import { Phone, Star, Trash2, ChevronRight } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { SPECIALIZATION_LABELS } from '../../../types';
import type { ExecutorSpecialization } from '../../../types';
import type { ExecutorCardProps } from './types';

// Executor Card Component - used in ExecutorsPage
export function ExecutorCard({
  executor,
  onClick,
  onDelete,
  onStatusChange
}: ExecutorCardProps) {
  const { language } = useLanguageStore();
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return <span className="badge bg-green-100 text-green-700 text-xs">{language === 'ru' ? 'Доступен' : 'Mavjud'}</span>;
      case 'busy': return <span className="badge bg-amber-100 text-amber-700 text-xs">{language === 'ru' ? 'Занят' : 'Band'}</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600 text-xs">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</span>;
      default: return <span className="badge text-xs">{status}</span>;
    }
  };

  return (
    <div
      onClick={onClick}
      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-white/30 rounded-xl hover:bg-white/50 transition-colors gap-3 cursor-pointer active:scale-[0.99] touch-manipulation"
    >
      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-100 rounded-full flex items-center justify-center text-sm md:text-lg font-medium text-primary-700 flex-shrink-0">
          {executor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold flex items-center gap-2 flex-wrap text-sm md:text-base">
            <span className="truncate">{executor.name}</span>
            {getStatusBadge(executor.status)}
          </div>
          <div className="text-xs md:text-sm text-gray-500 truncate">
            {SPECIALIZATION_LABELS[executor.specialization as ExecutorSpecialization]}
          </div>
          <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-gray-500 mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              <span className="hidden sm:inline">{executor.phone}</span>
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              {executor.rating.toFixed(1)}
            </span>
            <span className="hidden sm:inline">{executor.completedCount} {language === 'ru' ? 'вып.' : 'baj.'}</span>
            <span>{executor.activeRequests} {language === 'ru' ? 'акт.' : 'faol'}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
        <select
          value={executor.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(e.target.value as 'available' | 'busy' | 'offline');
          }}
          className="glass-input text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3"
        >
          <option value="available">{language === 'ru' ? 'Доступен' : 'Mavjud'}</option>
          <option value="busy">{language === 'ru' ? 'Занят' : 'Band'}</option>
          <option value="offline">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</option>
        </select>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg sm:rounded-xl transition-colors touch-manipulation active:bg-red-100"
          title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
        >
          <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
        </button>
        <ChevronRight className="w-5 h-5 text-gray-400 hidden sm:block" />
      </div>
    </div>
  );
}
