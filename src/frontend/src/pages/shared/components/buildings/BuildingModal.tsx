import { useState } from 'react';
import { X } from 'lucide-react';
import type { BuildingFull } from '../../../../types';

interface BuildingModalProps {
  building: BuildingFull | null;
  onClose: () => void;
  onSave: (data: any) => void;
  language: string;
}

export function BuildingModal({ building, onClose, onSave, language }: BuildingModalProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [form, setForm] = useState({
    name: building?.name || '', address: building?.address || '', buildingNumber: building?.buildingNumber || '',
    floors: building?.floors || 9, entrances: building?.entrances || 4, totalApartments: building?.totalApartments || 144,
    yearBuilt: building?.yearBuilt || 2020, buildingType: building?.buildingType || 'monolith' as const,
    hasElevator: building?.hasElevator ?? true, hasGas: building?.hasGas ?? true,
    hasHotWater: building?.hasHotWater ?? true, hasParkingLot: building?.hasParkingLot ?? false,
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[200]" onClick={onClose}>
      <div className="bg-white/90 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{building ? t('Редактировать дом', 'Uyni tahrirlash') : t('Новый дом', 'Yangi uy')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400" aria-label="Закрыть"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (form.name && form.address) onSave(form); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Название', 'Nomi')} *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" placeholder={t('Дом 5Б, Корпус 2...', 'Uy 5B, Korpus 2...')} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Адрес', 'Manzil')} *</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Номер дома', 'Uy raqami')}</label>
              <input value={form.buildingNumber} onChange={e => setForm({ ...form, buildingNumber: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" placeholder="8A" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Год постройки', 'Qurilgan yili')}</label>
              <input type="number" value={form.yearBuilt} onChange={e => setForm({ ...form, yearBuilt: parseInt(e.target.value) || 2020 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этажей', 'Qavatlar')}</label>
              <input type="number" value={form.floors} onChange={e => setForm({ ...form, floors: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Подъездов', 'Podyezdlar')}</label>
              <input type="number" value={form.entrances} onChange={e => setForm({ ...form, entrances: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартир', 'Xonadonlar')}</label>
              <input type="number" value={form.totalApartments} onChange={e => setForm({ ...form, totalApartments: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Тип дома', 'Uy turi')}</label>
            <select value={form.buildingType} onChange={e => setForm({ ...form, buildingType: e.target.value as any })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none">
              <option value="panel">{t('Панельный', 'Panelli')}</option>
              <option value="brick">{t('Кирпичный', "G'ishtli")}</option>
              <option value="monolith">{t('Монолитный', 'Monolitik')}</option>
              <option value="block">{t('Блочный', 'Blokli')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'hasElevator', label: t('Лифт', 'Lift') },
              { key: 'hasGas', label: t('Газ', 'Gaz') },
              { key: 'hasHotWater', label: t('Горячая вода', 'Issiq suv') },
              { key: 'hasParkingLot', label: t('Парковка', 'Parking') },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl cursor-pointer text-sm font-semibold">
                <input type="checkbox" checked={(form as any)[item.key]}
                  onChange={e => setForm({ ...form, [item.key]: e.target.checked })} className="w-4 h-4 accent-orange-500" />
                {item.label}
              </label>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 transition-colors">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{building ? t('Сохранить', 'Saqlash') : t('Создать', 'Yaratish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
