import { type ReactNode } from 'react';
import {
  Star, Award, Clock, Phone, Loader2, Check, Copy, Save, Edit3, KeyRound,
} from 'lucide-react';
import type { ExecutorSpecialization } from '../../../types';
import type { TeamRole } from '../../../services/api/users';
import { Modal } from '../../../components/ui/Modal';

// Sprint 19: extracted from TeamPage. Staff member details view with
// inline edit form. Stays presentational — parent owns the
// selectedMember + editForm + isEditing state and all handlers. Render-props for the
// role-label / role-color / spec-label / status-badge bits avoid
// duplicating those tables here.

export interface DetailsStaffMember {
  id: string;
  login: string;
  name: string;
  phone: string | null;
  role: TeamRole;
  specialization?: ExecutorSpecialization | null;
  status?: string | null;
  created_at: string;
  completed_count?: number;
  active_count?: number;
  avg_rating?: number;
}

export interface EditForm {
  name: string;
  phone: string;
  login: string;
  specialization: ExecutorSpecialization | '';
}

interface MemberDetailsModalProps {
  member: DetailsStaffMember;
  language: string;
  isEditing: boolean;
  editForm: EditForm;
  setEditForm: (f: EditForm) => void;
  copiedField: string | null;
  roleLabel: string;
  roleColorClass: string;
  specLabel: string | null;
  statusBadge: ReactNode;
  onClose: () => void;
  onToggleEditing: (editing: boolean) => void;
  onSave: () => void;
  onCopy: (value: string, field: string) => void;
  onResetPassword: (trigger: HTMLButtonElement) => void;
  isResettingPassword: boolean;
  canResetPassword: boolean;
  canEdit?: boolean;
}

export function MemberDetailsModal({
  member,
  language,
  isEditing,
  editForm,
  setEditForm,
  copiedField,
  roleLabel,
  roleColorClass,
  specLabel,
  statusBadge,
  onClose,
  onToggleEditing,
  onSave,
  onCopy,
  onResetPassword,
  isResettingPassword,
  canResetPassword,
  canEdit = true,
}: MemberDetailsModalProps) {
  const title = (
    <div className="flex items-center gap-3 min-w-0">
      <div aria-hidden="true" className="w-12 h-12 sm:w-14 sm:h-14 bg-primary-100 rounded-full flex items-center justify-center text-lg sm:text-xl font-medium text-primary-700 shrink-0">
        {member.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
      </div>
      <div className="min-w-0">
        <span className="block truncate">{member.name}</span>
        <div aria-hidden="true" className="flex items-center gap-2 mt-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColorClass}`}>{roleLabel}</span>
          {specLabel && <span className="text-sm font-normal text-gray-500 truncate">{specLabel}</span>}
        </div>
        {statusBadge}
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      ariaLabel={member.name}
      size="lg"
      panelClassName="max-h-[100dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col"
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">

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
                <span className="font-medium">
                  {member.phone || (language === 'ru' ? 'Не указан' : "Ko'rsatilmagan")}
                </span>
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
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-primary-100 rounded-lg"
                    title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                    aria-label={language === 'ru' ? 'Копировать логин' : 'Loginni nusxalash'}
                  >
                    {copiedField === 'login' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
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

      </div>

        {/* Actions */}
        <div
          className="flex gap-3 shrink-0 border-t border-gray-100 px-4 pt-3 sm:px-6 sm:pt-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
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
            <>
              {canResetPassword && (
                <button
                  onClick={(event) => onResetPassword(event.currentTarget)}
                  disabled={isResettingPassword}
                  className="flex-1 min-h-[44px] rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-700 hover:bg-red-100 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isResettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {isResettingPassword
                    ? language === 'ru' ? 'Сброс...' : 'Tiklanmoqda...'
                    : language === 'ru' ? 'Сбросить пароль' : 'Parolni tiklash'}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => onToggleEditing(true)}
                  className={`btn-primary flex items-center justify-center gap-2 ${canResetPassword ? 'flex-1' : 'w-full'}`}
                >
                  <Edit3 className="w-4 h-4" />
                  {language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                </button>
              )}
            </>
          )}
        </div>
    </Modal>
  );
}
