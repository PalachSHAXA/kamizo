import { useState } from 'react';
import { X } from 'lucide-react';

interface DistrictModalProps {
  onClose: () => void;
  onSave: (districtName: string) => void;
  language: string;
}

export function DistrictModal({ onClose, onSave, language }: DistrictModalProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [name, setName] = useState('');
  // TODO: migrate to <Modal> component
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200]" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{t('Новый район', 'Yangi tuman')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400" aria-label="Закрыть"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSave(name.trim()); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Название района', 'Tuman nomi')} *</label>
            <input
              value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
              placeholder={t('Юнусабадский район', 'Yunusobod tumani')} />
          </div>
          <p className="text-[12px] text-gray-400">{t('После создания района вы сможете добавить ЖК в него.', "Tuman yaratilgandan so'ng unga TJM qo'sha olasiz.")}</p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{t('Продолжить', 'Davom etish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
