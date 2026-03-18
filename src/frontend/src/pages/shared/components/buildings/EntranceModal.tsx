import { useState } from 'react';
import { X } from 'lucide-react';
import type { Entrance } from './types';

interface EntranceModalProps {
  onClose: () => void;
  onSave: (data: { number: number; floors_from?: number; floors_to?: number; apartments_from?: number; apartments_to?: number }) => void;
  existingEntrances: Entrance[];
  language: string;
}

export function EntranceModal({ onClose, onSave, existingEntrances, language }: EntranceModalProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const nextNum = existingEntrances.length > 0 ? Math.max(...existingEntrances.map(e => e.number)) + 1 : 1;
  const [form, setForm] = useState({ number: nextNum, floors_from: 1, floors_to: 9, apartments_from: 1, apartments_to: 36 });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[200]" onClick={onClose}>
      <div className="bg-white/90 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{t('Новый подъезд', 'Yangi podyezd')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400" aria-label="Закрыть"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Номер подъезда', 'Podyezd raqami')} *</label>
            <input type="number" value={form.number} onChange={e => setForm({ ...form, number: parseInt(e.target.value) || 1 })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж с', 'Qavatdan')}</label>
              <input type="number" value={form.floors_from} onChange={e => setForm({ ...form, floors_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж по', 'Qavatgacha')}</label>
              <input type="number" value={form.floors_to} onChange={e => setForm({ ...form, floors_to: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира с', 'Xonadondan')}</label>
              <input type="number" value={form.apartments_from} onChange={e => setForm({ ...form, apartments_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира по', 'Xonadongacha')}</label>
              <input type="number" value={form.apartments_to} onChange={e => setForm({ ...form, apartments_to: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 transition-colors">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{t('Создать', 'Yaratish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
