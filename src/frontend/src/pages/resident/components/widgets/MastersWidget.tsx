import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useExecutorStore } from '../../../../stores/dataStore';
import { useLanguageStore } from '../../../../stores/languageStore';
import { formatName } from '../../../../utils/formatName';
import { SPECIALIZATION_LABELS, SPECIALIZATION_LABELS_UZ } from '../../../../types';

/**
 * MastersWidget — top-3 highest-rated executors of the УК.
 * Lets the resident see "who is going to come" before they create a request,
 * builds trust. Tapping the widget opens /rate-employees where they can
 * also leave their own ratings.
 */
export function MastersWidget() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const executors = useExecutorStore(s => s.executors);

  // Sort by rating desc, take top 3 with rating set
  const topMasters = [...(executors || [])]
    .filter(e => typeof e.rating === 'number' && e.rating > 0)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 3);

  if (topMasters.length === 0) return null;

  return (
    <div className="bg-white rounded-[22px] p-[16px_18px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          <span className="text-[13px] font-bold text-gray-900">
            {language === 'ru' ? 'Лучшие мастера УК' : 'UKning eng yaxshi ustalari'}
          </span>
        </div>
        <button
          onClick={() => navigate('/rate-employees')}
          className="text-[12px] text-primary-600 font-semibold cursor-pointer"
        >
          {language === 'ru' ? 'Все →' : 'Hammasi →'}
        </button>
      </div>

      <div className="flex gap-3">
        {topMasters.map(m => {
          const fullName = formatName(m.name);
          const initials = fullName
            .split(' ')
            .filter(Boolean)
            .map(s => s[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
          const role = m.specialization
            ? (language === 'ru'
                ? SPECIALIZATION_LABELS[m.specialization as keyof typeof SPECIALIZATION_LABELS]
                : SPECIALIZATION_LABELS_UZ[m.specialization as keyof typeof SPECIALIZATION_LABELS_UZ])
            : '';
          return (
            <button
              key={m.id}
              onClick={() => navigate('/rate-employees')}
              className="flex-1 flex flex-col items-center gap-1.5 cursor-pointer text-center"
            >
              <div
                className="w-11 h-11 rounded-[14px] flex items-center justify-center text-white text-[13px] font-extrabold"
                style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}
              >
                {initials || '👤'}
              </div>
              <div className="text-[11px] font-semibold text-gray-900 truncate w-full">
                {fullName.split(' ')[0]}
              </div>
              {role && (
                <div className="text-[9px] text-gray-400 truncate w-full">
                  {role}
                </div>
              )}
              <div className="text-[10px] text-amber-500 font-semibold mt-0.5 flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5 fill-amber-500" />
                {(m.rating || 0).toFixed(1)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
