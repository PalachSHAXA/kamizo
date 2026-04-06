import { useState } from 'react';
import { Building2, Users, CheckCircle, ChevronRight, Loader2, Copy, Check } from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';
import { settingsApi } from '../services/api/settings';
import { buildingsApi } from '../services/api/buildings';
import { authApi } from '../services/api/auth';
import { useNavigate } from 'react-router-dom';

interface OnboardingWizardProps {
  userId: string;
  onComplete: () => void;
}

const TOTAL_STEPS = 4;

export function OnboardingWizard({ userId, onComplete }: OnboardingWizardProps) {
  const { language } = useLanguageStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Step 1: company info
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');

  // Step 2: first building
  const [buildingName, setBuildingName] = useState('');
  const [buildingAddress, setBuildingAddress] = useState('');
  const [buildingEntrances, setBuildingEntrances] = useState('');

  // Step 3: manager
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerLogin, setManagerLogin] = useState('');
  const [managerPassword, setManagerPassword] = useState('');

  // Step 4: done
  const [createdCredentials, setCreatedCredentials] = useState<{ login: string; password: string } | null>(null);

  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  const markDone = () => {
    localStorage.setItem(`kamizo_ob_done_${userId}`, '1');
    settingsApi.update('onboarding_completed', true).catch(() => {});
  };

  const handleStep1 = async () => {
    if (!companyName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await settingsApi.updateMany({
        companyName: companyName.trim(),
        companyAddress: companyAddress.trim(),
        companyPhone: companyPhone.trim(),
      });
      setStep(2);
    } catch {
      setError(t('Ошибка сохранения. Попробуйте ещё раз.', 'Saqlashda xato. Qayta urinib ko\'ring.'));
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (!buildingName.trim() || !buildingAddress.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await buildingsApi.create({
        name: buildingName.trim(),
        address: buildingAddress.trim(),
        entrances: buildingEntrances ? parseInt(buildingEntrances) : undefined,
      });
      setStep(3);
    } catch {
      setError(t('Ошибка создания здания. Попробуйте ещё раз.', 'Binoni yaratishda xato. Qayta urinib ko\'ring.'));
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async () => {
    if (!managerName.trim() || !managerLogin.trim() || !managerPassword.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.register({
        login: managerLogin.trim(),
        password: managerPassword.trim(),
        name: managerName.trim(),
        role: 'manager',
        phone: managerPhone.trim() || undefined,
      });
      markDone();
      setCreatedCredentials({ login: managerLogin.trim(), password: managerPassword.trim() });
      setStep(4);
    } catch (e: unknown) {
      setError((e as Error).message || t('Ошибка создания управляющего.', 'Menedjerni yaratishda xato.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkipAll = () => {
    markDone();
    onComplete();
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `${t('Логин', 'Login')}: ${createdCredentials.login}\n${t('Пароль', 'Parol')}: ${createdCredentials.password}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const progressPercent = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  const inputCls = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[12px] text-[14px] focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 transition-colors';
  const labelCls = 'text-[12px] font-semibold text-gray-600 block mb-1';

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary-50 via-white to-blue-50 z-[300] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 my-4 max-h-[90dvh] overflow-y-auto flex flex-col">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-gray-400 font-medium">
              {t(`Шаг ${step} из ${TOTAL_STEPS}`, `${step}/${TOTAL_STEPS} qadam`)}
            </span>
            {step < 4 && (
              <button
                onClick={handleSkipAll}
                className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors active:scale-95"
              >
                {t('Пропустить всё', 'Barchasini o\'tkazib yuborish')}
              </button>
            )}
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-600">
            {error}
          </div>
        )}

        {/* ── Step 1: Company info ── */}
        {step === 1 && (
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-7 h-7 text-primary-500" />
              </div>
              <h2 className="text-[20px] font-bold text-gray-900 mb-1">
                {t('Добро пожаловать в Камизо!', 'Kamizoga xush kelibsiz!')}
              </h2>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                {t('Давайте настроим вашу управляющую компанию', 'Keling, boshqarish kompaniyangizni sozlaylik')}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t('Название УК', 'UK nomi')} *</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder={t('ООО «Управляющая компания»', 'MChJ «Boshqarish kompaniyasi»')}
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>{t('Адрес', 'Manzil')}</label>
                <input
                  type="text"
                  value={companyAddress}
                  onChange={e => setCompanyAddress(e.target.value)}
                  placeholder={t('г. Ташкент, ул. Примерная, 1', 'Toshkent sh., Namunali ko\'ch., 1')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t('Контактный телефон', 'Aloqa telefoni')}</label>
                <input
                  type="tel"
                  value={companyPhone}
                  onChange={e => setCompanyPhone(e.target.value)}
                  placeholder="+998 90 000 00 00"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white pt-3 -mx-6 px-6 -mb-6 pb-6">
              <button
                onClick={handleStep1}
                disabled={!companyName.trim() || loading}
                className="w-full py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.97] transition-all touch-manipulation whitespace-nowrap"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {t('Далее', 'Keyingisi')}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: First building ── */}
        {step === 2 && (
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-7 h-7 text-blue-500" />
              </div>
              <h2 className="text-[20px] font-bold text-gray-900 mb-1">
                {t('Добавьте первый жилой комплекс', 'Birinchi turar-joy majmuasini qo\'shing')}
              </h2>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                {t('Можно добавить несколько зданий позже', 'Keyinchalik ko\'proq bino qo\'shishingiz mumkin')}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t('Название здания', 'Bino nomi')} *</label>
                <input
                  type="text"
                  value={buildingName}
                  onChange={e => setBuildingName(e.target.value)}
                  placeholder={t('ЖК «Новый дом»', 'TRJ «Yangi uy»')}
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>{t('Адрес здания', 'Bino manzili')} *</label>
                <input
                  type="text"
                  value={buildingAddress}
                  onChange={e => setBuildingAddress(e.target.value)}
                  placeholder={t('ул. Примерная, 1', 'Namunali ko\'ch., 1')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t('Количество подъездов', 'Kirish joylari soni')}</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={buildingEntrances}
                  onChange={e => setBuildingEntrances(e.target.value)}
                  placeholder="4"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white pt-3 -mx-6 px-6 -mb-6 pb-6">
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 bg-gray-100 text-gray-600 font-semibold rounded-[14px] active:scale-[0.97] transition-all touch-manipulation whitespace-nowrap truncate"
                >
                  {t('Пропустить', 'O\'tkazib yuborish')}
                </button>
                <button
                  onClick={handleStep2}
                  disabled={!buildingName.trim() || !buildingAddress.trim() || loading}
                  className="flex-1 py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.97] transition-all touch-manipulation whitespace-nowrap"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  {t('Далее', 'Keyingisi')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Create manager ── */}
        {step === 3 && (
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                <Users className="w-7 h-7 text-green-500" />
              </div>
              <h2 className="text-[20px] font-bold text-gray-900 mb-1">
                {t('Создайте управляющего', 'Menedjerni yarating')}
              </h2>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                {t(
                  'Управляющий будет обрабатывать заявки жителей и управлять исполнителями',
                  'Menejer aholidan arizalarni ko\'rib chiqadi va ijrochilarni boshqaradi'
                )}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t('ФИО', 'Ism-familiya')} *</label>
                <input
                  type="text"
                  value={managerName}
                  onChange={e => setManagerName(e.target.value)}
                  placeholder={t('Иванов Иван Иванович', 'Ivanov Ivan Ivanovich')}
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>{t('Телефон', 'Telefon')}</label>
                <input
                  type="tel"
                  value={managerPhone}
                  onChange={e => setManagerPhone(e.target.value)}
                  placeholder="+998 90 000 00 00"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t('Логин', 'Login')} *</label>
                <input
                  type="text"
                  value={managerLogin}
                  onChange={e => setManagerLogin(e.target.value)}
                  placeholder="manager_ivanov"
                  className={inputCls}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelCls}>{t('Пароль', 'Parol')} *</label>
                <input
                  type="password"
                  value={managerPassword}
                  onChange={e => setManagerPassword(e.target.value)}
                  placeholder={t('Минимум 6 символов', 'Kamida 6 ta belgi')}
                  className={inputCls}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white pt-3 -mx-6 px-6 -mb-6 pb-6">
              <button
                onClick={handleStep3}
                disabled={!managerName.trim() || !managerLogin.trim() || !managerPassword.trim() || loading}
                className="w-full py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.97] transition-all touch-manipulation whitespace-nowrap"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('Создать и завершить', 'Yaratish va tugatish')}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-green-500" />
            </div>
            <h2 className="text-[22px] font-bold text-gray-900 mb-2">
              {t('Всё готово! 🎉', 'Hammasi tayyor! 🎉')}
            </h2>
            <p className="text-[14px] text-gray-500 mb-5 leading-relaxed">
              {t('Ваша УК настроена. Передайте логин и пароль управляющему.', 'UK sozlandi. Login va parolni menejerga yuboring.')}
            </p>

            {createdCredentials && (
              <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl text-left relative">
                <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-2">
                  {t('Данные управляющего', 'Menejer ma\'lumotlari')}
                </p>
                <p className="text-[14px] text-blue-900 font-medium">
                  {t('Логин', 'Login')}: <span className="font-bold">{createdCredentials.login}</span>
                </p>
                <p className="text-[14px] text-blue-900 font-medium">
                  {t('Пароль', 'Parol')}: <span className="font-bold">{createdCredentials.password}</span>
                </p>
                <button
                  onClick={handleCopyCredentials}
                  className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors active:scale-95"
                  title={t('Скопировать', 'Nusxalash')}
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-blue-600" />}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={onComplete}
                className="w-full py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] active:scale-[0.97] transition-all touch-manipulation"
              >
                {t('Перейти в дашборд', 'Dashboardga o\'tish')}
              </button>
              <button
                onClick={() => { onComplete(); setTimeout(() => navigate('/buildings'), 100); }}
                className="w-full py-3 text-primary-500 font-medium text-[14px] active:scale-[0.97] transition-all touch-manipulation"
              >
                {t('Добавить ещё здание', 'Yana bino qo\'shish')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
