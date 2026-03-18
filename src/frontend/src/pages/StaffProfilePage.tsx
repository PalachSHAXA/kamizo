import { useState, useMemo } from 'react';
import {
  Key, Phone, Save, Eye, EyeOff, Edit3,
  Shield, Loader2, X, Globe,
  User as UserIcon, Wrench, Briefcase, ShieldCheck, Radio, Store, Megaphone, Crown, CheckCircle
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { InstallAppSection } from '../components/InstallAppSection';

const ROLE_CONFIG: Record<string, { labelRu: string; labelUz: string; icon: any; color: string; bgColor: string }> = {
  executor: { labelRu: 'Исполнитель', labelUz: 'Ijrochi', icon: Wrench, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  security: { labelRu: 'Охранник', labelUz: 'Qo\'riqchi', icon: ShieldCheck, color: 'text-slate-600', bgColor: 'bg-slate-50' },
  dispatcher: { labelRu: 'Диспетчер', labelUz: 'Dispetcher', icon: Radio, color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  marketplace_manager: { labelRu: 'Менеджер магазина', labelUz: 'Do\'kon menejeri', icon: Store, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  advertiser: { labelRu: 'Рекламодатель', labelUz: 'Reklamachi', icon: Megaphone, color: 'text-pink-600', bgColor: 'bg-pink-50' },
  department_head: { labelRu: 'Глава отдела', labelUz: 'Bo\'lim boshlig\'i', icon: Crown, color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  admin: { labelRu: 'Администратор', labelUz: 'Administrator', icon: Shield, color: 'text-red-600', bgColor: 'bg-red-50' },
  manager: { labelRu: 'Менеджер', labelUz: 'Menejer', icon: Briefcase, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  director: { labelRu: 'Директор', labelUz: 'Direktor', icon: Crown, color: 'text-rose-600', bgColor: 'bg-rose-50' },
};

const SPECIALIZATION_LABELS: Record<string, { ru: string; uz: string }> = {
  plumber: { ru: 'Сантехник', uz: 'Santexnik' },
  electrician: { ru: 'Электрик', uz: 'Elektrik' },
  carpenter: { ru: 'Плотник', uz: 'Duradgor' },
  painter: { ru: 'Маляр', uz: 'Bo\'yoqchi' },
  cleaner: { ru: 'Уборщик', uz: 'Tozalovchi' },
  locksmith: { ru: 'Слесарь', uz: 'Chilangar' },
  hvac: { ru: 'Вентиляция/Кондиционер', uz: 'Shamollatish/Konditsioner' },
  elevator: { ru: 'Лифтёр', uz: 'Liftchi' },
  landscaper: { ru: 'Озеленение', uz: 'Ko\'kalamzorlashtirish' },
  general: { ru: 'Разнорабочий', uz: 'Turli ishchi' },
  delivery: { ru: 'Курьер', uz: 'Kuryer' },
  concierge: { ru: 'Консьерж', uz: 'Konsyerj' },
};

export function StaffProfilePage() {
  const { user, changePassword, updateProfile } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();

  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState(user?.phone || '');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);

  const t = useMemo(() => ({
    myProfile: language === 'ru' ? 'Мой профиль' : 'Mening profilim',
    personalInfo: language === 'ru' ? 'Личные данные' : 'Shaxsiy ma\'lumotlar',
    login: language === 'ru' ? 'Логин' : 'Login',
    cannotChange: language === 'ru' ? 'Нельзя изменить' : 'O\'zgartirib bo\'lmaydi',
    role: language === 'ru' ? 'Должность' : 'Lavozim',
    specialization: language === 'ru' ? 'Специализация' : 'Mutaxassislik',
    phone: language === 'ru' ? 'Телефон' : 'Telefon',
    notSpecified: language === 'ru' ? 'Не указан' : 'Ko\'rsatilmagan',
    languageTitle: language === 'ru' ? 'Язык интерфейса' : 'Interfeys tili',
    security: language === 'ru' ? 'Безопасность' : 'Xavfsizlik',
    changePassword: language === 'ru' ? 'Изменить пароль' : 'Parolni o\'zgartirish',
    currentPassword: language === 'ru' ? 'Текущий пароль' : 'Joriy parol',
    newPassword: language === 'ru' ? 'Новый пароль' : 'Yangi parol',
    confirmPassword: language === 'ru' ? 'Подтвердите пароль' : 'Parolni tasdiqlang',
    save: language === 'ru' ? 'Сохранить' : 'Saqlash',
    cancel: language === 'ru' ? 'Отмена' : 'Bekor qilish',
    phoneSaved: language === 'ru' ? 'Телефон сохранён' : 'Telefon saqlandi',
    passwordChanged: language === 'ru' ? 'Пароль успешно изменён' : 'Parol muvaffaqiyatli o\'zgartirildi',
    wrongPassword: language === 'ru' ? 'Неверный текущий пароль' : 'Joriy parol noto\'g\'ri',
    passwordsNotMatch: language === 'ru' ? 'Пароли не совпадают' : 'Parollar mos kelmaydi',
    passwordSameAsOld: language === 'ru' ? 'Новый пароль должен отличаться от текущего' : 'Yangi parol joriy paroldan farq qilishi kerak',
    enterCurrentPassword: language === 'ru' ? 'Введите текущий пароль' : 'Joriy parolni kiriting',
    passwordTooShort: language === 'ru' ? 'Пароль должен быть минимум 4 символа' : 'Parol kamida 4 ta belgidan iborat bo\'lishi kerak',
    passwordError: language === 'ru' ? 'Ошибка при смене пароля' : 'Parolni o\'zgartirishda xatolik',
  }), [language]);

  if (!user) return null;

  const roleConfig = ROLE_CONFIG[user.role] || { labelRu: user.role, labelUz: user.role, icon: UserIcon, color: 'text-gray-600', bgColor: 'bg-gray-50' };
  const RoleIcon = roleConfig.icon;
  const specLabel = user.specialization ? (SPECIALIZATION_LABELS[user.specialization]?.[language] || user.specialization) : null;

  const handleSavePhone = async () => {
    if (!newPhone.trim()) return;
    setPhoneLoading(true);
    try {
      const success = await updateProfile({ phone: newPhone.trim() });
      if (success) {
        setEditingPhone(false);
        setSuccessMessage(t.phoneSaved);
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch {
      // handled by store
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleSavePassword = async () => {
    setPasswordError('');
    if (!currentPassword.trim()) { setPasswordError(t.enterCurrentPassword); return; }
    if (newPassword.length < 4) { setPasswordError(t.passwordTooShort); return; }
    if (newPassword !== confirmPassword) { setPasswordError(t.passwordsNotMatch); return; }
    if (currentPassword === newPassword) { setPasswordError(t.passwordSameAsOld); return; }

    setPasswordLoading(true);
    try {
      const success = await changePassword(currentPassword, newPassword);
      if (success) {
        setEditingPassword(false);
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        setSuccessMessage(t.passwordChanged);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setPasswordError(t.wrongPassword);
      }
    } catch (error: unknown) {
      const msg = (error as Error)?.message || '';
      setPasswordError(msg.includes('incorrect') || msg.includes('неверный') ? t.wrongPassword : t.passwordError);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl mx-auto pb-24 md:pb-6 -mx-4 -mt-4 md:mx-auto md:mt-0">
      {/* User Card Header */}
      <div className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 opacity-[0.04]" style={{ background: 'radial-gradient(ellipse at top right, rgb(var(--brand-rgb)), transparent 70%)' }} />
        <div className="relative px-5 pb-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
          <div className="flex items-center gap-4">
            <div
              className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.75))' }}
            >
              <RoleIcon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{user.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`px-2.5 py-0.5 ${roleConfig.bgColor} ${roleConfig.color} rounded-full text-[11px] font-semibold`}>
                  {language === 'ru' ? roleConfig.labelRu : roleConfig.labelUz}
                </span>
                {specLabel && (
                  <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[11px] font-semibold">
                    {specLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mx-4 mt-3 p-3 bg-green-50 text-green-700 rounded-[14px] flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        {/* Personal Info */}
        <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary-500" />
              {t.personalInfo}
            </h2>
          </div>

          <div className="divide-y divide-gray-50">
            {/* Login */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 bg-primary-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                <Key className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-400 font-medium">{t.login}</div>
                <div className="font-mono font-bold text-[14px] text-gray-900">{user.login}</div>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t.cannotChange}</span>
            </div>

            {/* Role */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 ${roleConfig.bgColor} rounded-[10px] flex items-center justify-center flex-shrink-0`}>
                <RoleIcon className={`w-4 h-4 ${roleConfig.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-400 font-medium">{t.role}</div>
                <div className="font-bold text-[14px] text-gray-900">
                  {language === 'ru' ? roleConfig.labelRu : roleConfig.labelUz}
                </div>
              </div>
            </div>

            {/* Specialization */}
            {specLabel && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 bg-amber-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-400 font-medium">{t.specialization}</div>
                  <div className="font-bold text-[14px] text-gray-900">{specLabel}</div>
                </div>
              </div>
            )}

            {/* Phone */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 bg-primary-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-400 font-medium">{t.phone}</div>
                {!editingPhone ? (
                  <div className="font-medium text-[14px] text-gray-900">{user.phone || t.notSpecified}</div>
                ) : (
                  <input
                    type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full py-1 text-[14px] font-medium text-gray-900 border-b-2 border-primary-400 outline-none bg-transparent"
                    maxLength={13} autoFocus
                  />
                )}
              </div>
              {!editingPhone ? (
                <button onClick={() => { setNewPhone(user.phone || ''); setEditingPhone(true); }}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-gray-100 rounded-[10px] transition-colors touch-manipulation">
                  <Edit3 className="w-4 h-4 text-gray-400" />
                </button>
              ) : (
                <div className="flex gap-1">
                  <button onClick={handleSavePhone} disabled={phoneLoading}
                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-green-50 rounded-[10px] transition-colors disabled:opacity-50 touch-manipulation">
                    {phoneLoading ? <Loader2 className="w-4 h-4 text-green-600 animate-spin" /> : <Save className="w-4 h-4 text-green-600" />}
                  </button>
                  <button onClick={() => setEditingPhone(false)} disabled={phoneLoading}
                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-gray-100 rounded-[10px] transition-colors disabled:opacity-50 touch-manipulation">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Language Switcher */}
        <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary-500" />
              {t.languageTitle}
            </h2>
          </div>
          <div className="px-4 pb-4 flex gap-3">
            <button onClick={() => setLanguage('ru')}
              className={`flex-1 p-3 rounded-[14px] border-2 transition-all flex items-center gap-2.5 ${language === 'ru' ? 'border-primary-400 bg-primary-50' : 'border-gray-200 active:border-primary-300'}`}>
              <span className="text-xl">🇷🇺</span>
              <span className="font-medium text-sm">Русский</span>
            </button>
            <button onClick={() => setLanguage('uz')}
              className={`flex-1 p-3 rounded-[14px] border-2 transition-all flex items-center gap-2.5 ${language === 'uz' ? 'border-primary-400 bg-primary-50' : 'border-gray-200 active:border-primary-300'}`}>
              <span className="text-xl">🇺🇿</span>
              <span className="font-medium text-sm">O'zbekcha</span>
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary-500" />
              {t.security}
            </h2>
          </div>
          <div className="px-4 pb-4">
            {!editingPassword ? (
              <button onClick={() => setEditingPassword(true)}
                className="w-full py-3 px-4 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-[14px] text-left font-medium text-[14px] text-gray-700 transition-colors touch-manipulation">
                {t.changePassword}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full py-2.5 px-3 text-[14px] rounded-[10px] border border-gray-200 outline-none focus:border-primary-400 pr-10"
                    placeholder={t.currentPassword} aria-label={t.currentPassword} />
                  <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <input type={showNewPassword ? 'text' : 'password'} value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full py-2.5 px-3 text-[14px] rounded-[10px] border border-gray-200 outline-none focus:border-primary-400 pr-10"
                    placeholder={t.newPassword} aria-label={t.newPassword} />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <input type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full py-2.5 px-3 text-[14px] rounded-[10px] border border-gray-200 outline-none focus:border-primary-400"
                  placeholder={t.confirmPassword} aria-label={t.confirmPassword} />

                {passwordError && (
                  <div className="p-2.5 bg-red-50 text-red-600 rounded-[10px] text-[13px]">{passwordError}</div>
                )}

                <div className="flex gap-2">
                  <button onClick={handleSavePassword} disabled={passwordLoading}
                    className="flex-1 py-2.5 bg-primary-500 text-white rounded-[10px] font-medium text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:bg-primary-600">
                    {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.save}
                  </button>
                  <button onClick={() => { setEditingPassword(false); setPasswordError(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                    className="py-2.5 px-4 bg-gray-100 text-gray-600 rounded-[10px] font-medium text-[14px] touch-manipulation active:bg-gray-200">
                    {t.cancel}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Director highlight card */}
        {user.role === 'director' && (
          <div className="rounded-[18px] overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
            style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.75))' }}>
            <div className="px-4 pt-4 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-[14px] bg-white/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-[15px]">
                    {language === 'ru' ? 'Панель директора' : 'Direktor paneli'}
                  </p>
                  <p className="text-white/70 text-[12px]">
                    {language === 'ru' ? 'Полный доступ к аналитике и управлению' : 'Tahlil va boshqaruvga to\'liq kirish'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { labelRu: 'Отчёты', labelUz: 'Hisobotlar', icon: '📊' },
                  { labelRu: 'Сотрудники', labelUz: 'Xodimlar', icon: '👥' },
                  { labelRu: 'Здания', labelUz: 'Binolar', icon: '🏢' },
                ].map((item) => (
                  <div key={item.labelRu} className="bg-white/15 rounded-[12px] px-3 py-2.5 text-center">
                    <div className="text-xl mb-1">{item.icon}</div>
                    <p className="text-white text-[11px] font-semibold">
                      {language === 'ru' ? item.labelRu : item.labelUz}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Install App Section */}
        <InstallAppSection language={language} roleContext={user.role} />
      </div>
    </div>
  );
}
