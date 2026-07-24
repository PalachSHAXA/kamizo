import type { EstimateWarning } from '../../../services/api';

// Визуализация предупреждений валидатора (min tariff, 16 услуг, assembly, risk).
// Разбито по severity: сначала error, потом warning, потом info.

const SEVERITY_ORDER: Record<EstimateWarning['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_STYLE: Record<EstimateWarning['severity'], { bg: string; border: string; text: string; icon: string }> = {
  error:   { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800',    icon: '🚫' },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  icon: '⚠️' },
  info:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   icon: 'ℹ️' },
};

export function WarningsPanel({ warnings, isRu }: { warnings: EstimateWarning[]; isRu: boolean }) {
  if (warnings.length === 0) return null;

  const sorted = [...warnings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  // Считаем по severity для сводки в шапке
  const counts = warnings.reduce<Record<string, number>>((acc, w) => {
    acc[w.severity] = (acc[w.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
        <span>{isRu ? 'Проверка сметы' : 'Smeta tekshiruvi'}</span>
        <span className="text-xs text-gray-500 font-normal">
          {counts.error ? `🚫 ${counts.error} ` : ''}
          {counts.warning ? `⚠️ ${counts.warning} ` : ''}
          {counts.info ? `ℹ️ ${counts.info}` : ''}
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {sorted.map((w, i) => {
          const s = SEVERITY_STYLE[w.severity];
          return (
            <li key={i} className={`px-4 py-2.5 flex gap-3 ${s.bg} border-l-4 ${s.border}`}>
              <span className="text-lg flex-shrink-0">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${s.text}`}>
                  {isRu ? w.message_ru : w.message_uz}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">
                  {w.code}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
