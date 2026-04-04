import { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import type { Entrance } from './types';

interface EntranceEditModalProps {
  entrance: Entrance;
  existingApartmentCount: number;
  onClose: () => void;
  onSave: (data: { floors_from: number; floors_to: number; apartments_from: number; apartments_to: number }) => void;
  language: string;
}

export function EntranceEditModal({ entrance, existingApartmentCount, onClose, onSave, language }: EntranceEditModalProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [form, setForm] = useState({
    floors_from: entrance.floors_from ?? 1,
    floors_to: entrance.floors_to ?? 9,
    apartments_from: entrance.apartments_from ?? 1,
    apartments_to: entrance.apartments_to ?? 36,
  });
  const [saving, setSaving] = useState(false);

  const newAptCount = form.apartments_to - form.apartments_from + 1;
  const tooFew = newAptCount < existingApartmentCount;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110]" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-lg font-bold">{t('Подъезд', 'Podyezd')} {entrance.number}</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">{t('Редактирование параметров', 'Parametrlarni tahrirlash')}</p>
          </div>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400" aria-label="Закрыть"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={async e => {
          e.preventDefault();
          if (tooFew) return;
          setSaving(true);
          try { await onSave(form); } finally { setSaving(false); }
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж с', 'Qavatdan')}</label>
              <input type="number" value={form.floors_from} onChange={e => setForm({ ...form, floors_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж по', 'Qavatgacha')}</label>
              <input type="number" value={form.floors_to} onChange={e => setForm({ ...form, floors_to: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира с', 'Xonadondan')}</label>
              <input type="number" value={form.apartments_from} onChange={e => setForm({ ...form, apartments_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира по', 'Xonadongacha')}</label>
              <input type="number" value={form.apartments_to} onChange={e => setForm({ ...form, apartments_to: parseInt(e.target.value) || 1 })}
                className={`w-full px-3.5 py-2.5 border rounded-xl text-sm bg-gray-50 focus:bg-white outline-none ${tooFew ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-orange-400'}`} min="1" />
            </div>
          </div>

          {existingApartmentCount > 0 && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${tooFew ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {tooFew
                  ? t(
                      `Количество квартир не может быть меньше уже существующих записей (${existingApartmentCount} кв.)`,
                      `Xonadonlar soni mavjud yozuvlardan kam bo'lishi mumkin emas (${existingApartmentCount} xn.)`
                    )
                  : t(
                      `В подъезде уже создано ${existingApartmentCount} кв. Существующие квартиры и жители не будут удалены.`,
                      `Podyezdda allaqachon ${existingApartmentCount} xn. yaratilgan. Mavjud xonadonlar va yashovchilar o'chirilmaydi.`
                    )
                }
              </span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm">{t('Отмена', 'Bekor')}</button>
            <button type="submit" disabled={tooFew || saving} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('Сохранить', 'Saqlash')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
