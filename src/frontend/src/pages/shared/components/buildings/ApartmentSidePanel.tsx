import {
  Trash2, Edit, X, Loader2, Save, Key, Phone, User,
} from 'lucide-react';
import type { Apartment, Entrance } from './types';
import { getAptStatus, getStatusStyle, getStatusLabel } from './types';

interface ApartmentSidePanelProps {
  panelOpen: boolean;
  selectedApartment: Apartment | null;
  isEditingApartment: boolean;
  isAddingApartment: boolean;
  editForm: {
    number: string; floor: string; rooms: string; total_area: string;
    status: string; is_commercial: boolean; entrance_id: string;
  };
  setEditForm: (form: any) => void;
  isSavingApartment: boolean;
  isLoadingResidents: boolean;
  apartmentResidents: any[];
  entrances: Entrance[];
  language: string;
  onClose: () => void;
  onSaveApartment: () => void;
  onCancelEdit: () => void;
  onStartEdit: (apt: Apartment) => void;
  onDeleteApartment: () => void;
}

export function ApartmentSidePanel({
  panelOpen,
  selectedApartment,
  isEditingApartment,
  isAddingApartment,
  editForm,
  setEditForm,
  isSavingApartment,
  isLoadingResidents,
  apartmentResidents,
  entrances,
  language,
  onClose,
  onSaveApartment,
  onCancelEdit,
  onStartEdit,
  onDeleteApartment,
}: ApartmentSidePanelProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    <div
      className="flex-shrink-0 bg-white border-l border-gray-200 overflow-hidden transition-all duration-300"
      style={{ width: panelOpen ? 360 : 0 }}
    >
      <div className="w-[360px] overflow-y-auto h-full">
        {/* Panel Header */}
        <div className="p-5 pb-3.5 border-b border-gray-200 flex items-start justify-between">
          <div>
            <div className="text-[24px] font-black tracking-tight">
              {isAddingApartment ? t('Новая кв.', 'Yangi xn.') : `${t('Кв', 'Xn')}. ${selectedApartment?.number || ''}`}
            </div>
            {selectedApartment && !isAddingApartment && (
              <div className="text-[12px] text-gray-400 mt-0.5">
                {t('Этаж', 'Qavat')} {selectedApartment.floor}
                {selectedApartment.rooms && ` · ${selectedApartment.rooms} ${t('ком.', 'xona')}`}
                {selectedApartment.total_area && ` · ${selectedApartment.total_area} м²`}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status pill */}
        {selectedApartment && !isEditingApartment && !isAddingApartment && (
          <div className="px-5 pt-3.5">
            <span
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold"
              style={getStatusStyle(getAptStatus(selectedApartment))}
            >
              ● {getStatusLabel(getAptStatus(selectedApartment), language)}
            </span>
          </div>
        )}

        {/* Edit / Add form */}
        {(isEditingApartment || isAddingApartment) ? (
          <div className="p-5 space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Номер квартиры', 'Xonadon raqami')} *</label>
              <input type="text" value={editForm.number} onChange={e => setEditForm({ ...editForm, number: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" placeholder="1, 2, 101..." />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж', 'Qavat')}</label>
                <input type="number" value={editForm.floor} onChange={e => setEditForm({ ...editForm, floor: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" min="1" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Комнат', 'Xonalar')}</label>
                <input type="number" value={editForm.rooms} onChange={e => setEditForm({ ...editForm, rooms: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" min="1" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Площадь (м²)', 'Maydon (m²)')}</label>
              <input type="number" value={editForm.total_area} onChange={e => setEditForm({ ...editForm, total_area: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" step="0.1" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Подъезд', 'Podyezd')}</label>
              <select value={editForm.entrance_id} onChange={e => setEditForm({ ...editForm, entrance_id: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all">
                <option value="">—</option>
                {entrances.sort((a, b) => a.number - b.number).map(ent => (
                  <option key={ent.id} value={ent.id}>{t('Подъезд', 'Podyezd')} {ent.number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Статус', 'Holat')}</label>
              <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all">
                <option value="occupied">{t('Занята', 'Band')}</option>
                <option value="vacant">{t('Свободна', "Bo'sh")}</option>
                <option value="rented">{t('Аренда', 'Ijara')}</option>
                <option value="renovation">{t('Ремонт', "Ta'mir")}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
              <input type="checkbox" checked={editForm.is_commercial} onChange={e => setEditForm({ ...editForm, is_commercial: e.target.checked })}
                className="w-4 h-4 rounded accent-orange-500" />
              {t('Коммерческое помещение', 'Tijorat binosi')}
            </label>

            <div className="h-px bg-gray-200 my-1" />

            <button onClick={onSaveApartment} disabled={isSavingApartment}
              className="w-full py-3 rounded-xl bg-orange-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-all disabled:opacity-50">
              {isSavingApartment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('Сохранить', 'Saqlash')}
            </button>
            <button onClick={onCancelEdit} className="w-full py-3 rounded-xl border border-gray-200 text-[14px] font-bold text-gray-500 hover:bg-gray-50 transition-all">
              {t('Отмена', 'Bekor')}
            </button>
            {!isAddingApartment && selectedApartment && (
              <button onClick={onDeleteApartment}
                className="w-full py-3 rounded-xl border border-red-200 text-[14px] font-bold text-red-600 flex items-center justify-center gap-2 hover:bg-red-50 transition-all">
                <Trash2 className="w-4 h-4" /> {t('Удалить квартиру', "Xonadonni o'chirish")}
              </button>
            )}
          </div>
        ) : selectedApartment && (
          <>
            {/* Read-only info */}
            <div className="p-5 space-y-3">
              <div className="flex justify-between text-[14px]">
                <span className="text-gray-400">{t('Этаж', 'Qavat')}</span>
                <span className="font-semibold">{selectedApartment.floor || '—'}</span>
              </div>
              {selectedApartment.total_area && (
                <div className="flex justify-between text-[14px]">
                  <span className="text-gray-400">{t('Площадь', 'Maydon')}</span>
                  <span className="font-semibold">{selectedApartment.total_area} м²</span>
                </div>
              )}
              {selectedApartment.rooms && (
                <div className="flex justify-between text-[14px]">
                  <span className="text-gray-400">{t('Комнат', 'Xonalar')}</span>
                  <span className="font-semibold">{selectedApartment.rooms}</span>
                </div>
              )}
            </div>

            <div className="h-px bg-gray-200 mx-5" />

            {/* Residents */}
            <div className="p-5">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> {t('Жильцы', 'Yashovchilar')}
              </h4>
              {isLoadingResidents ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                </div>
              ) : apartmentResidents.length > 0 ? (
                <div className="space-y-2.5">
                  {apartmentResidents.map((r, idx) => (
                    <div key={r.id || idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center gap-3 mb-1.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0">
                          {(r.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[13px] truncate">{r.name || t('Без имени', 'Ismsiz')}</div>
                          {r.type === 'owner' && <span className="text-xs text-orange-600 font-bold">{t('Собственник', 'Mulkdor')}</span>}
                        </div>
                      </div>
                      <div className="space-y-1 pl-0.5">
                        {r.phone && (
                          <a
                            href={`tel:${r.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 text-xs text-gray-500 hover:text-primary-600 active:text-primary-700 touch-manipulation"
                          >
                            <Phone className="w-3 h-3 text-gray-300" /> {r.phone}
                          </a>
                        )}
                        {r.login && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Key className="w-3 h-3 text-gray-300" /> <span className="font-mono">{t('Логин', 'Login')}: {r.login}</span>
                          </div>
                        )}
                        {r.password_decrypted && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Key className="w-3 h-3 text-gray-300" /> <span className="font-mono">{t('Пароль', 'Parol')}: {r.password_decrypted}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-gray-300 text-center py-3">{t('Нет зарегистрированных', "Ro'yxatdan o'tganlar yo'q")}</p>
              )}
            </div>

            <div className="h-px bg-gray-200 mx-5" />

            {/* Actions */}
            <div className="p-5 space-y-2">
              <button onClick={() => onStartEdit(selectedApartment)}
                className="w-full py-3 rounded-xl bg-orange-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-all">
                <Edit className="w-4 h-4" /> {t('Редактировать', 'Tahrirlash')}
              </button>
              <button onClick={onDeleteApartment}
                className="w-full py-3 rounded-xl border border-red-200 text-[14px] font-bold text-red-600 flex items-center justify-center gap-2 hover:bg-red-50 transition-all">
                <Trash2 className="w-4 h-4" /> {t('Удалить', "O'chirish")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
