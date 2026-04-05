import { X, Star } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { SPECIALIZATION_LABELS } from '../../types';
import type { ExecutorSpecialization, Request } from '../../types';

// Format request number - if it's already formatted (e.g., YS-L-1001 or #ABC123), don't add #
const formatRequestNumber = (num: number | string): string => {
  if (typeof num === 'string') {
    if (num.includes('-') || num.startsWith('#')) {
      return num;
    }
  }
  return `#${num}`;
};

interface AssignExecutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: Request;
  executors: any[];
  onAssign: (requestId: string, executorId: string) => void;
}

export function AssignExecutorModal({ isOpen, onClose, request, executors, onAssign }: AssignExecutorModalProps) {
  const { language } = useLanguageStore();

  if (!isOpen) return null;

  // Filter executors by specialization
  const matchingExecutors = executors.filter(e => e.specialization === request.category);
  const otherExecutors = executors.filter(e => e.specialization !== request.category);

  const ExecutorOption = ({ executor, recommended }: { executor: any; recommended?: boolean }) => (
    <button
      onClick={() => onAssign(request.id, executor.id)}
      className={`w-full p-3 md:p-4 rounded-xl text-left transition-colors touch-manipulation ${
        recommended ? 'bg-green-50 hover:bg-green-100 border-2 border-green-200 ring-2 ring-green-400' : 'bg-white/30 hover:bg-white/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 bg-primary-100 rounded-full flex items-center justify-center text-xs md:text-sm font-medium text-primary-700 flex-shrink-0">
            {executor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-1.5 md:gap-2 flex-wrap text-sm md:text-base">
              <span className="truncate">{executor.name}</span>
              {recommended && <span className="text-xs bg-green-500 text-white px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full flex-shrink-0">{language === 'ru' ? 'Рек.' : 'Tav.'}</span>}
            </div>
            <div className="text-xs md:text-sm text-gray-500 truncate">
              {SPECIALIZATION_LABELS[executor.specialization as ExecutorSpecialization]}
            </div>
          </div>
        </div>
        <div className="text-right text-xs md:text-sm flex-shrink-0">
          <div className="flex items-center gap-1 text-amber-500">
            <Star className="w-3 h-3 md:w-4 md:h-4 fill-amber-500" />
            {executor.rating}
          </div>
          <div className="text-gray-500">{executor.activeRequests} {language === 'ru' ? 'акт.' : 'faol'}</div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-lg mx-3 md:mx-4 max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between mb-4 md:mb-6 gap-2">
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Назначить исполнителя' : 'Ijrochi tayinlash'}</h2>
            <p className="text-xs md:text-sm text-gray-500 mt-1 truncate">{language === 'ru' ? 'Заявка' : 'Ariza'} {formatRequestNumber(request.number)}: {request.title}</p>
          </div>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200 flex-shrink-0" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 md:space-y-4">
          {matchingExecutors.length > 0 && (
            <div>
              <h3 className="text-xs md:text-sm font-medium text-gray-500 mb-2">
                {SPECIALIZATION_LABELS[request.category as ExecutorSpecialization]} ({matchingExecutors.length})
              </h3>
              <div className="space-y-2">
                {matchingExecutors.map(executor => (
                  <ExecutorOption key={executor.id} executor={executor} recommended />
                ))}
              </div>
            </div>
          )}

          {otherExecutors.length > 0 && (
            <div>
              <h3 className="text-xs md:text-sm font-medium text-gray-500 mb-2">{language === 'ru' ? 'Другие специалисты' : 'Boshqa mutaxassislar'}</h3>
              <div className="space-y-2">
                {otherExecutors.map(executor => (
                  <ExecutorOption key={executor.id} executor={executor} />
                ))}
              </div>
            </div>
          )}

          {executors.length === 0 && (
            <div className="text-center py-6 md:py-8 text-gray-500 text-sm">
              {language === 'ru' ? 'Нет доступных исполнителей' : 'Mavjud ijrochilar yo\'q'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
