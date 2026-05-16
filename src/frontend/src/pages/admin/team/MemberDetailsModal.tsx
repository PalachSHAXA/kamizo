import { type ReactNode } from 'react';
import {
  X, Star, Award, Clock, Phone, Loader2, Eye, EyeOff, Check, Copy, Save, Edit3,
} from 'lucide-react';
import type { ExecutorSpecialization } from '../../../types';

// Sprint 19: extracted from TeamPage. Staff member details view with
// inline edit form. Stays presentational — parent owns the
// selectedMember + editForm + isEditing + isLoadingDetails +
// showPassword state and all handlers. Render-props for the
// role-label / role-color / spec-label / status-badge bits avoid
// duplicating those tables here.

export interface DetailsStaffMember {
  id: string;
  login: string;
  password?: string;
  name: string;
  phone: string;
  role: 'admin' | 'manager' | 'department_head' | 'executor' | 'advertiser';
  specialization?: ExecutorSpecialization;
  status?: string;
  created_at: string;
  completed_count?: number;
  active_count?: number;
  avg_rating?: number;
}

export interface EditForm {
  name: string;
  phone: string;
  login: string;
  password: string;
  specialization: ExecutorSpecialization | '';
}

interface MemberDetailsModalProps {
  member: DetailsStaffMember;
  language: string;
  isEditing: boolean;
  isLoadingDetails: boolean;
  showPassword: boolean;
  editForm: EditForm;
  setEditForm: (f: EditForm) => void;
  copiedField: string | null;
  roleLabel: string;
  roleColorClass: string;
  specLabel: string | null;
  statusBadge: ReactNode;
  onClose: () => void;
  onToggleEditing: (editing: boolean) => void;
  onTogglePassword: () => void;
  onSave: () => void;
  onCopy: (value: string, field: string) => void;
}

export function MemberDetailsModal({
  member,
  language,
  isEditing,
  isLoadingDetails,
  showPassword,
  editForm,
  setEditForm,
  copiedField,
  roleLabel,
  roleColorClass,
  specLabel,
  statusBadge,
  onClose,
  onToggleEditing,
  onTogglePassword,
  onSave,
  onCopy,
}: MemberDetailsModalProps) {
  return (
    <div className="modal-backdrop items-end sm:items-center" onClick={onClose}>
      <div
        className="modal-content p-4 sm:p-6 w-full max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-2xl font-medium text-primary-700">
              {member.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h2 className="text-xl font-bold">{member.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColorClass}`}>{roleLabel}</span>
                {specLabel && <span className="text-sm text-gray-500">{specLabel}</span>}
              </div>
              {statusBadge}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats for executors */}
        {member.role === 'executor' && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-amber-600 mb-1">
                <Star className="w-4 h-4" />
                <span className="font-bold text-lg">{member.avg_rating || 0}</span>
              </div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Рейтинг' : 'Reyting'}</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                <Award className="w-4 h-4" />
                <span className="font-bold text-lg">{member.completed_count || 0}</span>
              </div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}</div>
            </div>
            <div className="bg-primary-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-primary-600 mb-1">
                <Clock className="w-4 h-4" />
                <span className="font-bold text-lg">{member.active_count || 0}</span>
              </div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
            </div>
          </div>
        )}

        {/* Info / Edit Form */}
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'ФИО' : 'F.I.O.'}
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Телефон' : 'Telefon'}
              </label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="input-field"
                maxLength={13}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Логин' : 'Login'}
              </label>
              <input
                type="text"
                value={editForm.login}
                onChange={(e) => setEditForm({ ...editForm, login: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Новый пароль' : 'Yangi parol'}
              </label>
              <input
                type="text"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="input-field"
                placeholder={
                  language === 'ru' ? 'Оставьте пустым, чтобы не менять' : "O'zgartirmaslik uchun bo'sh qoldiring"
                }
              />
            </div>
            {(member.role === 'executor' || member.role === 'department_head') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Специализация' : 'Mutaxassislik'}
                </label>
                <select
                  value={editForm.specialization}
                  onChange={(e) =>
                    setEditForm({ ...editForm, specialization: e.target.value as ExecutorSpecialization })
                  }
                  className="input-field"
                >
                  <option value="">{language === 'ru' ? 'Не указана' : "Ko'rsatilmagan"}</option>
                  <option value="plumber">{language === 'ru' ? 'Сантехник' : 'Santexnik'}</option>
                  <option value="electrician">{language === 'ru' ? 'Электрик' : 'Elektrik'}</option>
                  <option value="elevator">{language === 'ru' ? 'Лифтёр' : 'Liftchi'}</option>
                  <option value="intercom">{language === 'ru' ? 'Домофон' : 'Domofon'}</option>
                  <option value="cleaning">{language === 'ru' ? 'Уборщица' : 'Tozalovchi'}</option>
                  <option value="gardener">{language === 'ru' ? 'Садовник' : "Bog'bon"}</option>
                  <option value="security">{language === 'ru' ? 'Охранник' : 'Qorovul'}</option>
                  <option value="trash">{language === 'ru' ? 'Вывоз мусора' : 'Chiqindi tashish'}</option>
                  <option value="boiler">{language === 'ru' ? 'Котельщик' : 'Qozonxonachi'}</option>
                  <option value="ac">{language === 'ru' ? 'Кондиционерщик' : 'Konditsionerchi'}</option>
                  <option value="other">{language === 'ru' ? 'Другое' : 'Boshqa'}</option>
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Contact Info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">{language === 'ru' ? 'Телефон' : 'Telefon'}</span>
                </div>
                <span className="font-medium">{member.phone}</span>
              </div>
            </div>

            {/* Credentials */}
            <div className="bg-primary-50 rounded-xl p-4 space-y-3">
              <div className="text-sm font-medium text-primary-800 mb-2">
                {language === 'ru' ? 'Данные для входа' : "Kirish ma'lumotlari"}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{language === 'ru' ? 'Логин' : 'Login'}</span>
                <div className="flex items-center gap-2">
                  <code className="bg-white px-2 py-1 rounded text-sm font-mono">{member.login}</code>
                  <button
                    onClick={() => onCopy(member.login, 'login')}
                    className="p-1 hover:bg-primary-100 rounded"
                    title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                  >
                    {copiedField === 'login' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{language === 'ru' ? 'Пароль' : 'Parol'}</span>
                <div className="flex items-center gap-2">
                  {isLoadingDetails ? (
                    <span className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                    </span>
                  ) : member.password ? (
                    <>
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono">
                        {showPassword ? member.password : '••••••••'}
                      </code>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onTogglePassword();
                        }}
                        className="p-2 hover:bg-primary-100 active:bg-primary-200 rounded touch-manipulation z-10"
                        title={
                          showPassword
                            ? language === 'ru' ? 'Скрыть пароль' : 'Parolni yashirish'
                            : language === 'ru' ? 'Показать пароль' : "Parolni ko'rsatish"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        ) : (
                          <Eye className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => onCopy(member.password || '', 'password')}
                        className="p-1 hover:bg-primary-100 rounded"
                        title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                      >
                        {copiedField === 'password' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400 italic">
                      {language === 'ru' ? 'Задайте через "Редактировать"' : '"Tahrirlash" orqali belgilang'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Created date */}
            <div className="text-sm text-gray-500 text-center">
              {language === 'ru' ? 'Добавлен' : "Qo'shilgan"}:{' '}
              {new Date(member.created_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          {isEditing ? (
            <>
              <button onClick={() => onToggleEditing(false)} className="btn-secondary flex-1">
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button onClick={onSave} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" />
                {language === 'ru' ? 'Сохранить' : 'Saqlash'}
              </button>
            </>
          ) : (
            <button
              onClick={() => onToggleEditing(true)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              {language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
