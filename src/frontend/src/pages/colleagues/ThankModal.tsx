// Sprint 27: extracted from ColleaguesSection. "Thank a colleague"
// dialog — pick from 5 preset reasons or write your own, optional
// anonymous toggle. Parent owns the open state; this is presentational.

import { useState } from 'react';
import { Modal } from '../../components/common';
import { useLanguageStore } from '../../stores/languageStore';
import type { Employee } from './types';

// Sprint 27: thank-reasons table inlined here (was in parent file's
// getLabels). Single source of truth lives where it's used.
const THANK_REASONS = {
  ru: [
    'Помог с задачей',
    'Поддержал в сложный момент',
    'Научил чему-то новому',
    'Выручил в дедлайн',
    'Просто спасибо',
  ],
  uz: [
    'Vazifada yordam berdi',
    "Qiyin vaqtda qo'llab-quvvatladi",
    "Yangi narsalar o'rgatdi",
    'Muddatda yordam berdi',
    'Shunchaki raxmat',
  ],
} as const;

export function ThankModal({ employee, onClose, onSubmit }: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (reason: string, isAnonymous: boolean) => void;
}) {
  const { language } = useLanguageStore();
  const thankReasons = THANK_REASONS[language as 'ru' | 'uz'] ?? THANK_REASONS.ru;
  const [reason, setReason] = useState(thankReasons[0]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSubmit = () => {
    onSubmit(reason, isAnonymous);
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${language === 'ru' ? 'Поблагодарить' : 'Raxmat aytish'}: ${employee.name}`} size="sm">
      <label className="block text-sm font-medium mb-2">{language === 'ru' ? 'За что спасибо?' : 'Nima uchun raxmat?'}</label>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
      >
        {thankReasons.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm">{language === 'ru' ? 'Отправить анонимно' : 'Anonimly yuborish'}</span>
      </label>

      <button
        onClick={handleSubmit}
        className="w-full mt-6 bg-primary-500 hover:bg-primary-600 text-white font-medium py-3 rounded-lg transition-colors"
      >
        {language === 'ru' ? 'Отправить спасибо' : 'Raxamatni yuborish'}
      </button>
    </Modal>
  );
}

