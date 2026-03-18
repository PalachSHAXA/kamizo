import { SPECIALIZATION_LABELS } from '../../../types';
import type { ExecutorSpecialization } from '../../../types';

interface ExecutorHeaderProps {
  userName?: string;
  specialization?: string;
  executorStatus?: string;
  language: 'ru' | 'uz';
}

export function ExecutorHeader({
  userName,
  specialization,
  executorStatus,
  language,
}: ExecutorHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-400 font-medium">
          {language === 'ru'
            ? `${new Date().getHours() < 12 ? '\u0414\u043e\u0431\u0440\u043e\u0435 \u0443\u0442\u0440\u043e' : new Date().getHours() < 18 ? '\u0414\u043e\u0431\u0440\u044b\u0439 \u0434\u0435\u043d\u044c' : '\u0414\u043e\u0431\u0440\u044b\u0439 \u0432\u0435\u0447\u0435\u0440'}`
            : `${new Date().getHours() < 12 ? 'Xayrli tong' : new Date().getHours() < 18 ? 'Xayrli kun' : 'Xayrli kech'}`}
        </p>
        <h1 className="text-xl md:text-2xl xl:text-3xl font-bold text-gray-900 truncate">
          {userName?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 truncate">
          {SPECIALIZATION_LABELS[specialization as ExecutorSpecialization] || (language === 'ru' ? '\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c' : 'Ijrochi')}
        </p>
      </div>
      <div className="flex-shrink-0">
        <div className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${
          executorStatus === 'available' ? 'bg-green-100 text-green-700' :
          executorStatus === 'busy' ? 'bg-amber-100 text-amber-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            executorStatus === 'available' ? 'bg-green-500' :
            executorStatus === 'busy' ? 'bg-amber-500 animate-pulse' :
            'bg-gray-400'
          }`} />
          {executorStatus === 'available' ? (language === 'ru' ? '\u0414\u043e\u0441\u0442\u0443\u043f\u0435\u043d' : 'Mavjud') :
           executorStatus === 'busy' ? (language === 'ru' ? '\u0417\u0430\u043d\u044f\u0442' : 'Band') : (language === 'ru' ? '\u041e\u0444\u0444\u043b\u0430\u0439\u043d' : 'Oflayn')}
        </div>
      </div>
    </div>
  );
}
