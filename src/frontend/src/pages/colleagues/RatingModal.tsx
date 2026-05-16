// Sprint 28: extracted from ColleaguesSection. 10-criterion rating
// modal for an employee. Resident view shows a simpler 3-criterion
// set (quality, manners, speed) while management sees the full HR
// table — the rest of the criteria are auto-filled with the same
// average so the leaderboard ranking logic on the backend doesn't
// break for the resident path.

import { useState } from 'react';
import { Modal } from '../../components/common';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { StarRating } from './StarRating';
import { getColleagueLabels } from './labels';
import type { Employee, Rating } from './types';

export function RatingModal({ employee, onClose, onSubmit, isResidentView }: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (ratings: Rating['ratings']) => void;
  isResidentView: boolean;
}) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const labels = getColleagueLabels(language);
  const [ratings, setRatings] = useState<Rating['ratings']>({
    professionalKnowledge: 0,
    legislationKnowledge: 0,
    analyticalSkills: 0,
    qualityOfWork: 0,
    execution: 0,
    reliability: 0,
    teamwork: 0,
    communication: 0,
    initiative: 0,
    humanity: 0,
  });
  const [comment, setComment] = useState('');

  // Resident view sees only 3 criteria; they map to the backend's three
  // most resident-relevant dimensions.
  const residentCriteria: { key: keyof Rating['ratings']; label: { ru: string; uz: string } }[] = [
    { key: 'qualityOfWork', label: { ru: 'Качество работы', uz: 'Ish sifati' } },
    { key: 'humanity', label: { ru: 'Вежливость', uz: 'Xushmuomalalik' } },
    { key: 'execution', label: { ru: 'Скорость', uz: 'Tezlik' } },
  ];
  const visibleCriteria = isResidentView
    ? residentCriteria.map(c => [c.key, language === 'ru' ? c.label.ru : c.label.uz] as const)
    : (Object.entries(labels.criteriaLabels) as [keyof Rating['ratings'], string][]);

  const handleSubmit = () => {
    if (isResidentView) {
      // Require all 3 visible criteria to have a rating.
      const missing = residentCriteria.some(c => !ratings[c.key]);
      if (missing) {
        addToast('warning', language === 'ru' ? 'Пожалуйста, оцените все критерии' : 'Iltimos, barcha mezonlarni baholang');
        return;
      }
      // Auto-fill the rest with the average of the 3 given ratings.
      const avg = (ratings.qualityOfWork + ratings.humanity + ratings.execution) / 3;
      onSubmit({
        ...ratings,
        professionalKnowledge: avg,
        legislationKnowledge: avg,
        analyticalSkills: avg,
        reliability: avg,
        teamwork: avg,
        communication: avg,
        initiative: avg,
      });
      onClose();
      return;
    }

    const allRated = Object.values(ratings).every(r => r > 0);
    if (!allRated) {
      addToast('warning', language === 'ru' ? 'Пожалуйста, оцените все критерии' : 'Iltimos, barcha mezonlarni baholang');
      return;
    }
    onSubmit(ratings);
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${language === 'ru' ? 'Оценить' : 'Baholash'}: ${employee.name}`} size="lg">
      <div className="max-h-[70dvh] overflow-y-auto">
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">{language === 'ru' ? 'Ваша оценка абсолютно анонимна' : 'Sizning bahongiz mutlaqo anonimdir'}</p>
        </div>

        <div className="space-y-4">
          {visibleCriteria.map(([key, label]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              <StarRating
                rating={ratings[key as keyof typeof ratings]}
                onChange={(r) => setRatings({ ...ratings, [key]: r })}
              />
            </div>
          ))}
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">{language === 'ru' ? 'Комментарий (необязательно)' : 'Izoh (ixtiyoriy)'}</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            rows={4}
            placeholder={language === 'ru' ? 'Поделитесь своими мыслями...' : 'O\'z fikringizni baham ko\'ring...'}
          />
        </div>

        <button
          onClick={handleSubmit}
          className="w-full mt-6 bg-primary-500 hover:bg-primary-600 text-white font-medium py-3 rounded-lg transition-colors"
        >
          {language === 'ru' ? 'Отправить оценку' : 'Baholashni yuborish'}
        </button>
      </div>
    </Modal>
  );
}
