import {
  X, Key, Copy, Trash2, Edit3, Eye, EyeOff, Save,
  MapPin, Home, Phone, Loader2, CheckCircle
} from 'lucide-react';
import type { ResidentCardData } from './types';

interface ResidentCardModalProps {
  resident: ResidentCardData;
  currentUserRole: string;
  editingPassword: boolean;
  setEditingPassword: (v: boolean) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  editNameValue: string;
  setEditNameValue: (v: string) => void;
  savingName: boolean;
  nameToast: string;
  getResidentPassword: (resident: ResidentCardData) => string;
  onClose: () => void;
  onDelete: () => void;
  onSavePassword: () => void;
  onSaveName: () => void;
  onCopyToClipboard: (text: string) => void;
  language: string;
}

export function ResidentCardModal({
  resident,
  currentUserRole,
  editingPassword,
  setEditingPassword,
  newPassword,
  setNewPassword,
  showPassword,
  setShowPassword,
  editingName,
  setEditingName,
  editNameValue,
  setEditNameValue,
  savingName,
  nameToast,
  getResidentPassword,
  onClose,
  onDelete,
  onSavePassword,
  onSaveName,
  onCopyToClipboard,
  language,
}: ResidentCardModalProps) {
  return (
    <div className="modal-backdrop items-end sm:items-center">
      <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-bold">{language === 'ru' ? 'Карточка жителя' : 'Yashovchi kartasi'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/30 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast */}
        {nameToast && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {nameToast}
          </div>
        )}

        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
            <span className="text-2xl font-bold text-white">
              {resident.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          {!editingName ? (
            <div className="flex items-center justify-center gap-2">
              <h3 className="text-xl font-bold text-gray-900">{resident.name}</h3>
              {['admin', 'director', 'manager', 'super_admin'].includes(currentUserRole) && (
                <button
                  onClick={() => {
                    setEditNameValue(resident.name);
                    setEditingName(true);
                  }}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                  title={language === 'ru' ? 'Редактировать ФИО' : 'FISh ni tahrirlash'}
                >
                  <Edit3 className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <input
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                className="input-field text-center text-base font-semibold w-full max-w-xs"
                placeholder={language === 'ru' ? 'Фамилия Имя Отчество' : 'Familiya Ism Otasining ismi'}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={onSaveName}
                  disabled={!editNameValue.trim() || savingName}
                  className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50 flex items-center gap-1"
                >
                  {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {language === 'ru' ? 'Сохранить' : 'Saqlash'}
                </button>
                <button
                  onClick={() => { setEditingName(false); setEditNameValue(''); }}
                  className="btn-secondary text-sm py-1.5 px-4"
                >
                  {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 mb-6">
          <div className="p-4 bg-primary-50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Key className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="text-xs text-primary-600 font-medium">{language === 'ru' ? 'Л/С (Логин)' : 'Sh/H (Login)'}</div>
                  <div className="font-mono font-bold text-primary-900">{resident.login}</div>
                </div>
              </div>
              <button
                onClick={() => onCopyToClipboard(resident.login)}
                className="p-2 hover:bg-primary-100 rounded-lg transition-colors"
                title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
              >
                <Copy className="w-4 h-4 text-primary-600" />
              </button>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                  <Key className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Пароль' : 'Parol'}</div>
                  {!editingPassword ? (
                    <div className="font-mono font-bold text-gray-900 flex items-center gap-2">
                      {showPassword ? getResidentPassword(resident) : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowPassword(!showPassword);
                        }}
                        className="p-2 hover:bg-gray-200 active:bg-gray-300 rounded touch-manipulation z-10"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={language === 'ru' ? 'Новый пароль' : 'Yangi parol'}
                      className="input-field text-sm py-1 px-2 w-40"
                      autoFocus
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editingPassword ? (
                  <>
                    <button
                      onClick={() => onCopyToClipboard(getResidentPassword(resident))}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                    >
                      <Copy className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingPassword(true);
                        setNewPassword(getResidentPassword(resident));
                      }}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      title={language === 'ru' ? 'Изменить пароль' : 'Parolni o\'zgartirish'}
                    >
                      <Edit3 className="w-4 h-4 text-gray-600" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onSavePassword}
                      disabled={newPassword.length < 4}
                      className="p-2 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                      title={language === 'ru' ? 'Сохранить' : 'Saqlash'}
                    >
                      <Save className="w-4 h-4 text-green-600" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingPassword(false);
                        setNewPassword('');
                      }}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      title={language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                    >
                      <X className="w-4 h-4 text-gray-600" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {editingPassword && newPassword.length > 0 && newPassword.length < 4 && (
              <p className="text-xs text-red-500 mt-1 ml-13">{language === 'ru' ? 'Минимум 4 символа' : 'Kamida 4 ta belgi'}</p>
            )}
          </div>

          {resident.address && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Адрес' : 'Manzil'}</div>
                  <div className="font-medium text-gray-900">{resident.address}</div>
                </div>
              </div>
            </div>
          )}

          {resident.apartment && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                  <Home className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Квартира / Помещение' : 'Xonadon / Xona'}</div>
                  <div className="font-bold text-gray-900">{resident.apartment}</div>
                </div>
              </div>
            </div>
          )}

          {resident.phone && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                  <Phone className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Телефон' : 'Telefon'}</div>
                  <div className="font-medium text-gray-900">{resident.phone}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDelete}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            {language === 'ru' ? 'Удалить' : 'O\'chirish'}
          </button>
          <button
            onClick={onClose}
            className="btn-primary flex-1"
          >
            {language === 'ru' ? 'Закрыть' : 'Yopish'}
          </button>
        </div>
      </div>
    </div>
  );
}
