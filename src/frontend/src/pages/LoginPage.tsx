import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, X, FileText, Check, Users, UserCog, Wrench, ShieldCheck, Crown, Briefcase, Truck, Store, Building2, Home } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore, type Language } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';
import { AppLogo } from '../components/common/AppLogo';
import { Modal } from '../components/common';

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
                  <p className="text-sm font-bold uppercase tracking-wider mt-0.5" style={{ color: tenant.color }}>{tenant.is_demo ? 'DEMO' : (tenant.slug?.toUpperCase() || '')}</p>
                </div>
              </>
            ) : (
              <>
                <AppLogo size="md" forceDefault />
                <div>
                  <h1 className="text-[15px] font-bold text-gray-900 leading-tight">Kamizo</h1>
                  <p className="text-sm font-bold uppercase tracking-wider text-primary-500 mt-0.5">CRM</p>
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
            <label className="block text-xs font-bold uppercase tracking-[1px] text-gray-800 mb-1.5">{t('auth.login')}</label>
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
            <label className="block text-xs font-bold uppercase tracking-[1px] text-gray-800 mb-1.5">{t('auth.password')}</label>
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
          <div className="flex items-start gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setAgreedToTerms(!agreedToTerms)}
              className="flex-shrink-0 touch-manipulation"
              aria-label={language === 'ru' ? 'Согласие с офертой' : 'Ofertaga rozilik'}
            >
              <div
                className={`rounded border-[1.5px] flex items-center justify-center transition-all ${
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
            </button>
            <span className="text-[12px] text-gray-500 leading-relaxed">
              {language === 'ru' ? 'Я согласен с условиями' : 'Men'}{' '}
              <button
                type="button"
                onClick={() => setShowOfferModal(true)}
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
        <p className="text-center text-xs text-gray-300 mt-4">
          {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'} · Kamizo CRM
        </p>

        {/* Demo Accounts Section - only on demo tenants (is_demo flag) */}
        {tenant?.is_demo && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center mb-3">
              {language === 'ru' ? 'Демо-входы для тестирования:' : 'Test uchun demo-kirish:'}
            </p>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-2">
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
                    <span className="text-xs sm:text-xs font-medium text-gray-700 truncate leading-tight">
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
      <Modal
        isOpen={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        title={language === 'ru' ? 'Публичная оферта' : 'Ommaviy oferta'}
        size="2xl"
      >
            {/* Modal Content - Scrollable */}
            <div
              ref={offerScrollRef}
              onScroll={handleOfferScroll}
              className="text-sm text-gray-700 leading-relaxed"
            >
              {language === 'ru' ? (
                <div className="space-y-3">
                  <h3 className="font-bold text-base text-center">Публичная оферта на использование ITплатформы Kamizo</h3>
                  <h4 className="font-semibold mt-4">1. Общие положения</h4>
                  <p>1.1. Настоящая Публичная оферта (далее – «Оферта») в соответствии со статьей 367 Гражданского кодекса Республики Узбекистан является публичным предложением ООО «AXELION» (далее – «Kamizo» или «Правообладатель»), адресованным неограниченному кругу лиц, заключить договор на использование IT-платформы Kamizo на условиях, изложенных в настоящей Оферте.</p>
                  <p>1.2. Настоящая Оферта регулирует исключительно порядок использования IT-платформы Kamizo и не регулирует отношения, связанные с оказанием коммунальных и иных услуг управляющими компаниями.</p>
                  <p>1.3. Акцептом настоящей Оферты является регистрация Пользователя в Платформе либо начало фактического использования ее функционала.</p>
                  <p>1.4. Осуществляя акцепт Оферты, Пользователь подтверждает, что:</p>
                  <p>ознакомился с условиями Оферты в полном объеме;</p>
                  <p>принимает их безоговорочно и без исключений;</p>
                  <p>обязуется соблюдать условия настоящей Оферты.</p>
                  <p>1.5. В случае несогласия с условиями Оферты Пользователь обязан немедленно прекратить использование Платформы.</p>
                  <h4 className="font-semibold mt-4">2. Термины и определения</h4>
                  <h4 className="font-semibold mt-4">2. Термины и определения</h4>
                  <p>2.1. Платформа (Kamizo) – программный комплекс, представляющий собой совокупность программ для ЭВМ, баз данных и интерфейсов (мобильное приложение и веб-платформа), предназначенный для организации информационного взаимодействия между Пользователями и управляющими компаниями, включая, но не ограничиваясь: подачей заявок, получением информации, уведомлений, а также обменом сообщениями. Платформа носит исключительно вспомогательный (технический) характер и не является средством оказания коммунальных или иных услуг.</p>
                  <p>2.2. Правообладатель (Kamizo) – Общество с ограниченной ответственностью «AXELION», являющееся разработчиком, владельцем и оператором Платформы, которому принадлежат все исключительные права на Платформу, включая программное обеспечение, базы данных, интерфейсы, дизайн, а также иные результаты интеллектуальной деятельности.</p>
                  <p>2.3. Пользователь – дееспособное физическое лицо, прошедшее регистрацию в Платформе либо использующее ее функционал, действующее в собственных интересах либо в интересах собственника/пользователя помещения, и использующее Платформу исключительно в целях информационного взаимодействия с управляющей компанией.</p>
                  <p>2.4. Управляющая компания (УК) – юридическое лицо либо иное уполномоченное лицо, осуществляющее управление, содержание и (или) эксплуатацию многоквартирного дома на основании договора управления, договора оказания услуг либо иного предусмотренного законодательством основания, и являющееся самостоятельным исполнителем соответствующих услуг.</p>
                  <p>2.5. Сервис Платформы – функциональные возможности Платформы, предоставляемые Пользователю, включая подачу заявок, доступ к информации, уведомлениям, коммуникацию с УК и иные цифровые инструменты, доступные в интерфейсе Платформы.</p>
                  <p>2.6. Заявка – электронное обращение Пользователя, сформированное посредством Платформы и направляемое в адрес управляющей компании с целью информирования о необходимости выполнения работ, устранения неисправностей либо получения информации.</p>
                  <p>2.7. Учетная запись (Аккаунт) – персонализированный раздел Платформы, создаваемый при регистрации Пользователя и содержащий данные, необходимые для его идентификации и использования функционала Платформы.</p>
                  <p>2.8. Контент – любая информация, размещаемая, передаваемая или отображаемая в Платформе, включая текстовые сообщения, изображения, файлы, уведомления и иные данные, формируемые Пользователями, управляющими компаниями или Правообладателем.</p>
                  <h4 className="font-semibold mt-4">3. Предмет Оферты</h4>
                  <p>3.1. В рамках настоящей Оферты Правообладатель предоставляет Пользователю неисключительное, ограниченное, непередаваемое и отзывное право (простую лицензию) на использование Платформы исключительно в пределах ее функциональных возможностей и в соответствии с условиями настоящей Оферты.</p>
                  <p>3.2. Предоставляемое право использования Платформы включает доступ к следующим функциональным возможностям:</p>
                  <p>формирование и направление заявок в адрес управляющей компании;</p>
                  <p>получение информации, уведомлений и сообщений, размещаемых управляющей компанией или формируемых в Платформе;</p>
                  <p>осуществление коммуникации с управляющей компанией посредством интерфейсов Платформы;</p>
                  <p>использование иных цифровых инструментов и сервисов Платформы, доступных Пользователю в соответствующий момент времени.</p>
                  <p>3.3. Использование Платформы допускается исключительно в личных, некоммерческих целях, связанных с эксплуатацией и использованием жилого или нежилого помещения, и не предполагает приобретения каких-либо прав на программное обеспечение Платформы, за исключением прямо предусмотренного настоящей Офертой права использования.</p>
                  <p>3.4. Платформа носит исключительно информационно-технический характер и используется Пользователем как инструмент взаимодействия с управляющей компанией. Правообладатель не оказывает коммунальные, эксплуатационные или иные услуги, связанные с управлением многоквартирными домами.</p>
                  <p>3.5. Предоставление доступа к Платформе не является оказанием услуг в сфере жилищно-коммунального хозяйства, не заменяет и не изменяет договорные отношения между Пользователем и управляющей компанией, а также не влечет возникновения у Правообладателя каких-либо обязательств по таким отношениям.</p>
                  <p>3.6. Платформа предоставляется на условиях «как есть» (as is), что означает, что Правообладатель не предоставляет каких-либо гарантий, включая, но не ограничиваясь:</p>
                  <p>соответствием Платформы целям и ожиданиям Пользователя;</p>
                  <p>бесперебойной и безошибочной работой Платформы;</p>
                  <p>отсутствием технических сбоев или перерывов в доступе;</p>
                  <p>полной совместимостью Платформы с устройствами Пользователя.</p>
                  <p>3.7. Правообладатель вправе в любое время изменять, дополнять или ограничивать функциональные возможности Платформы без предварительного согласия Пользователя, при условии соблюдения положений настоящей Оферты.</p>
                  <h4 className="font-semibold mt-4">4. Разграничение функций и ответственности</h4>
                  <p>4.1. Kamizo осуществляет деятельность исключительно в качестве оператора и правообладателя IT-платформы и не является:</p>
                  <p>управляющей компанией;</p>
                  <p>поставщиком коммунальных, эксплуатационных или иных услуг в сфере жилищно-коммунального хозяйства;</p>
                  <p>агентом, представителем, комиссионером либо иным уполномоченным лицом управляющей компании;</p>
                  <p>стороной договоров, заключенных между Пользователем и управляющей компанией.</p>
                  <p>4.2. Управляющая компания является самостоятельным исполнителем услуг и несет полную ответственность за:</p>
                  <p>содержание и эксплуатацию многоквартирного дома;</p>
                  <p>качество и своевременность выполнения работ и услуг;</p>
                  <p>расчет и применение тарифов;</p>
                  <p>начисление, перерасчет и администрирование платежей;</p>
                  <p>соблюдение требований законодательства и условий договоров с Пользователями.</p>
                  <p>4.3. Использование Платформы Kamizo:</p>
                  <p>не является заключением, изменением или расторжением договора между Пользователем и управляющей компанией;</p>
                  <p>не влечет изменения прав и обязанностей сторон по таким договорам;</p>
                  <p>не создает для Пользователя каких-либо дополнительных обязательств в части оплаты коммунальных или иных услуг;</p>
                  <p>не может рассматриваться как согласие Пользователя на изменение условий взаимодействия с управляющей компанией.</p>
                  <p>4.4. Kamizo не участвует и не оказывает влияния на:</p>
                  <p>установление, утверждение или изменение тарифов;</p>
                  <p>расчет начислений и формирование задолженности;</p>
                  <p>выставление счетов и прием платежей;</p>
                  <p>начисление штрафов, пеней или иных санкций;</p>
                  <p>принятие решений по заявкам Пользователей и срокам их исполнения.</p>
                  <p>4.5. Любая информация, отображаемая в Платформе в отношении начислений, статуса заявок, уведомлений или иных данных, формируется управляющей компанией либо третьими лицами и доводится до Пользователя в неизменном виде. Kamizo не проверяет, не изменяет и не гарантирует достоверность такой информации.</p>
                  <p>4.6. Все вопросы, связанные с:</p>
                  <p>тарифами и их структурой;</p>
                  <p>качеством и объемом оказываемых услуг;</p>
                  <p>сроками выполнения работ;</p>
                  <p>начислениями, перерасчетами и задолженностью;</p>
                  <p>рассмотрением заявок и претензий,</p>
                  <p>подлежат разрешению Пользователем непосредственно с управляющей компанией без участия Kamizo.</p>
                  <p>4.7. Kamizo не несет ответственности за:</p>
                  <p>действия или бездействие управляющей компании;</p>
                  <p>неисполнение или ненадлежащее исполнение обязательств управляющей компанией;</p>
                  <p>последствия, связанные с оказанием либо неоказанием услуг управляющей компанией;</p>
                  <p>любые убытки Пользователя, возникшие в связи с отношениями между Пользователем и управляющей компанией.</p>
                  <h4 className="font-semibold mt-4">5. Права и обязанности</h4>
                  <p>5.1. Kamizo вправе:</p>
                  <p>5.1.1. предоставлять Пользователю доступ к Платформе и ее функциональным возможностям в объеме, определяемом настоящей Офертой;</p>
                  <p>5.1.2. по своему усмотрению изменять, дополнять, ограничивать или прекращать отдельные функции Платформы без предварительного согласия Пользователя;</p>
                  <p>5.1.3. временно ограничивать или приостанавливать доступ к Платформе полностью или частично в целях проведения технических, профилактических или иных работ;</p>
                  <p>5.1.4. осуществлять мониторинг использования Платформы в целях обеспечения ее безопасности, стабильности и соблюдения условий настоящей Оферты;</p>
                  <p>5.1.5. запрашивать у Пользователя дополнительную информацию и (или) подтверждающие документы в случае наличия обоснованных сомнений в достоверности предоставленных данных;</p>
                  <p>5.1.6. ограничить, приостановить или прекратить доступ Пользователя к Платформе (включая блокировку учетной записи) в случае:</p>
                  <p>нарушения Пользователем условий настоящей Оферты;</p>
                  <p>предоставления недостоверной информации;</p>
                  <p>совершения действий, направленных на нарушение работы Платформы;</p>
                  <p>попыток несанкционированного доступа к Платформе или данным третьих лиц;</p>
                  <p>использования Платформы в противоправных целях;</p>
                  <p>наличия угрозы причинения вреда Kamizo, другим Пользователям или третьим лицам;</p>
                  <p>5.1.7. удалять или ограничивать доступ к любому Контенту, размещенному Пользователем, если такой Контент нарушает законодательство или условия настоящей Оферты;</p>
                  <p>5.1.8. привлекать третьих лиц (подрядчиков, хостинг-провайдеров, сервис-провайдеров) для обеспечения функционирования Платформы без дополнительного согласия Пользователя.</p>
                  <p>5.2. Kamizo обязуется:</p>
                  <p>5.2.1. обеспечивать функционирование Платформы в разумных пределах с учетом ее технической природы и условий предоставления «как есть»;</p>
                  <p>5.2.2. предпринимать необходимые организационные и технические меры для защиты информации Пользователя;</p>
                  <p>5.2.3. обрабатывать персональные данные Пользователя в соответствии с применимым законодательством Республики Узбекистан и Политикой конфиденциальности;</p>
                  <p>5.2.4. по возможности информировать Пользователей о существенных изменениях в работе Платформы.</p>
                  <p>5.3. Пользователь обязуется:</p>
                  <p>5.3.1. использовать Платформу исключительно в законных целях и в соответствии с ее функциональным назначением;</p>
                  <p>5.3.2. соблюдать условия настоящей Оферты и требования действующего законодательства;</p>
                  <p>5.3.3. предоставлять достоверную, актуальную и полную информацию при использовании Платформы;</p>
                  <p>5.3.4. не осуществлять действий, направленных на нарушение функционирования Платформы, включая:</p>
                  <p>вмешательство в программное обеспечение;</p>
                  <p>попытки обхода технических ограничений;</p>
                  <p>использование автоматизированных скриптов, ботов или иных средств несанкционированного доступа;</p>
                  <p>5.3.5. не осуществлять:</p>
                  <p>копирование, воспроизведение или распространение Платформы или ее элементов;</p>
                  <p>декомпиляцию, дизассемблирование, обратную разработку;</p>
                  <p>создание производных или аналогичных программных решений;</p>
                  <p>5.3.6. обеспечивать конфиденциальность своих данных доступа (логина, пароля, кодов подтверждения) и не передавать их третьим лицам;</p>
                  <p>5.3.7. незамедлительно уведомлять Kamizo о любом случае несанкционированного доступа к его учетной записи;</p>
                  <p>5.3.8. не размещать и не передавать через Платформу Контент, который:</p>
                  <p>нарушает законодательство;</p>
                  <p>содержит недостоверную или вводящую в заблуждение информацию;</p>
                  <p>нарушает права третьих лиц;</p>
                  <p>носит оскорбительный, противоправный или вредоносный характер</p>
                  <h4 className="font-semibold mt-4">6. Ограничения использования</h4>
                  <p>6.1. Пользователю запрещается использовать Платформу способами, противоречащими ее назначению, условиям настоящей Оферты или требованиям законодательства Республики Узбекистан.</p>
                  <p>6.2. Пользователю запрещается:</p>
                  <p>6.2.1. вмешиваться в работу Платформы, включая попытки:</p>
                  <p>обхода технических ограничений;</p>
                  <p>нарушения целостности или стабильности функционирования Платформы;</p>
                  <p>воздействия на программное обеспечение, серверы или базы данных;</p>
                  <p>6.2.2. осуществлять несанкционированный доступ либо предпринимать попытки получения доступа к:</p>
                  <p>учетным записям других пользователей;</p>
                  <p>данным, не предназначенным для данного Пользователя;</p>
                  <p>внутренним системам Платформы;</p>
                  <p>6.2.3. использовать Платформу в противоправных целях, включая, но не ограничиваясь:</p>
                  <p>распространением недостоверной, вводящей в заблуждение или незаконной информации;</p>
                  <p>нарушением прав и законных интересов третьих лиц;</p>
                  <p>использованием Платформы для мошеннических действий;</p>
                  <p>6.2.4. использовать вредоносное программное обеспечение, автоматизированные скрипты, ботов, парсеры, либо иные технические средства, направленные на:</p>
                  <p>вмешательство в работу Платформы;</p>
                  <p>сбор, копирование или извлечение данных без разрешения;</p>
                  <p>создание избыточной нагрузки на инфраструктуру Платформы;</p>
                  <p>6.2.5. осуществлять действия, направленные на копирование, воспроизведение, модификацию или использование элементов Платформы вне предоставленного функционала, включая попытки декомпиляции, обратной разработки или создания аналогичных решений;</p>
                  <p>6.2.6. использовать Платформу с нарушением требований информационной безопасности, в том числе с устройств или программной среды, подвергнутых компрометации (включая использование модифицированных операционных систем, несанкционированного доступа к системе или средств перехвата данных);</p>
                  <p>6.2.7. размещать, передавать или распространять через Платформу Контент, который:</p>
                  <p>нарушает законодательство Республики Узбекистан;</p>
                  <p>содержит вредоносный код или иные элементы, способные причинить вред Платформе или третьим лицам;</p>
                  <p>носит оскорбительный, дискриминационный или противоправный характер;</p>
                  <p>6.2.8. использовать Платформу способом, который может привести к нарушению прав Kamizo, других пользователей или третьих лиц.</p>
                  <p>6.3. В случае нарушения Пользователем настоящего раздела Kamizo вправе без предварительного уведомления:</p>
                  <p>ограничить или приостановить доступ Пользователя к Платформе;</p>
                  <p>заблокировать учетную запись Пользователя;</p>
                  <p>удалить соответствующий Контент;</p>
                  <p>предпринять иные меры, предусмотренные настоящей Офертой и законодательством.</p>
                  <h4 className="font-semibold mt-4">7. Ответственность и ограничения</h4>
                  <p>7.1. Kamizo несет ответственность исключительно в пределах функционирования Платформы как информационно-технического инструмента и только в случаях, прямо предусмотренных законодательством Республики Узбекистан.</p>
                  <p>7.2. Kamizo не является стороной отношений между Пользователем и управляющей компанией и, соответственно, не несет ответственности за:</p>
                  <p>действия или бездействие управляющей компании;</p>
                  <p>качество, объем и сроки оказания услуг управляющей компанией;</p>
                  <p>выполнение либо невыполнение заявок Пользователя;</p>
                  <p>расчеты, начисления, перерасчеты и задолженность по коммунальным или иным платежам;</p>
                  <p>правомерность установления тарифов и их применение;</p>
                  <p>7.3. Kamizo не несет ответственности за достоверность, полноту и актуальность информации, размещаемой в Платформе Пользователями, управляющими компаниями или третьими лицами, и не обязано осуществлять проверку такой информации.</p>
                  <p>7.4. Kamizo не несет ответственности за перебои, задержки, ошибки или невозможность использования Платформы, вызванные обстоятельствами, находящимися вне разумного контроля Kamizo, включая, но не ограничиваясь:</p>
                  <p>сбоями в работе сетей связи, интернета или оборудования Пользователя;</p>
                  <p>действиями третьих лиц;</p>
                  <p>программными сбоями, атаками или вредоносным воздействием;</p>
                  <p>проведением технических, профилактических или аварийных работ;</p>
                  <p>7.5. В максимально допустимой законодательством степени Kamizo не несет ответственности за:</p>
                  <p>косвенные, случайные, специальные или штрафные убытки;</p>
                  <p>упущенную выгоду;</p>
                  <p>потерю данных, деловой репутации или иные нематериальные потери;</p>
                  <p>любые последствия использования либо невозможности использования Платформы.</p>
                  <p>7.6. Kamizo не гарантирует:</p>
                  <p>бесперебойную и безошибочную работу Платформы;</p>
                  <p>соответствие Платформы ожиданиям Пользователя;</p>
                  <p>непрерывный доступ к Платформе в любой момент времени.</p>
                  <p>7.7. Ответственность Kamizo в любом случае ограничивается объемом, прямо предусмотренным применимым законодательством Республики Узбекистан.</p>
                  <p>7.8. Пользователь несет ответственность за:</p>
                  <p>достоверность предоставляемых данных;</p>
                  <p>сохранность и конфиденциальность данных доступа к учетной записи;</p>
                  <p>все действия, совершенные с использованием его учетной записи;</p>
                  <p>последствия передачи своих данных третьим лицам.</p>
                  <p>7.9. Пользователь обязуется самостоятельно принимать меры по защите своих устройств, программного обеспечения и данных, используемых для доступа к Платформе.</p>
                  <h4 className="font-semibold mt-4">8. Интеллектуальная собственность</h4>
                  <p>8.1. Все исключительные права на Платформу Kamizo, включая, но не ограничиваясь, программное обеспечение, исходный и объектный код, базы данных, алгоритмы, интерфейсы, дизайн, графические элементы, товарные знаки, наименование, а также иные результаты интеллектуальной деятельности и средства индивидуализации, принадлежат Правообладателю либо используются им на законных основаниях.</p>
                  <p>8.2. Пользователю предоставляется исключительно ограниченное, неисключительное, непередаваемое и отзывное право использования Платформы в пределах ее функционала и в соответствии с условиями настоящей Оферты.Никакие положения Оферты не могут толковаться как передача (отчуждение) исключительных прав либо предоставление Пользователю каких-либо иных прав, прямо не указанных в настоящем документе.</p>
                  <p>8.3. Пользователю запрещается без предварительного письменного согласия Правообладателя:</p>
                  <p>копировать, воспроизводить, распространять или иным образом использовать Платформу или ее отдельные элементы;</p>
                  <p>модифицировать, адаптировать, переводить или создавать производные продукты на основе Платформы;</p>
                  <p>осуществлять декомпиляцию, дизассемблирование, обратную разработку (reverse engineering) либо иные попытки получения исходного кода Платформы;</p>
                  <p>использовать Платформу или ее элементы для создания аналогичных или конкурирующих продуктов или сервисов;</p>
                  <p>удалять, изменять или скрывать уведомления об авторских правах, товарных знаках или иных правах Правообладателя;</p>
                  <p>8.4. Любое использование Платформы или ее элементов вне пределов предоставленного права использования, в том числе с нарушением условий настоящей Оферты, является незаконным и может повлечь ответственность в соответствии с законодательством Республики Узбекистан.</p>
                  <p>8.5. Все права, прямо не предоставленные Пользователю в соответствии с настоящей Офертой, сохраняются за Правообладателем.</p>
                  <h4 className="font-semibold mt-4">9. Изменение Оферты</h4>
                  <p>9.1. Kamizo вправе вносить изменения и дополнения в условия настоящей Оферты по своему усмотрению в целях совершенствования Платформы, изменения ее функционала, а также приведения условий Оферты в соответствие с требованиями законодательства Республики Узбекистан.</p>
                  <p>9.2. Обновленная редакция Оферты подлежит размещению в Платформе и (или) на официальном сайте Kamizo с указанием даты вступления в силу.</p>
                  <p>9.3. Изменения вступают в силу не ранее чем через 10 (десять) календарных дней с момента их опубликования, если иной срок не указан в соответствующей редакции Оферты.</p>
                  <p>9.4. Kamizo вправе дополнительно уведомлять Пользователей об изменениях посредством интерфейса Платформы, push-уведомлений, электронной почты или иными доступными способами.</p>
                  <p>9.5. Пользователь обязуется самостоятельно отслеживать изменения Оферты. Продолжение использования Платформы после вступления изменений в силу означает согласие Пользователя с новой редакцией Оферты.</p>
                  <p>9.6. В случае несогласия с изменениями Пользователь обязан прекратить использование Платформы.</p>
                  <p>9.7. Изменения условий Оферты не имеют обратной силы и применяются исключительно к отношениям, возникшим после их вступления в силу.</p>
                  <h4 className="font-semibold mt-4">10. Персональные данные</h4>
                  <p>10.1. Обработка персональных данных Пользователя осуществляется в соответствии с законодательством Республики Узбекистан, включая Закон Республики Узбекистан «О персональных данных», а также в соответствии с Политикой конфиденциальности Kamizo, размещенной отдельно и являющейся неотъемлемой частью регулирования использования Платформы.</p>
                  <p>10.2. Используя Платформу и осуществляя акцепт настоящей Оферты, Пользователь подтверждает свое согласие на обработку его персональных данных в целях:</p>
                  <p>предоставления доступа к Платформе и ее функционалу;</p>
                  <p>обеспечения взаимодействия с управляющей компанией;</p>
                  <p>направления уведомлений и сообщений;</p>
                  <p>обеспечения безопасности и функционирования Платформы;</p>
                  <p>исполнения требований законодательства.</p>
                  <p>10.3. Обработка персональных данных может включать сбор, систематизацию, хранение, уточнение (обновление, изменение), использование, передачу (в том числе управляющим компаниям в объеме, необходимом для обработки заявок), обезличивание и уничтожение персональных данных.</p>
                  <p>10.4. Пользователь подтверждает, что предоставляет персональные данные добровольно и гарантирует их достоверность.</p>
                  <p>10.5. Kamizo принимает необходимые организационные и технические меры для защиты персональных данных от неправомерного доступа, изменения, раскрытия или уничтожения.</p>
                  <p>10.6. Пользователь вправе реализовать свои права, предусмотренные законодательством о персональных данных, включая право на доступ, уточнение и удаление своих персональных данных, в порядке, предусмотренном Политикой конфиденциальности.</p>
                  <h4 className="font-semibold mt-4">11. Форс-мажор</h4>
                  <p>11.1. Стороны освобождаются от ответственности за полное или частичное неисполнение обязательств по настоящей Оферте, если такое неисполнение явилось следствием обстоятельств непреодолимой силы (форс-мажора), возникших после акцепта Оферты и находящихся вне разумного контроля Сторон.</p>
                  <p>11.2. К обстоятельствам непреодолимой силы относятся, включая, но не ограничиваясь:</p>
                  <p>сбои и перебои в работе сетей связи, интернета и телекоммуникационной инфраструктуры;</p>
                  <p>действия или бездействие государственных органов, включая принятие нормативных актов и ограничений;</p>
                  <p>стихийные бедствия (пожары, наводнения, землетрясения и иные природные явления);</p>
                  <p>военные действия, чрезвычайные положения, массовые беспорядки;</p>
                  <p>перебои в электроснабжении;</p>
                  <p>кибератаки, действия третьих лиц, направленные на нарушение функционирования Платформы;</p>
                  <p>иные обстоятельства, которые Стороны не могли предвидеть и предотвратить разумными мерами.</p>
                  <p>11.3. Сторона, для которой стало невозможным исполнение обязательств вследствие обстоятельств непреодолимой силы, обязуется при наличии технической возможности уведомить другую Сторону в разумный срок.</p>
                  <p>11.4. В случае продолжительности обстоятельств непреодолимой силы более 30 (тридцати) календарных дней каждая из Сторон вправе прекратить использование Платформы (для Пользователя) либо исполнение обязательств по настоящей Оферте без возмещения возможных убытков.</p>
                  <h4 className="font-semibold mt-4">12. Разрешение споров</h4>
                  <p>12.1. Все споры и разногласия, возникающие в связи с настоящей Офертой или использованием Платформы, подлежат разрешению путем переговоров между Сторонами.</p>
                  <p>12.2. До обращения в суд Стороны обязуются соблюдать обязательный претензионный порядок урегулирования споров. Претензия направляется в письменной или электронной форме и должна быть рассмотрена в разумный срок, но не позднее 15 (пятнадцати) календарных дней с момента ее получения, если иной срок не установлен законодательством.</p>
                  <p>12.3. В случае недостижения соглашения спор подлежит рассмотрению в судебных органах Республики Узбекистан в соответствии с применимым законодательством.</p>
                  <p>12.4. К настоящей Оферте применяется право Республики Узбекистан без учета коллизионных норм.</p>
                  <p>12.5. Местом рассмотрения спора является место нахождения Правообладателя, если иное не предусмотрено императивными нормами законодательства.</p>
                  <h4 className="font-semibold mt-4">13. Заключительные положения</h4>
                  <p>13.1. Настоящая Оферта регулируется и толкуется в соответствии с законодательством Республики Узбекистан.</p>
                  <p>13.2. В случае, если какое-либо положение настоящей Оферты признается недействительным, незаконным или не подлежащим исполнению полностью или частично, это не влечет недействительности остальных положений Оферты, которые продолжают действовать в полном объеме.</p>
                  <p>13.3. Использование Платформы, включая регистрацию и (или) фактическое использование ее функционала, означает полное и безоговорочное согласие Пользователя с условиями настоящей Оферты.</p>
                  <p>13.4. Настоящая Оферта представляет собой полное соглашение между Пользователем и Kamizo в отношении использования Платформы и заменяет собой все предыдущие договоренности, переписку и соглашения по данному предмету, если таковые имели место.</p>
                  <p>13.5. Неприменение Kamizo какого-либо права или положения настоящей Оферты не означает отказ от такого права или положения и не лишает Kamizo права реализовать его в дальнейшем.</p>
                  <p>13.6. Пользователь не вправе передавать свои права и обязанности по настоящей Оферте третьим лицам без предварительного письменного согласия Kamizo.</p>
                  <p>13.7. Kamizo вправе передать (уступить) свои права и обязанности по настоящей Оферте третьим лицам без согласия Пользователя при условии соблюдения требований законодательства.</p>
                  <p>13.8. Настоящая Оферта может быть размещена и доступна Пользователю в Платформе, на официальном сайте Kamizo, а также иными способами, обеспечивающими возможность ознакомления с ее условиями.</p>

                  <div className="mt-6 p-4 rounded-xl border bg-orange-50 border-orange-200">
                    <p className="font-medium text-orange-800">
                      Прокрутите до конца документа, чтобы принять условия оферты.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="font-bold text-base text-center">Публичная оферта на использование ITплатформы Kamizo</h3>
                  <h4 className="font-semibold mt-4">1. Общие положения</h4>
                  <p>1.1. Настоящая Публичная оферта (далее – «Оферта») в соответствии со статьей 367 Гражданского кодекса Республики Узбекистан является публичным предложением ООО «AXELION» (далее – «Kamizo» или «Правообладатель»), адресованным неограниченному кругу лиц, заключить договор на использование IT-платформы Kamizo на условиях, изложенных в настоящей Оферте.</p>
                  <p>1.2. Настоящая Оферта регулирует исключительно порядок использования IT-платформы Kamizo и не регулирует отношения, связанные с оказанием коммунальных и иных услуг управляющими компаниями.</p>
                  <p>1.3. Акцептом настоящей Оферты является регистрация Пользователя в Платформе либо начало фактического использования ее функционала.</p>
                  <p>1.4. Осуществляя акцепт Оферты, Пользователь подтверждает, что:</p>
                  <p>ознакомился с условиями Оферты в полном объеме;</p>
                  <p>принимает их безоговорочно и без исключений;</p>
                  <p>обязуется соблюдать условия настоящей Оферты.</p>
                  <p>1.5. В случае несогласия с условиями Оферты Пользователь обязан немедленно прекратить использование Платформы.</p>
                  <h4 className="font-semibold mt-4">2. Термины и определения</h4>
                  <h4 className="font-semibold mt-4">2. Термины и определения</h4>
                  <p>2.1. Платформа (Kamizo) – программный комплекс, представляющий собой совокупность программ для ЭВМ, баз данных и интерфейсов (мобильное приложение и веб-платформа), предназначенный для организации информационного взаимодействия между Пользователями и управляющими компаниями, включая, но не ограничиваясь: подачей заявок, получением информации, уведомлений, а также обменом сообщениями. Платформа носит исключительно вспомогательный (технический) характер и не является средством оказания коммунальных или иных услуг.</p>
                  <p>2.2. Правообладатель (Kamizo) – Общество с ограниченной ответственностью «AXELION», являющееся разработчиком, владельцем и оператором Платформы, которому принадлежат все исключительные права на Платформу, включая программное обеспечение, базы данных, интерфейсы, дизайн, а также иные результаты интеллектуальной деятельности.</p>
                  <p>2.3. Пользователь – дееспособное физическое лицо, прошедшее регистрацию в Платформе либо использующее ее функционал, действующее в собственных интересах либо в интересах собственника/пользователя помещения, и использующее Платформу исключительно в целях информационного взаимодействия с управляющей компанией.</p>
                  <p>2.4. Управляющая компания (УК) – юридическое лицо либо иное уполномоченное лицо, осуществляющее управление, содержание и (или) эксплуатацию многоквартирного дома на основании договора управления, договора оказания услуг либо иного предусмотренного законодательством основания, и являющееся самостоятельным исполнителем соответствующих услуг.</p>
                  <p>2.5. Сервис Платформы – функциональные возможности Платформы, предоставляемые Пользователю, включая подачу заявок, доступ к информации, уведомлениям, коммуникацию с УК и иные цифровые инструменты, доступные в интерфейсе Платформы.</p>
                  <p>2.6. Заявка – электронное обращение Пользователя, сформированное посредством Платформы и направляемое в адрес управляющей компании с целью информирования о необходимости выполнения работ, устранения неисправностей либо получения информации.</p>
                  <p>2.7. Учетная запись (Аккаунт) – персонализированный раздел Платформы, создаваемый при регистрации Пользователя и содержащий данные, необходимые для его идентификации и использования функционала Платформы.</p>
                  <p>2.8. Контент – любая информация, размещаемая, передаваемая или отображаемая в Платформе, включая текстовые сообщения, изображения, файлы, уведомления и иные данные, формируемые Пользователями, управляющими компаниями или Правообладателем.</p>
                  <h4 className="font-semibold mt-4">3. Предмет Оферты</h4>
                  <p>3.1. В рамках настоящей Оферты Правообладатель предоставляет Пользователю неисключительное, ограниченное, непередаваемое и отзывное право (простую лицензию) на использование Платформы исключительно в пределах ее функциональных возможностей и в соответствии с условиями настоящей Оферты.</p>
                  <p>3.2. Предоставляемое право использования Платформы включает доступ к следующим функциональным возможностям:</p>
                  <p>формирование и направление заявок в адрес управляющей компании;</p>
                  <p>получение информации, уведомлений и сообщений, размещаемых управляющей компанией или формируемых в Платформе;</p>
                  <p>осуществление коммуникации с управляющей компанией посредством интерфейсов Платформы;</p>
                  <p>использование иных цифровых инструментов и сервисов Платформы, доступных Пользователю в соответствующий момент времени.</p>
                  <p>3.3. Использование Платформы допускается исключительно в личных, некоммерческих целях, связанных с эксплуатацией и использованием жилого или нежилого помещения, и не предполагает приобретения каких-либо прав на программное обеспечение Платформы, за исключением прямо предусмотренного настоящей Офертой права использования.</p>
                  <p>3.4. Платформа носит исключительно информационно-технический характер и используется Пользователем как инструмент взаимодействия с управляющей компанией. Правообладатель не оказывает коммунальные, эксплуатационные или иные услуги, связанные с управлением многоквартирными домами.</p>
                  <p>3.5. Предоставление доступа к Платформе не является оказанием услуг в сфере жилищно-коммунального хозяйства, не заменяет и не изменяет договорные отношения между Пользователем и управляющей компанией, а также не влечет возникновения у Правообладателя каких-либо обязательств по таким отношениям.</p>
                  <p>3.6. Платформа предоставляется на условиях «как есть» (as is), что означает, что Правообладатель не предоставляет каких-либо гарантий, включая, но не ограничиваясь:</p>
                  <p>соответствием Платформы целям и ожиданиям Пользователя;</p>
                  <p>бесперебойной и безошибочной работой Платформы;</p>
                  <p>отсутствием технических сбоев или перерывов в доступе;</p>
                  <p>полной совместимостью Платформы с устройствами Пользователя.</p>
                  <p>3.7. Правообладатель вправе в любое время изменять, дополнять или ограничивать функциональные возможности Платформы без предварительного согласия Пользователя, при условии соблюдения положений настоящей Оферты.</p>
                  <h4 className="font-semibold mt-4">4. Разграничение функций и ответственности</h4>
                  <p>4.1. Kamizo осуществляет деятельность исключительно в качестве оператора и правообладателя IT-платформы и не является:</p>
                  <p>управляющей компанией;</p>
                  <p>поставщиком коммунальных, эксплуатационных или иных услуг в сфере жилищно-коммунального хозяйства;</p>
                  <p>агентом, представителем, комиссионером либо иным уполномоченным лицом управляющей компании;</p>
                  <p>стороной договоров, заключенных между Пользователем и управляющей компанией.</p>
                  <p>4.2. Управляющая компания является самостоятельным исполнителем услуг и несет полную ответственность за:</p>
                  <p>содержание и эксплуатацию многоквартирного дома;</p>
                  <p>качество и своевременность выполнения работ и услуг;</p>
                  <p>расчет и применение тарифов;</p>
                  <p>начисление, перерасчет и администрирование платежей;</p>
                  <p>соблюдение требований законодательства и условий договоров с Пользователями.</p>
                  <p>4.3. Использование Платформы Kamizo:</p>
                  <p>не является заключением, изменением или расторжением договора между Пользователем и управляющей компанией;</p>
                  <p>не влечет изменения прав и обязанностей сторон по таким договорам;</p>
                  <p>не создает для Пользователя каких-либо дополнительных обязательств в части оплаты коммунальных или иных услуг;</p>
                  <p>не может рассматриваться как согласие Пользователя на изменение условий взаимодействия с управляющей компанией.</p>
                  <p>4.4. Kamizo не участвует и не оказывает влияния на:</p>
                  <p>установление, утверждение или изменение тарифов;</p>
                  <p>расчет начислений и формирование задолженности;</p>
                  <p>выставление счетов и прием платежей;</p>
                  <p>начисление штрафов, пеней или иных санкций;</p>
                  <p>принятие решений по заявкам Пользователей и срокам их исполнения.</p>
                  <p>4.5. Любая информация, отображаемая в Платформе в отношении начислений, статуса заявок, уведомлений или иных данных, формируется управляющей компанией либо третьими лицами и доводится до Пользователя в неизменном виде. Kamizo не проверяет, не изменяет и не гарантирует достоверность такой информации.</p>
                  <p>4.6. Все вопросы, связанные с:</p>
                  <p>тарифами и их структурой;</p>
                  <p>качеством и объемом оказываемых услуг;</p>
                  <p>сроками выполнения работ;</p>
                  <p>начислениями, перерасчетами и задолженностью;</p>
                  <p>рассмотрением заявок и претензий,</p>
                  <p>подлежат разрешению Пользователем непосредственно с управляющей компанией без участия Kamizo.</p>
                  <p>4.7. Kamizo не несет ответственности за:</p>
                  <p>действия или бездействие управляющей компании;</p>
                  <p>неисполнение или ненадлежащее исполнение обязательств управляющей компанией;</p>
                  <p>последствия, связанные с оказанием либо неоказанием услуг управляющей компанией;</p>
                  <p>любые убытки Пользователя, возникшие в связи с отношениями между Пользователем и управляющей компанией.</p>
                  <h4 className="font-semibold mt-4">5. Права и обязанности</h4>
                  <p>5.1. Kamizo вправе:</p>
                  <p>5.1.1. предоставлять Пользователю доступ к Платформе и ее функциональным возможностям в объеме, определяемом настоящей Офертой;</p>
                  <p>5.1.2. по своему усмотрению изменять, дополнять, ограничивать или прекращать отдельные функции Платформы без предварительного согласия Пользователя;</p>
                  <p>5.1.3. временно ограничивать или приостанавливать доступ к Платформе полностью или частично в целях проведения технических, профилактических или иных работ;</p>
                  <p>5.1.4. осуществлять мониторинг использования Платформы в целях обеспечения ее безопасности, стабильности и соблюдения условий настоящей Оферты;</p>
                  <p>5.1.5. запрашивать у Пользователя дополнительную информацию и (или) подтверждающие документы в случае наличия обоснованных сомнений в достоверности предоставленных данных;</p>
                  <p>5.1.6. ограничить, приостановить или прекратить доступ Пользователя к Платформе (включая блокировку учетной записи) в случае:</p>
                  <p>нарушения Пользователем условий настоящей Оферты;</p>
                  <p>предоставления недостоверной информации;</p>
                  <p>совершения действий, направленных на нарушение работы Платформы;</p>
                  <p>попыток несанкционированного доступа к Платформе или данным третьих лиц;</p>
                  <p>использования Платформы в противоправных целях;</p>
                  <p>наличия угрозы причинения вреда Kamizo, другим Пользователям или третьим лицам;</p>
                  <p>5.1.7. удалять или ограничивать доступ к любому Контенту, размещенному Пользователем, если такой Контент нарушает законодательство или условия настоящей Оферты;</p>
                  <p>5.1.8. привлекать третьих лиц (подрядчиков, хостинг-провайдеров, сервис-провайдеров) для обеспечения функционирования Платформы без дополнительного согласия Пользователя.</p>
                  <p>5.2. Kamizo обязуется:</p>
                  <p>5.2.1. обеспечивать функционирование Платформы в разумных пределах с учетом ее технической природы и условий предоставления «как есть»;</p>
                  <p>5.2.2. предпринимать необходимые организационные и технические меры для защиты информации Пользователя;</p>
                  <p>5.2.3. обрабатывать персональные данные Пользователя в соответствии с применимым законодательством Республики Узбекистан и Политикой конфиденциальности;</p>
                  <p>5.2.4. по возможности информировать Пользователей о существенных изменениях в работе Платформы.</p>
                  <p>5.3. Пользователь обязуется:</p>
                  <p>5.3.1. использовать Платформу исключительно в законных целях и в соответствии с ее функциональным назначением;</p>
                  <p>5.3.2. соблюдать условия настоящей Оферты и требования действующего законодательства;</p>
                  <p>5.3.3. предоставлять достоверную, актуальную и полную информацию при использовании Платформы;</p>
                  <p>5.3.4. не осуществлять действий, направленных на нарушение функционирования Платформы, включая:</p>
                  <p>вмешательство в программное обеспечение;</p>
                  <p>попытки обхода технических ограничений;</p>
                  <p>использование автоматизированных скриптов, ботов или иных средств несанкционированного доступа;</p>
                  <p>5.3.5. не осуществлять:</p>
                  <p>копирование, воспроизведение или распространение Платформы или ее элементов;</p>
                  <p>декомпиляцию, дизассемблирование, обратную разработку;</p>
                  <p>создание производных или аналогичных программных решений;</p>
                  <p>5.3.6. обеспечивать конфиденциальность своих данных доступа (логина, пароля, кодов подтверждения) и не передавать их третьим лицам;</p>
                  <p>5.3.7. незамедлительно уведомлять Kamizo о любом случае несанкционированного доступа к его учетной записи;</p>
                  <p>5.3.8. не размещать и не передавать через Платформу Контент, который:</p>
                  <p>нарушает законодательство;</p>
                  <p>содержит недостоверную или вводящую в заблуждение информацию;</p>
                  <p>нарушает права третьих лиц;</p>
                  <p>носит оскорбительный, противоправный или вредоносный характер</p>
                  <h4 className="font-semibold mt-4">6. Ограничения использования</h4>
                  <p>6.1. Пользователю запрещается использовать Платформу способами, противоречащими ее назначению, условиям настоящей Оферты или требованиям законодательства Республики Узбекистан.</p>
                  <p>6.2. Пользователю запрещается:</p>
                  <p>6.2.1. вмешиваться в работу Платформы, включая попытки:</p>
                  <p>обхода технических ограничений;</p>
                  <p>нарушения целостности или стабильности функционирования Платформы;</p>
                  <p>воздействия на программное обеспечение, серверы или базы данных;</p>
                  <p>6.2.2. осуществлять несанкционированный доступ либо предпринимать попытки получения доступа к:</p>
                  <p>учетным записям других пользователей;</p>
                  <p>данным, не предназначенным для данного Пользователя;</p>
                  <p>внутренним системам Платформы;</p>
                  <p>6.2.3. использовать Платформу в противоправных целях, включая, но не ограничиваясь:</p>
                  <p>распространением недостоверной, вводящей в заблуждение или незаконной информации;</p>
                  <p>нарушением прав и законных интересов третьих лиц;</p>
                  <p>использованием Платформы для мошеннических действий;</p>
                  <p>6.2.4. использовать вредоносное программное обеспечение, автоматизированные скрипты, ботов, парсеры, либо иные технические средства, направленные на:</p>
                  <p>вмешательство в работу Платформы;</p>
                  <p>сбор, копирование или извлечение данных без разрешения;</p>
                  <p>создание избыточной нагрузки на инфраструктуру Платформы;</p>
                  <p>6.2.5. осуществлять действия, направленные на копирование, воспроизведение, модификацию или использование элементов Платформы вне предоставленного функционала, включая попытки декомпиляции, обратной разработки или создания аналогичных решений;</p>
                  <p>6.2.6. использовать Платформу с нарушением требований информационной безопасности, в том числе с устройств или программной среды, подвергнутых компрометации (включая использование модифицированных операционных систем, несанкционированного доступа к системе или средств перехвата данных);</p>
                  <p>6.2.7. размещать, передавать или распространять через Платформу Контент, который:</p>
                  <p>нарушает законодательство Республики Узбекистан;</p>
                  <p>содержит вредоносный код или иные элементы, способные причинить вред Платформе или третьим лицам;</p>
                  <p>носит оскорбительный, дискриминационный или противоправный характер;</p>
                  <p>6.2.8. использовать Платформу способом, который может привести к нарушению прав Kamizo, других пользователей или третьих лиц.</p>
                  <p>6.3. В случае нарушения Пользователем настоящего раздела Kamizo вправе без предварительного уведомления:</p>
                  <p>ограничить или приостановить доступ Пользователя к Платформе;</p>
                  <p>заблокировать учетную запись Пользователя;</p>
                  <p>удалить соответствующий Контент;</p>
                  <p>предпринять иные меры, предусмотренные настоящей Офертой и законодательством.</p>
                  <h4 className="font-semibold mt-4">7. Ответственность и ограничения</h4>
                  <p>7.1. Kamizo несет ответственность исключительно в пределах функционирования Платформы как информационно-технического инструмента и только в случаях, прямо предусмотренных законодательством Республики Узбекистан.</p>
                  <p>7.2. Kamizo не является стороной отношений между Пользователем и управляющей компанией и, соответственно, не несет ответственности за:</p>
                  <p>действия или бездействие управляющей компании;</p>
                  <p>качество, объем и сроки оказания услуг управляющей компанией;</p>
                  <p>выполнение либо невыполнение заявок Пользователя;</p>
                  <p>расчеты, начисления, перерасчеты и задолженность по коммунальным или иным платежам;</p>
                  <p>правомерность установления тарифов и их применение;</p>
                  <p>7.3. Kamizo не несет ответственности за достоверность, полноту и актуальность информации, размещаемой в Платформе Пользователями, управляющими компаниями или третьими лицами, и не обязано осуществлять проверку такой информации.</p>
                  <p>7.4. Kamizo не несет ответственности за перебои, задержки, ошибки или невозможность использования Платформы, вызванные обстоятельствами, находящимися вне разумного контроля Kamizo, включая, но не ограничиваясь:</p>
                  <p>сбоями в работе сетей связи, интернета или оборудования Пользователя;</p>
                  <p>действиями третьих лиц;</p>
                  <p>программными сбоями, атаками или вредоносным воздействием;</p>
                  <p>проведением технических, профилактических или аварийных работ;</p>
                  <p>7.5. В максимально допустимой законодательством степени Kamizo не несет ответственности за:</p>
                  <p>косвенные, случайные, специальные или штрафные убытки;</p>
                  <p>упущенную выгоду;</p>
                  <p>потерю данных, деловой репутации или иные нематериальные потери;</p>
                  <p>любые последствия использования либо невозможности использования Платформы.</p>
                  <p>7.6. Kamizo не гарантирует:</p>
                  <p>бесперебойную и безошибочную работу Платформы;</p>
                  <p>соответствие Платформы ожиданиям Пользователя;</p>
                  <p>непрерывный доступ к Платформе в любой момент времени.</p>
                  <p>7.7. Ответственность Kamizo в любом случае ограничивается объемом, прямо предусмотренным применимым законодательством Республики Узбекистан.</p>
                  <p>7.8. Пользователь несет ответственность за:</p>
                  <p>достоверность предоставляемых данных;</p>
                  <p>сохранность и конфиденциальность данных доступа к учетной записи;</p>
                  <p>все действия, совершенные с использованием его учетной записи;</p>
                  <p>последствия передачи своих данных третьим лицам.</p>
                  <p>7.9. Пользователь обязуется самостоятельно принимать меры по защите своих устройств, программного обеспечения и данных, используемых для доступа к Платформе.</p>
                  <h4 className="font-semibold mt-4">8. Интеллектуальная собственность</h4>
                  <p>8.1. Все исключительные права на Платформу Kamizo, включая, но не ограничиваясь, программное обеспечение, исходный и объектный код, базы данных, алгоритмы, интерфейсы, дизайн, графические элементы, товарные знаки, наименование, а также иные результаты интеллектуальной деятельности и средства индивидуализации, принадлежат Правообладателю либо используются им на законных основаниях.</p>
                  <p>8.2. Пользователю предоставляется исключительно ограниченное, неисключительное, непередаваемое и отзывное право использования Платформы в пределах ее функционала и в соответствии с условиями настоящей Оферты.Никакие положения Оферты не могут толковаться как передача (отчуждение) исключительных прав либо предоставление Пользователю каких-либо иных прав, прямо не указанных в настоящем документе.</p>
                  <p>8.3. Пользователю запрещается без предварительного письменного согласия Правообладателя:</p>
                  <p>копировать, воспроизводить, распространять или иным образом использовать Платформу или ее отдельные элементы;</p>
                  <p>модифицировать, адаптировать, переводить или создавать производные продукты на основе Платформы;</p>
                  <p>осуществлять декомпиляцию, дизассемблирование, обратную разработку (reverse engineering) либо иные попытки получения исходного кода Платформы;</p>
                  <p>использовать Платформу или ее элементы для создания аналогичных или конкурирующих продуктов или сервисов;</p>
                  <p>удалять, изменять или скрывать уведомления об авторских правах, товарных знаках или иных правах Правообладателя;</p>
                  <p>8.4. Любое использование Платформы или ее элементов вне пределов предоставленного права использования, в том числе с нарушением условий настоящей Оферты, является незаконным и может повлечь ответственность в соответствии с законодательством Республики Узбекистан.</p>
                  <p>8.5. Все права, прямо не предоставленные Пользователю в соответствии с настоящей Офертой, сохраняются за Правообладателем.</p>
                  <h4 className="font-semibold mt-4">9. Изменение Оферты</h4>
                  <p>9.1. Kamizo вправе вносить изменения и дополнения в условия настоящей Оферты по своему усмотрению в целях совершенствования Платформы, изменения ее функционала, а также приведения условий Оферты в соответствие с требованиями законодательства Республики Узбекистан.</p>
                  <p>9.2. Обновленная редакция Оферты подлежит размещению в Платформе и (или) на официальном сайте Kamizo с указанием даты вступления в силу.</p>
                  <p>9.3. Изменения вступают в силу не ранее чем через 10 (десять) календарных дней с момента их опубликования, если иной срок не указан в соответствующей редакции Оферты.</p>
                  <p>9.4. Kamizo вправе дополнительно уведомлять Пользователей об изменениях посредством интерфейса Платформы, push-уведомлений, электронной почты или иными доступными способами.</p>
                  <p>9.5. Пользователь обязуется самостоятельно отслеживать изменения Оферты. Продолжение использования Платформы после вступления изменений в силу означает согласие Пользователя с новой редакцией Оферты.</p>
                  <p>9.6. В случае несогласия с изменениями Пользователь обязан прекратить использование Платформы.</p>
                  <p>9.7. Изменения условий Оферты не имеют обратной силы и применяются исключительно к отношениям, возникшим после их вступления в силу.</p>
                  <h4 className="font-semibold mt-4">10. Персональные данные</h4>
                  <p>10.1. Обработка персональных данных Пользователя осуществляется в соответствии с законодательством Республики Узбекистан, включая Закон Республики Узбекистан «О персональных данных», а также в соответствии с Политикой конфиденциальности Kamizo, размещенной отдельно и являющейся неотъемлемой частью регулирования использования Платформы.</p>
                  <p>10.2. Используя Платформу и осуществляя акцепт настоящей Оферты, Пользователь подтверждает свое согласие на обработку его персональных данных в целях:</p>
                  <p>предоставления доступа к Платформе и ее функционалу;</p>
                  <p>обеспечения взаимодействия с управляющей компанией;</p>
                  <p>направления уведомлений и сообщений;</p>
                  <p>обеспечения безопасности и функционирования Платформы;</p>
                  <p>исполнения требований законодательства.</p>
                  <p>10.3. Обработка персональных данных может включать сбор, систематизацию, хранение, уточнение (обновление, изменение), использование, передачу (в том числе управляющим компаниям в объеме, необходимом для обработки заявок), обезличивание и уничтожение персональных данных.</p>
                  <p>10.4. Пользователь подтверждает, что предоставляет персональные данные добровольно и гарантирует их достоверность.</p>
                  <p>10.5. Kamizo принимает необходимые организационные и технические меры для защиты персональных данных от неправомерного доступа, изменения, раскрытия или уничтожения.</p>
                  <p>10.6. Пользователь вправе реализовать свои права, предусмотренные законодательством о персональных данных, включая право на доступ, уточнение и удаление своих персональных данных, в порядке, предусмотренном Политикой конфиденциальности.</p>
                  <h4 className="font-semibold mt-4">11. Форс-мажор</h4>
                  <p>11.1. Стороны освобождаются от ответственности за полное или частичное неисполнение обязательств по настоящей Оферте, если такое неисполнение явилось следствием обстоятельств непреодолимой силы (форс-мажора), возникших после акцепта Оферты и находящихся вне разумного контроля Сторон.</p>
                  <p>11.2. К обстоятельствам непреодолимой силы относятся, включая, но не ограничиваясь:</p>
                  <p>сбои и перебои в работе сетей связи, интернета и телекоммуникационной инфраструктуры;</p>
                  <p>действия или бездействие государственных органов, включая принятие нормативных актов и ограничений;</p>
                  <p>стихийные бедствия (пожары, наводнения, землетрясения и иные природные явления);</p>
                  <p>военные действия, чрезвычайные положения, массовые беспорядки;</p>
                  <p>перебои в электроснабжении;</p>
                  <p>кибератаки, действия третьих лиц, направленные на нарушение функционирования Платформы;</p>
                  <p>иные обстоятельства, которые Стороны не могли предвидеть и предотвратить разумными мерами.</p>
                  <p>11.3. Сторона, для которой стало невозможным исполнение обязательств вследствие обстоятельств непреодолимой силы, обязуется при наличии технической возможности уведомить другую Сторону в разумный срок.</p>
                  <p>11.4. В случае продолжительности обстоятельств непреодолимой силы более 30 (тридцати) календарных дней каждая из Сторон вправе прекратить использование Платформы (для Пользователя) либо исполнение обязательств по настоящей Оферте без возмещения возможных убытков.</p>
                  <h4 className="font-semibold mt-4">12. Разрешение споров</h4>
                  <p>12.1. Все споры и разногласия, возникающие в связи с настоящей Офертой или использованием Платформы, подлежат разрешению путем переговоров между Сторонами.</p>
                  <p>12.2. До обращения в суд Стороны обязуются соблюдать обязательный претензионный порядок урегулирования споров. Претензия направляется в письменной или электронной форме и должна быть рассмотрена в разумный срок, но не позднее 15 (пятнадцати) календарных дней с момента ее получения, если иной срок не установлен законодательством.</p>
                  <p>12.3. В случае недостижения соглашения спор подлежит рассмотрению в судебных органах Республики Узбекистан в соответствии с применимым законодательством.</p>
                  <p>12.4. К настоящей Оферте применяется право Республики Узбекистан без учета коллизионных норм.</p>
                  <p>12.5. Местом рассмотрения спора является место нахождения Правообладателя, если иное не предусмотрено императивными нормами законодательства.</p>
                  <h4 className="font-semibold mt-4">13. Заключительные положения</h4>
                  <p>13.1. Настоящая Оферта регулируется и толкуется в соответствии с законодательством Республики Узбекистан.</p>
                  <p>13.2. В случае, если какое-либо положение настоящей Оферты признается недействительным, незаконным или не подлежащим исполнению полностью или частично, это не влечет недействительности остальных положений Оферты, которые продолжают действовать в полном объеме.</p>
                  <p>13.3. Использование Платформы, включая регистрацию и (или) фактическое использование ее функционала, означает полное и безоговорочное согласие Пользователя с условиями настоящей Оферты.</p>
                  <p>13.4. Настоящая Оферта представляет собой полное соглашение между Пользователем и Kamizo в отношении использования Платформы и заменяет собой все предыдущие договоренности, переписку и соглашения по данному предмету, если таковые имели место.</p>
                  <p>13.5. Неприменение Kamizo какого-либо права или положения настоящей Оферты не означает отказ от такого права или положения и не лишает Kamizo права реализовать его в дальнейшем.</p>
                  <p>13.6. Пользователь не вправе передавать свои права и обязанности по настоящей Оферте третьим лицам без предварительного письменного согласия Kamizo.</p>
                  <p>13.7. Kamizo вправе передать (уступить) свои права и обязанности по настоящей Оферте третьим лицам без согласия Пользователя при условии соблюдения требований законодательства.</p>
                  <p>13.8. Настоящая Оферта может быть размещена и доступна Пользователю в Платформе, на официальном сайте Kamizo, а также иными способами, обеспечивающими возможность ознакомления с ее условиями.</p>

                  <div className="mt-6 p-4 rounded-xl border bg-orange-50 border-orange-200">
                    <p className="font-medium text-orange-800">
                      Oferta shartlarini qabul qilish uchun hujjat oxirigacha aylantiring.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer — sticky at bottom of scroll area */}
            <div className="sticky bottom-0 -mx-6 -mb-4 p-4 md:p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
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
                    {language === 'ru' ? 'Отклонить' : 'Rad etish'}
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
      </Modal>
    </div>
  );
}
