import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, X, FileText, Check, Users, UserCog, Wrench, ShieldCheck, Crown, Briefcase, Truck, Store, Building2, Home } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore, type Language } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';
import { AppLogo } from '../components/common/AppLogo';

// Demo account definitions (without passwords — passwords filled at click time)
type DemoAccount = { login: string; role: string; labelRu: string; labelUz: string; icon: any; color: string };

const DEMO_ACCOUNTS: DemoAccount[] = [
  { login: 'director', role: 'director', labelRu: 'Директор', labelUz: 'Direktor', icon: Briefcase, color: 'bg-rose-600' },
  { login: 'manager', role: 'manager', labelRu: 'Управляющий', labelUz: 'Boshqaruvchi', icon: UserCog, color: 'bg-blue-500' },
  { login: 'department_head', role: 'department_head', labelRu: 'Глава отдела', labelUz: 'Bo\'lim boshlig\'i', icon: Crown, color: 'bg-indigo-500' },
  { login: 'resident', role: 'resident', labelRu: 'Житель', labelUz: 'Aholi', icon: Users, color: 'bg-green-500' },
  { login: 'executor', role: 'executor', labelRu: 'Исполнитель', labelUz: 'Ijrochi', icon: Wrench, color: 'bg-amber-500' },
  { login: 'dostavka', role: 'executor', labelRu: 'Курьер', labelUz: 'Kuryer', icon: Truck, color: 'bg-orange-500' },
  { login: 'security', role: 'security', labelRu: 'Охранник', labelUz: 'Qo\'riqchi', icon: ShieldCheck, color: 'bg-slate-500' },
];

// Kamizo Demo tenant accounts (shown on kamizo-demo subdomain)
const KAMIZO_DEMO_ACCOUNTS: DemoAccount[] = [
  { login: 'demo-director', role: 'director', labelRu: 'Директор', labelUz: 'Direktor', icon: Briefcase, color: 'bg-orange-600' },
  { login: 'demo-manager', role: 'manager', labelRu: 'Управляющий', labelUz: 'Boshqaruvchi', icon: UserCog, color: 'bg-orange-500' },
  { login: 'demo-admin', role: 'admin', labelRu: 'Администратор', labelUz: 'Administrator', icon: Crown, color: 'bg-orange-800' },
  { login: 'demo-dept-head', role: 'department_head', labelRu: 'Глава отдела', labelUz: 'Bo\'lim boshlig\'i', icon: Building2, color: 'bg-orange-700' },
  { login: 'demo-dispatcher', role: 'dispatcher', labelRu: 'Диспетчер', labelUz: 'Dispetcher', icon: Crown, color: 'bg-amber-600' },
  { login: 'demo-shop', role: 'marketplace_manager', labelRu: 'Менеджер магазина', labelUz: 'Do\'kon menejeri', icon: Store, color: 'bg-amber-700' },
  { login: 'demo-resident1', role: 'resident', labelRu: 'Житель (Азиза)', labelUz: 'Aholi (Aziza)', icon: Users, color: 'bg-amber-500' },
  { login: 'demo-resident2', role: 'resident', labelRu: 'Житель (Фарход)', labelUz: 'Aholi (Farhod)', icon: Users, color: 'bg-amber-400' },
  { login: 'demo-resident3', role: 'resident', labelRu: 'Житель (Малика)', labelUz: 'Aholi (Malika)', icon: Users, color: 'bg-yellow-500' },
  { login: 'demo-executor', role: 'executor', labelRu: 'Сантехник', labelUz: 'Santexnik', icon: Wrench, color: 'bg-orange-400' },
  { login: 'demo-electrician', role: 'executor', labelRu: 'Электрик', labelUz: 'Elektrik', icon: Wrench, color: 'bg-yellow-600' },
  { login: 'demo-security', role: 'security', labelRu: 'Охранник', labelUz: 'Qo\'riqchi', icon: ShieldCheck, color: 'bg-orange-700' },
  { login: 'demo-tenant', role: 'tenant', labelRu: 'Арендатор', labelUz: 'Ijarachi', icon: Home, color: 'bg-yellow-700' },
];

// Convert hex color to rgba string
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function LoginPage() {
  const { login, isLoading: authLoading, error: authError } = useAuthStore();
  const { language, setLanguage, t } = useLanguageStore();
  const { config: tenantConfig, isConfigFetched } = useTenantStore();
  const tenant = tenantConfig?.tenant;

  // Tenant brand colors
  const brandColor = tenant?.color || '';
  const brandColor2 = tenant?.color_secondary || '';

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [canAcceptOffer, setCanAcceptOffer] = useState(false);
  const offerScrollRef = useRef<HTMLDivElement>(null);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ru', label: 'RU', flag: '🇷🇺' },
    { code: 'uz', label: 'UZ', flag: '🇺🇿' },
  ];

  // Check if user scrolled to bottom of offer
  const handleOfferScroll = () => {
    if (offerScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = offerScrollRef.current;
      // Allow acceptance when scrolled to within 50px of bottom
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        setCanAcceptOffer(true);
      }
    }
  };

  // Reset scroll check when modal opens
  useEffect(() => {
    if (showOfferModal) {
      setCanAcceptOffer(false);
      // Check initial state in case content is short
      setTimeout(() => {
        if (offerScrollRef.current) {
          const { scrollHeight, clientHeight } = offerScrollRef.current;
          if (clientHeight >= scrollHeight) {
            setCanAcceptOffer(true);
          }
        }
      }, 100);
    }
  }, [showOfferModal]);

  const handleAcceptOffer = () => {
    setAgreedToTerms(true);
    setShowOfferModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreedToTerms) {
      setError(language === 'ru' ? 'Необходимо принять условия публичной оферты' : 'Ommaviy oferta shartlarini qabul qilish kerak');
      return;
    }

    try {
      const success = await login(loginValue, password);
      if (!success) {
        setError(language === 'ru' ? 'Неверный логин или пароль' : 'Login yoki parol noto\'g\'ri');
      }
      // No need to navigate - App component will re-render with Layout when user is set
    } catch {
      setError(language === 'ru' ? 'Ошибка при входе' : 'Kirishda xatolik');
    }
  };

  const displayError = error || authError;

  // Show blank screen while tenant config is loading to prevent flash of wrong layout
  if (!isConfigFetched) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center px-4 py-8 sm:p-4 relative overflow-hidden bg-gradient-to-br from-white via-orange-50/30 to-orange-50/50">
      {/* Decorative elements */}
      <div
        className={`absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl ${!tenant ? 'bg-primary-200/20' : ''}`}
        style={tenant ? { backgroundColor: hexToRgba(brandColor, 0.15) } : undefined}
      />
      <div
        className={`absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl ${!tenant ? 'bg-primary-100/30' : ''}`}
        style={tenant ? { backgroundColor: hexToRgba(brandColor2 || brandColor, 0.2) } : undefined}
      />

      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6 sm:p-8 md:p-10 w-full max-w-[400px] relative z-10">
        {/* Logo + Language switcher row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            {tenant ? (
              <>
                {tenant.logo ? (
                  <img src={tenant.logo} alt={tenant.name} className="w-10 h-10 flex-shrink-0 rounded-xl object-cover" />
                ) : (
                  <div
                    className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-base"
                    style={{ background: `linear-gradient(135deg, ${tenant.color}, ${tenant.color_secondary})` }}
                  >
                    {tenant.name[0]}
                  </div>
                )}
                <div>
                  <h2 className="text-[15px] font-bold leading-tight" style={{ color: '#1a1a1a' }}>{tenant.name}</h2>
                  <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: tenant.color }}>{tenant.is_demo ? 'DEMO' : (tenant.slug?.toUpperCase() || '')}</p>
                </div>
              </>
            ) : (
              <>
                <AppLogo size="md" forceDefault />
                <div>
                  <h1 className="text-[15px] font-bold text-gray-900 leading-tight">Kamizo</h1>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary-500 mt-0.5">CRM</p>
                </div>
              </>
            )}
          </div>

          {/* Language switcher */}
          <div className="flex items-center rounded-full p-0.5 bg-gray-50">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-sm font-semibold transition-all touch-manipulation ${
                  language === lang.code
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={language === lang.code ? { backgroundColor: tenant ? brandColor : '#f97316' } : undefined}
              >
                <span className="text-[12px]">{lang.flag}</span>
                <span className="text-[12px]">{lang.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Welcome text */}
        <div className="mb-5">
          <h2 className="text-[22px] font-extrabold text-gray-900 leading-tight">
            {language === 'ru' ? 'Добро пожаловать' : 'Xush kelibsiz'}
          </h2>
          <p className="text-gray-400 text-[13px] mt-1">
            {language === 'ru' ? 'Войдите в свой аккаунт' : 'Hisobingizga kiring'}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[1px] text-gray-800 mb-1.5">{t('auth.login')}</label>
            <input
              type="text"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              placeholder={language === 'ru' ? 'Введите логин' : 'Login kiriting'}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[1px] text-gray-800 mb-1.5">{t('auth.password')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={language === 'ru' ? 'Введите пароль' : 'Parol kiriting'}
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                required
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowPassword(!showPassword);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 active:text-gray-800 touch-manipulation p-1.5 z-10"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          {displayError && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {displayError}
            </div>
          )}

          {/* User Agreement Checkbox */}
          <div
            className="flex items-start gap-2.5 pt-1 cursor-pointer"
            onClick={() => {
              if (!agreedToTerms) {
                setShowOfferModal(true);
              } else {
                setAgreedToTerms(false);
              }
            }}
          >
            <div
              className={`flex-shrink-0 rounded border-[1.5px] flex items-center justify-center transition-all ${
                agreedToTerms
                  ? (tenant ? 'border-transparent' : 'bg-primary-500 border-primary-500')
                  : 'border-gray-300 bg-white'
              }`}
              style={{
                width: 18,
                height: 18,
                minWidth: 18,
                minHeight: 18,
                maxWidth: 18,
                maxHeight: 18,
                marginTop: 2,
                ...(agreedToTerms && tenant ? { backgroundColor: brandColor, borderColor: brandColor } : {}),
              }}
            >
              {agreedToTerms && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </div>
            <span className="text-[12px] text-gray-500 leading-relaxed">
              {language === 'ru' ? 'Я согласен с условиями' : 'Men'}{' '}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowOfferModal(true); }}
                className="underline font-medium touch-manipulation"
                style={{ color: tenant ? brandColor : 'var(--color-primary-600)' }}
              >
                {language === 'ru' ? 'публичной оферты' : 'ommaviy oferta'}
              </button>
              {language === 'uz' ? ' shartlariga roziman' : ''}
            </span>
          </div>

          <button
            type="submit"
            disabled={authLoading || !agreedToTerms}
            className={`w-full text-center py-3.5 min-h-[48px] text-[15px] font-semibold rounded-xl transition-all active:scale-[0.98] touch-manipulation ${
              !agreedToTerms
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : tenant
                  ? 'text-white shadow-lg'
                  : 'bg-primary-500 text-white shadow-lg shadow-primary-200/50 hover:bg-primary-600'
            }`}
            style={agreedToTerms && tenant ? { background: `linear-gradient(135deg, ${brandColor}, ${brandColor2 || brandColor})`, boxShadow: `0 8px 24px ${hexToRgba(brandColor, 0.35)}` } : undefined}
          >
            {authLoading ? (language === 'ru' ? 'Вход...' : 'Kirish...') : (language === 'ru' ? 'Войти' : 'Kirish')}
          </button>
        </form>

        {/* Footer text */}
        <p className="text-center text-[11px] text-gray-300 mt-4">
          {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'} · Kamizo CRM
        </p>

        {/* Demo Accounts Section - only on demo tenants (is_demo flag) */}
        {tenant?.is_demo && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center mb-3">
              {language === 'ru' ? 'Демо-входы для тестирования:' : 'Test uchun demo-kirish:'}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 md:gap-3">
              {(tenant?.is_demo ? KAMIZO_DEMO_ACCOUNTS : DEMO_ACCOUNTS).map((account) => {
                const Icon = account.icon;
                const isDemoTenant = tenant?.is_demo;
                return (
                  <button
                    key={account.login}
                    type="button"
                    onClick={() => {
                      setLoginValue(account.login);
                      setPassword('kamizo');
                      if (!agreedToTerms) {
                        setShowOfferModal(true);
                      }
                    }}
                    className="flex items-center gap-2 px-2.5 py-2 min-h-[40px] sm:min-h-[44px] bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation text-left"
                    style={isDemoTenant ? { backgroundColor: hexToRgba(brandColor || '#f97316', 0.08) } : undefined}
                  >
                    <div
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${!isDemoTenant ? account.color : ''}`}
                      style={isDemoTenant ? { background: `linear-gradient(135deg, ${brandColor || '#f97316'}, ${brandColor2 || brandColor || '#fb923c'})` } : undefined}
                    >
                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <span className="text-[11px] sm:text-xs font-medium text-gray-700 truncate leading-tight">
                      {language === 'ru' ? account.labelRu : account.labelUz}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Public Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowOfferModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Drag handle for mobile */}
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
              <div className="flex items-center gap-2 sm:gap-3">
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${!tenant ? 'bg-orange-100' : ''}`}
                  style={tenant ? { backgroundColor: hexToRgba(brandColor, 0.15) } : undefined}
                >
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5" style={tenant ? { color: brandColor } : { color: '#ea580c' }} />
                </div>
                <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                  {language === 'ru' ? 'Публичная оферта' : 'Ommaviy oferta'}
                </h2>
              </div>
              <button
                onClick={() => setShowOfferModal(false)}
                className="p-2 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div
              ref={offerScrollRef}
              onScroll={handleOfferScroll}
              className="flex-1 overflow-y-auto p-4 md:p-6 text-sm text-gray-700 leading-relaxed"
            >
              {language === 'ru' ? (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">ПУБЛИЧНАЯ ОФЕРТА</h3>
                  <p className="font-medium">на оказание услуг управляющей компании "Kamizo"</p>

                  <h4 className="font-semibold mt-4">1. ОБЩИЕ ПОЛОЖЕНИЯ</h4>
                  <p>1.1. Настоящая публичная оферта (далее – «Оферта») является официальным предложением ООО "Kamizo" (далее – «Исполнитель») неограниченному кругу физических и юридических лиц (далее – «Заказчик») заключить договор на оказание услуг по управлению многоквартирным домом.</p>
                  <p>1.2. Полным и безоговорочным акцептом настоящей Оферты является регистрация Заказчика в системе и использование сервиса.</p>
                  <p>1.3. Оферта вступает в силу с момента её акцепта и действует до полного исполнения сторонами своих обязательств.</p>

                  <h4 className="font-semibold mt-4">2. ПРЕДМЕТ ОФЕРТЫ</h4>
                  <p>2.1. Исполнитель обязуется предоставлять Заказчику услуги по управлению многоквартирным домом, включая:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Техническое обслуживание и текущий ремонт общего имущества;</li>
                    <li>Санитарное содержание мест общего пользования;</li>
                    <li>Организация круглосуточной аварийно-диспетчерской службы;</li>
                    <li>Обеспечение сбора и вывоза твердых бытовых отходов;</li>
                    <li>Содержание придомовой территории;</li>
                    <li>Техническое обслуживание лифтов и инженерных систем;</li>
                    <li>Организация охраны и видеонаблюдения.</li>
                  </ul>

                  <h4 className="font-semibold mt-4">3. ПРАВА И ОБЯЗАННОСТИ СТОРОН</h4>
                  <p>3.1. Исполнитель обязуется:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Качественно и в срок выполнять заявки на обслуживание;</li>
                    <li>Обеспечить круглосуточный доступ к сервису подачи заявок;</li>
                    <li>Предоставлять отчёты о выполненных работах;</li>
                    <li>Соблюдать конфиденциальность персональных данных.</li>
                  </ul>
                  <p className="mt-2">3.2. Заказчик обязуется:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Своевременно вносить плату за оказанные услуги;</li>
                    <li>Обеспечивать доступ к помещению для выполнения работ;</li>
                    <li>Бережно относиться к общему имуществу дома;</li>
                    <li>Соблюдать правила проживания в многоквартирном доме.</li>
                  </ul>

                  <h4 className="font-semibold mt-4">4. СТОИМОСТЬ И ПОРЯДОК ОПЛАТЫ</h4>
                  <p>4.1. Стоимость услуг определяется согласно утверждённым тарифам управляющей компании.</p>
                  <p>4.2. Оплата производится ежемесячно до 10 числа месяца, следующего за расчётным.</p>
                  <p>4.3. При просрочке платежа начисляется пеня в размере 0,1% от суммы задолженности за каждый день просрочки.</p>

                  <h4 className="font-semibold mt-4">5. ОТВЕТСТВЕННОСТЬ СТОРОН</h4>
                  <p>5.1. Стороны несут ответственность за неисполнение или ненадлежащее исполнение своих обязательств в соответствии с действующим законодательством.</p>
                  <p>5.2. Исполнитель не несёт ответственности за ущерб, причинённый вследствие обстоятельств непреодолимой силы.</p>

                  <h4 className="font-semibold mt-4">6. ПЕРСОНАЛЬНЫЕ ДАННЫЕ</h4>
                  <p>6.1. Заказчик даёт согласие на обработку персональных данных в соответствии с Политикой конфиденциальности.</p>
                  <p>6.2. Персональные данные используются исключительно для оказания услуг и не передаются третьим лицам без согласия Заказчика.</p>

                  <h4 className="font-semibold mt-4">7. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ</h4>
                  <p>7.1. Все споры решаются путём переговоров.</p>
                  <p>7.2. При невозможности достижения согласия спор передаётся на рассмотрение в суд по месту нахождения Исполнителя.</p>

                  <h4 className="font-semibold mt-4">8. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ</h4>
                  <p>8.1. Настоящая Оферта может быть изменена Исполнителем в одностороннем порядке с уведомлением Заказчика не менее чем за 30 дней.</p>
                  <p>8.2. Продолжение использования сервиса после внесения изменений означает согласие с новой редакцией Оферты.</p>

                  <div
                    className={`mt-6 p-4 rounded-xl border ${!tenant ? 'bg-orange-50 border-orange-200' : ''}`}
                    style={tenant ? { backgroundColor: hexToRgba(brandColor, 0.08), borderColor: hexToRgba(brandColor, 0.3) } : undefined}
                  >
                    <p className="font-medium" style={tenant ? { color: brandColor } : { color: '#9a3412' }}>
                      Прокрутите до конца документа, чтобы принять условия оферты.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">OMMAVIY OFERTA</h3>
                  <p className="font-medium">"Kamizo" boshqaruv kompaniyasi xizmatlarini ko'rsatish bo'yicha</p>

                  <h4 className="font-semibold mt-4">1. UMUMIY QOIDALAR</h4>
                  <p>1.1. Ushbu ommaviy oferta (keyingi o'rinlarda - «Oferta») "Kamizo" MChJ (keyingi o'rinlarda - «Ijrochi») tomonidan cheklanmagan doiradagi jismoniy va yuridik shaxslarga (keyingi o'rinlarda - «Buyurtmachi») ko'p qavatli uyni boshqarish xizmatlarini ko'rsatish bo'yicha shartnoma tuzish haqidagi rasmiy taklifdir.</p>
                  <p>1.2. Ushbu Ofertaning to'liq va shartsiz aksepti - Buyurtmachining tizimda ro'yxatdan o'tishi va xizmatdan foydalanishidir.</p>
                  <p>1.3. Oferta aksept qilingan paytdan boshlab kuchga kiradi va tomonlar o'z majburiyatlarini to'liq bajargunga qadar amal qiladi.</p>

                  <h4 className="font-semibold mt-4">2. OFERTA PREDMETI</h4>
                  <p>2.1. Ijrochi Buyurtmachiga ko'p qavatli uyni boshqarish xizmatlarini ko'rsatishni o'z zimmasiga oladi, jumladan:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Umumiy mulkning texnik xizmati va joriy ta'miri;</li>
                    <li>Umumiy foydalanish joylarini sanitariya-gigienik holatda saqlash;</li>
                    <li>Kun-tun avariya-dispetcherlik xizmatini tashkil etish;</li>
                    <li>Qattiq maishiy chiqindilarni yig'ish va olib chiqishni ta'minlash;</li>
                    <li>Uy atrofi hududini saqlash;</li>
                    <li>Liftlar va muhandislik tizimlariga texnik xizmat ko'rsatish;</li>
                    <li>Qo'riqlash va video kuzatuvni tashkil etish.</li>
                  </ul>

                  <h4 className="font-semibold mt-4">3. TOMONLARNING HUQUQ VA MAJBURIYATLARI</h4>
                  <p>3.1. Ijrochi majburiyatlari:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Xizmat ko'rsatish bo'yicha arizalarni sifatli va o'z vaqtida bajarish;</li>
                    <li>Ariza berish xizmatiga kun-tun kirish imkoniyatini ta'minlash;</li>
                    <li>Bajarilgan ishlar bo'yicha hisobotlarni taqdim etish;</li>
                    <li>Shaxsiy ma'lumotlar maxfiyligini saqlash.</li>
                  </ul>
                  <p className="mt-2">3.2. Buyurtmachi majburiyatlari:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Ko'rsatilgan xizmatlar uchun o'z vaqtida to'lov qilish;</li>
                    <li>Ishlarni bajarish uchun xonaga kirishni ta'minlash;</li>
                    <li>Uyning umumiy mulkiga ehtiyotkorona munosabatda bo'lish;</li>
                    <li>Ko'p qavatli uyda yashash qoidalariga rioya qilish.</li>
                  </ul>

                  <h4 className="font-semibold mt-4">4. NARX VA TO'LOV TARTIBI</h4>
                  <p>4.1. Xizmatlar narxi boshqaruv kompaniyasining tasdiqlangan tariflariga muvofiq belgilanadi.</p>
                  <p>4.2. To'lov hisob-kitob oyidan keyingi oyning 10-sanasigacha har oy amalga oshiriladi.</p>
                  <p>4.3. To'lovni kechiktirgan taqdirda, har bir kechiktirilgan kun uchun qarz summasining 0,1% miqdorida jarima hisoblanadi.</p>

                  <h4 className="font-semibold mt-4">5. TOMONLARNING JAVOBGARLIGI</h4>
                  <p>5.1. Tomonlar o'z majburiyatlarini bajarmaslik yoki lozim darajada bajarmaslik uchun amaldagi qonunchilikka muvofiq javobgar bo'ladi.</p>
                  <p>5.2. Ijrochi fors-major holatlari tufayli yetkazilgan zarar uchun javobgar emas.</p>

                  <h4 className="font-semibold mt-4">6. SHAXSIY MA'LUMOTLAR</h4>
                  <p>6.1. Buyurtmachi Maxfiylik siyosatiga muvofiq shaxsiy ma'lumotlarni qayta ishlashga rozilik beradi.</p>
                  <p>6.2. Shaxsiy ma'lumotlar faqat xizmatlar ko'rsatish uchun ishlatiladi va Buyurtmachining roziligisiz uchinchi shaxslarga berilmaydi.</p>

                  <h4 className="font-semibold mt-4">7. NIZOLARNI HAL ETISH TARTIBI</h4>
                  <p>7.1. Barcha nizolar muzokaralar yo'li bilan hal etiladi.</p>
                  <p>7.2. Kelishuvga erishish imkonsiz bo'lganda, nizo Ijrochi joylashgan joy sudiga ko'rib chiqish uchun topshiriladi.</p>

                  <h4 className="font-semibold mt-4">8. YAKUNIY QOIDALAR</h4>
                  <p>8.1. Ushbu Oferta Ijrochi tomonidan bir tomonlama tartibda, Buyurtmachini kamida 30 kun oldin xabardor qilgan holda o'zgartirilishi mumkin.</p>
                  <p>8.2. O'zgartirishlar kiritilganidan keyin xizmatdan foydalanishni davom ettirish Ofertaning yangi tahririga rozilikni bildiradi.</p>

                  <div
                    className={`mt-6 p-4 rounded-xl border ${!tenant ? 'bg-orange-50 border-orange-200' : ''}`}
                    style={tenant ? { backgroundColor: hexToRgba(brandColor, 0.08), borderColor: hexToRgba(brandColor, 0.3) } : undefined}
                  >
                    <p className="font-medium" style={tenant ? { color: brandColor } : { color: '#9a3412' }}>
                      Oferta shartlarini qabul qilish uchun hujjat oxirigacha aylantiring.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 md:p-6 border-t border-gray-200 bg-gray-50 sm:rounded-b-2xl">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
                <p className={`text-xs sm:text-sm text-center sm:text-left ${canAcceptOffer ? 'text-green-600' : 'text-gray-500'}`}>
                  {canAcceptOffer
                    ? (language === 'ru' ? '✓ Вы прочитали документ' : '✓ Siz hujjatni o\'qidingiz')
                    : (language === 'ru' ? 'Прокрутите вниз для прочтения' : 'O\'qish uchun pastga aylantiring')
                  }
                </p>
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => setShowOfferModal(false)}
                    className="flex-1 sm:flex-none px-4 py-3 sm:py-2.5 min-h-[44px] text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation text-sm sm:text-base"
                  >
                    {language === 'ru' ? 'Закрыть' : 'Yopish'}
                  </button>
                  <button
                    onClick={handleAcceptOffer}
                    disabled={!canAcceptOffer}
                    className={`flex-1 sm:flex-none px-6 py-3 sm:py-2.5 min-h-[44px] rounded-xl font-medium transition-colors touch-manipulation text-sm sm:text-base ${
                      canAcceptOffer
                        ? (tenant ? 'text-white' : 'bg-orange-400 hover:bg-orange-500 active:bg-orange-600 text-gray-900')
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                    style={canAcceptOffer && tenant ? { backgroundColor: brandColor } : undefined}
                  >
                    {language === 'ru' ? 'Принять' : 'Qabul qilish'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
