import { Loader2, Plus, RefreshCw, Copy, Check } from 'lucide-react';
import type { ExecutorSpecialization } from '../../../types';
import { Modal } from '../../../components/ui/Modal';

// Sprint 18: extracted from TeamPage. The add-new-staff dialog —
// role (executor/department_head/manager), specialization, name,
// phone, login, password. Login auto-fills from name; password has
// a regenerate button + copy. State stays at TeamPage; this is the
// presentational shell.

// Bug 6 (2026-06-18) — dispatcher + security added to the role union.
// The backend register handler (cloudflare/src/routes/users/auth.ts)
// already accepts these from a director / admin / manager caller; the
// only thing blocking them in production was that the UI dropdown
// below didn't list them. tenant_id stays JWT-derived server-side,
// so cross-tenant attempts via this form 403 + audit-log just like
// every other tenant-scoped write.
export interface AddStaffForm {
  role: 'manager' | 'department_head' | 'executor' | 'dispatcher' | 'security';
  managerType: 'manager' | 'advertiser';
  specialization: ExecutorSpecialization | '';
  name: string;
  phone: string;
  login: string;
  password: string;
}

interface AddStaffModalProps {
  language: string;
  hasAdvertiserFeature: boolean;
  form: AddStaffForm;
  setForm: (form: AddStaffForm) => void;
  error: string | null;
  loading: boolean;
  copiedField: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onCopy: (value: string, field: string) => void;
  generateLogin: (name: string) => string;
  generatePassword: () => string;
}

export function AddStaffModal({
  language,
  hasAdvertiserFeature,
  form,
  setForm,
  error,
  loading,
  copiedField,
  onClose,
  onSubmit,
  onCopy,
  generateLogin,
  generatePassword,
}: AddStaffModalProps) {
  const title = language === 'ru' ? 'Добавить сотрудника' : "Xodim qo'shish";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      panelClassName="max-h-[100dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col"
    >
      {error && <div className="mx-4 mt-4 sm:mx-6 bg-red-50 text-red-600 p-3 rounded-xl text-sm">{error}</div>}

        <div className="space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0 px-4 py-4 sm:px-6">
          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Роль' : 'Rol'} *
            </label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as 'manager' | 'department_head' | 'executor' | 'dispatcher' | 'security',
                  managerType: 'manager',
                  // Dispatcher + security are role-only — no specialization.
                  specialization: '' as ExecutorSpecialization,
                })
              }
              className="input-field"
            >
              {/* Ordered roughly by management rank: highest first */}
              <option value="manager">{language === 'ru' ? 'Менеджер' : 'Menejer'}</option>
              <option value="dispatcher">{language === 'ru' ? 'Диспетчер' : 'Dispetcher'}</option>
              <option value="department_head">
                {language === 'ru' ? 'Глава отдела' : "Bo'lim boshlig'i"}
              </option>
              <option value="executor">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</option>
              <option value="security">{language === 'ru' ? 'Охранник' : 'Qorovul'}</option>
            </select>
          </div>

          {/* Specialization — executor + department head */}
          {(form.role === 'executor' || form.role === 'department_head') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Специализация' : 'Mutaxassislik'} *
              </label>
              <select
                value={form.specialization}
                onChange={(e) =>
                  setForm({ ...form, specialization: e.target.value as ExecutorSpecialization })
                }
                className="input-field"
              >
                <option value="">{language === 'ru' ? 'Выберите' : 'Tanlang'}</option>
                <option value="plumber">{language === 'ru' ? 'Сантехник' : 'Santexnik'}</option>
                <option value="electrician">{language === 'ru' ? 'Электрик' : 'Elektrik'}</option>
                <option value="elevator">{language === 'ru' ? 'Лифтёр' : 'Liftchi'}</option>
                <option value="intercom">{language === 'ru' ? 'Домофон' : 'Domofon'}</option>
                <option value="cleaning">{language === 'ru' ? 'Уборщица' : 'Tozalovchi'}</option>
                <option value="security">{language === 'ru' ? 'Охранник' : 'Qorovul'}</option>
                <option value="trash">{language === 'ru' ? 'Вывоз мусора' : 'Chiqindi tashish'}</option>
                <option value="boiler">{language === 'ru' ? 'Котельщик' : 'Qozonxonachi'}</option>
                <option value="ac">{language === 'ru' ? 'Кондиционерщик' : 'Konditsionerchi'}</option>
                <option value="courier">{language === 'ru' ? 'Курьер' : 'Kuryer'}</option>
                <option value="other">{language === 'ru' ? 'Другое' : 'Boshqa'}</option>
              </select>
            </div>
          )}

          {/* Manager type (only if advertiser feature is on) */}
          {form.role === 'manager' && hasAdvertiserFeature && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Тип' : 'Turi'}
              </label>
              <select
                value={form.managerType}
                onChange={(e) =>
                  setForm({ ...form, managerType: e.target.value as 'manager' | 'advertiser' })
                }
                className="input-field"
              >
                <option value="manager">{language === 'ru' ? 'Менеджер' : 'Menejer'}</option>
                <option value="advertiser">{language === 'ru' ? 'Реклама' : 'Reklama'}</option>
              </select>
            </div>
          )}

          {/* Full name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'ФИО' : 'F.I.O.'} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                const login = generateLogin(name);
                setForm({ ...form, name, login });
              }}
              className="input-field"
              placeholder={language === 'ru' ? 'Фамилия Имя Отчество' : 'Familiya Ism Sharif'}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Телефон' : 'Telefon'}
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input-field"
              placeholder="+998 XX XXX XX XX"
              maxLength={13}
            />
          </div>

          {/* Login */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Логин' : 'Login'} *
            </label>
            <input
              type="text"
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
              className="input-field"
              placeholder="ivanov.ii"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Пароль' : 'Parol'} *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field flex-1 min-w-0 font-mono tracking-wide"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, password: generatePassword() })}
                 className="btn-secondary px-3 flex-shrink-0"
                  title={language === 'ru' ? 'Сгенерировать пароль' : 'Parol yaratish'}
                  aria-label={language === 'ru' ? 'Сгенерировать пароль' : 'Parol yaratish'}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onCopy(form.password, 'addPassword')}
                 className="btn-secondary px-3 flex-shrink-0"
                  title={language === 'ru' ? 'Копировать пароль' : 'Parolni nusxalash'}
                  aria-label={language === 'ru' ? 'Копировать пароль' : 'Parolni nusxalash'}
              >
                {copiedField === 'addPassword' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div
          className="flex gap-3 shrink-0 border-t border-gray-100 px-4 pt-3 sm:px-6 sm:pt-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button onClick={onClose} className="btn-secondary flex-1" disabled={loading}>
            {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
          </button>
          <button
            onClick={onSubmit}
            disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {language === 'ru' ? 'Добавить' : "Qo'shish"}
          </button>
        </div>
    </Modal>
  );
}
