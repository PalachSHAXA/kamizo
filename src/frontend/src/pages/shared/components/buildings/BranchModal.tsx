import { useState } from 'react';
import { X } from 'lucide-react';
import type { Branch } from './types';

interface BranchModalProps {
  branch: Branch | null;
  onClose: () => void;
  onSave: (data: { code: string; name: string; address?: string; phone?: string; district?: string }) => void;
  language: string;
  defaultDistrict?: string;
  canEditCode?: boolean;
  onChangeCode?: (newCode: string) => Promise<void>;
  districts?: string[];
}

export function BranchModal({ branch, onClose, onSave, language, defaultDistrict, canEditCode, onChangeCode, districts }: BranchModalProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [form, setForm] = useState({
    code: branch?.code || '', name: branch?.name || '',
    address: branch?.address || '', phone: branch?.phone || '',
    district: branch?.district || defaultDistrict || '',
  });
  const [codeEditing, setCodeEditing] = useState(false);
  const [newCode, setNewCode] = useState(branch?.code || '');
  const [codeLoading, setCodeLoading] = useState(false);

  const handleCodeChange = async () => {
    const trimmed = newCode.trim().toUpperCase();
    if (!trimmed || trimmed === branch?.code) { setCodeEditing(false); return; }
    const confirmed = confirm(
      language === 'ru'
        ? `Изменение кода комплекса с "${branch?.code}" на "${trimmed}" обновит все связанные дома. Продолжить?`
        : `"${branch?.code}" dan "${trimmed}" ga kompleks kodini o'zgartirish barcha uylarga ta'sir qiladi. Davom etasizmi?`
    );
    if (!confirmed) return;
    setCodeLoading(true);
    try {
      await onChangeCode!(trimmed);
      setForm(f => ({ ...f, code: trimmed }));
      setCodeEditing(false);
    } catch {
      // error already shown by parent
    } finally {
      setCodeLoading(false);
    }
  };

  const inputClass = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[200]" onClick={onClose}>
      <div className="bg-white/90 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{branch ? t('Редактировать комплекс', 'Kompleksni tahrirlash') : t('Новый комплекс', 'Yangi kompleks')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400" aria-label="Закрыть"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (form.code && form.name) onSave(form); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Название комплекса', 'Kompleks nomi')} *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className={`${inputClass} font-semibold`}
              placeholder={t('Комплекс "Ориент", ЖК "Юнусабад"...', 'Kompleks "Orient", Kompleks "Yunusobod"...')} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Код комплекса', 'Kompleks kodi')} *</label>
            {branch && canEditCode ? (
              codeEditing ? (
                <div className="flex gap-2">
                  <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3.5 py-2.5 border border-orange-400 rounded-xl text-sm font-mono font-bold bg-white outline-none"
                    placeholder={form.code} maxLength={20} autoFocus />
                  <button type="button" onClick={handleCodeChange} disabled={codeLoading}
                    className="px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl disabled:opacity-50">
                    {codeLoading ? '...' : t('ОК', 'OK')}
                  </button>
                  <button type="button" onClick={() => { setCodeEditing(false); setNewCode(form.code); }}
                    className="px-3 py-2 border border-gray-200 text-xs font-bold rounded-xl">✕</button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <div className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold bg-gray-50 text-gray-700">{form.code}</div>
                  <button type="button" onClick={() => { setCodeEditing(true); setNewCode(form.code); }}
                    className="px-3 py-2 border border-gray-200 text-xs font-semibold rounded-xl hover:border-orange-400 text-gray-600">
                    {t('Изменить', "O'zgartirish")}
                  </button>
                </div>
              )
            ) : (
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={`${inputClass} font-mono font-bold`}
                placeholder="YS, CH..." maxLength={20} disabled={!!branch} />
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Район', 'Tuman')}</label>
            {districts && districts.length > 0 ? (
              <select value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}
                className={inputClass}>
                <option value="">{t('Выберите район', 'Tumanni tanlang')}</option>
                {districts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}
                className={inputClass}
                placeholder={t('Юнусабадский, Мирзо-Улугбекский...', 'Yunusobod, Mirzo-Ulugbek...')} />
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Адрес (улица)', "Manzil (ko'cha)")}</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Телефон', 'Telefon')}</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className={inputClass} placeholder="+998..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 transition-colors">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{branch ? t('Сохранить', 'Saqlash') : t('Создать', 'Yaratish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
