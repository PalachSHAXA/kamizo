import { useState, type ComponentType } from 'react';
import { Eye, EyeOff, AlertCircle, Users, UserCog, Wrench, ShieldCheck, Crown, Briefcase, Truck, Store, Building2, Home, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore, type Language } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';
import { AppLogo } from '../components/common/AppLogo';
import { RUFlag } from '../components/common/RUFlag';
import { UZFlag } from './vehicles/UZFlag';

// Demo account definitions (without passwords — passwords filled at click time)
type DemoAccount = { login: string; role: string; labelRu: string; labelUz: string; icon: ComponentType<{ className?: string }>; color: string };

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

export function LoginPage() {
  const { login, isLoading: authLoading, error: authError, pickerTenants, clearPicker } = useAuthStore();
  const { language, setLanguage, t } = useLanguageStore();
  const { config: tenantConfig, isConfigFetched } = useTenantStore();
  const tenant = tenantConfig?.tenant;

  // Tenant identity is logo + name only — UI chrome is uniform Kamizo
  // orange across all tenants. tenant.color / color_secondary are still
  // fetched by tenantStore and still editable in the super-admin form,
  // just no longer painted on the login surface.

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  // Sprint 86 — Smart Punctuation defang. iOS Simulator (and physical
  // iPhone if "Smart Punctuation" is on under General → Keyboard) silently
  // rewrites the ASCII hyphen `-` (U+002D) to en-dash `–` (U+2013) or
  // em-dash `—` (U+2014) inside text input fields. The HTML
  // `autoCorrect="off"` attribute does NOT suppress Smart Punctuation —
  // it's a separate iOS setting. So a user typing `test-director-choko`
  // can quietly land at `test–director–choko` (visually identical at
  // form font size, byte-distinct in the request body), the server's
  // case-sensitive `WHERE login = ?` lookup misses, PATH B's fan-out
  // verifies zero rows, the 401 returns "Не удалось определить вашу
  // управляющую компанию" — and the user gets the generic
  // "Неверный логин или пароль" with no clue why. Both fields run
  // every keystroke through this normalizer; harmless on web where the
  // chars never appear.
  //   • U+2013 en-dash, U+2014 em-dash, U+2212 minus  → ASCII hyphen
  //   • U+00A0 non-breaking space (slips in from autocorrect)  → space
  const normalizeAuthField = (s: string): string =>
    s.replace(/[–—−]/g, '-').replace(/ /g, ' ');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // v118.157 — flag is now a React node (SVG) instead of an emoji string.
  // Emoji flags rendered inconsistently across iOS / Android WebViews at
  // the ~14 px pill size and made the Uzbek flag unrecognisable to users.
  // SVGs render identically everywhere and are crisp at any size.
  const languages: { code: Language; label: string; flag: React.ReactNode }[] = [
    { code: 'ru', label: 'RU', flag: <RUFlag className="w-4 h-3" /> },
    { code: 'uz', label: 'UZ', flag: <UZFlag className="w-4 h-3" /> },
  ];

  // Track which workspace row is in-flight, so we can show a spinner on
  // that exact row while the second login round-trip runs.
  const [pickingSlug, setPickingSlug] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Sprint 86 — DO NOT setError on outcome === 'error'. The previous
      // override blanketed every server response with the hardcoded
      // generic "Неверный логин или пароль", hiding the real reason
      // (tenant resolution fail / rate limit / 5xx / etc). The auth
      // store has already normalised the server message into authError
      // for us — `displayError = error || authError` will surface it.
      await login(loginValue, password);
      // outcome === 'picker' → the workspace picker render below opens
      //   (driven by store.pickerTenants); password stays in this
      //   component's useState for the re-submit.
      // outcome === 'success' → App re-renders with Layout when user is set.
    } catch {
      setError(language === 'ru' ? 'Ошибка при входе' : 'Kirishda xatolik');
    }
  };

  // Tap on a workspace row: re-submit login + chosen slug. The password
  // never left this component (and the form-cleared backend never logs
  // it) — the second request reuses the same in-memory password.
  const handleSelectTenant = async (slug: string) => {
    if (pickingSlug) return; // ignore double-taps
    setPickingSlug(slug);
    setError('');
    try {
      // Same as handleSubmit: let authStore's mapped error surface
      // through displayError instead of clobbering it with the
      // hardcoded generic.
      await login(loginValue, password, slug);
      // outcome === 'success' → App re-renders.
      // outcome === 'picker' should NOT happen here (the slug pinned a
      // single tenant), but if it ever did, the picker just re-renders.
    } catch {
      setError(language === 'ru' ? 'Ошибка при входе' : 'Kirishda xatolik');
    } finally {
      setPickingSlug(null);
    }
  };

  // Cancel the picker → drop the tenant list, password stays in the
  // form input so the user can edit & retry without retyping.
  const handleCancelPicker = () => {
    clearPicker();
    setPickingSlug(null);
    setError('');
  };

  const displayError = error || authError;

  // v118.116 — was: blank screen while tenant config loaded, "to
  // prevent flash of wrong layout". On a cold start with a slow VPS
  // round-trip this stretched 10-15 s — the user saw a blank screen,
  // assumed the app was frozen, and couldn't even tap the DEV
  // autologin button if the autologin happened to have failed. The
  // login form's layout doesn't actually DEPEND on tenant config
  // (tenant branding is filled in conditionally below), so removing
  // the gate lets the form render immediately and the branding paints
  // in as soon as fetchConfig resolves. Worst case = a 50 ms flash of
  // generic-themed login → tenant-themed login, vastly better than a
  // 10 s frozen screen.

  return (
    // Mobile app-shell in index.css locks body/#root/.layout-root to
    // height:100dvh; overflow:hidden so the resident shell (fixed bars +
    // single scrollable .main-content) works. /login renders outside
    // <Layout>, so it inherits the page-lock with no scroll container.
    // Make this div the scroll region itself: definite viewport height +
    // overflow-y:auto, with m-auto-on-flex-child centering so the card
    // centers when it fits the viewport and scrolls when it overflows.
    <div
      // v118.79 — kz-screen opts into the global iOS-like page-enter slide+fade.
      className="kz-screen relative bg-gradient-to-br from-white via-orange-50/30 to-orange-50/50"
      style={{
        // v129 P1 — Capacitor's Android System WebView resolves 100dvh
        // to 0 on Chromium < 108 (still in service on many real Android
        // 11/12 devices via system updater opt-out). Fall back through
        // 100vh → 100svh, both of which Capacitor implements correctly.
        // The minHeight/height pair keeps the page lock from collapsing
        // the scroll region when the bundled keyboard plugin shifts the
        // viewport.
        minHeight: '100vh',
        height: '100svh',
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Decorative elements — Kamizo orange across every tenant */}
      <div className="absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl bg-primary-200/20" />
      <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl bg-primary-100/30" />

      {/* Centering wrapper: flex + min-h-full + m-auto on child = card sits
          centered when content fits the viewport, top-aligned and scrollable
          when it doesn't. Safe-area-inset padding keeps the logo off the
          notch and the last demo-login button above the home indicator. */}
      <div
        className="flex min-h-full px-4 sm:p-4"
        style={{
          paddingTop: 'max(2rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6 sm:p-8 md:p-10 w-full max-w-[400px] relative z-10 m-auto">
        {/* Logo + Language switcher row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            {tenant ? (
              <>
                {tenant.logo ? (
                  <img src={tenant.logo} alt={tenant.name} className="w-10 h-10 flex-shrink-0 rounded-xl object-cover" />
                ) : (
                  // Placeholder used only when the tenant has no uploaded
                  // logo. Unified on Kamizo orange so every tenant chip
                  // looks identical — tenant identity is carried by name
                  // text (and a real uploaded logo when present), not by
                  // the chip colour.
                  <div className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-base bg-gradient-to-br from-primary-400 to-primary-600">
                    {tenant.name[0]}
                  </div>
                )}
                <div>
                  <h2 className="text-[15px] font-bold leading-tight" style={{ color: '#1a1a1a' }}>{tenant.name}</h2>
                  <p className="text-sm font-bold uppercase tracking-wider mt-0.5 text-primary-500">{tenant.is_demo ? 'DEMO' : (tenant.slug?.toUpperCase() || '')}</p>
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
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="flex items-center">{lang.flag}</span>
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
            <label htmlFor="login-field" className="block text-xs font-bold uppercase tracking-[1px] text-gray-800 mb-1.5">{t('auth.login')}</label>
            <input
              id="login-field"
              type="text"
              value={loginValue}
              onChange={(e) => setLoginValue(normalizeAuthField(e.target.value))}
              placeholder={language === 'ru' ? 'Введите логин' : 'Login kiriting'}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
              aria-label={language === 'ru' ? 'Логин' : 'Login'}
              autoComplete="username"
              // Mobile soft keyboards (Android GBoard, iOS, Samsung) default
              // to autoCapitalize="sentences" on type=text, which silently
              // upper-cases the first character of the login. Both fields
              // are case-sensitive end-to-end (server returns 401 for
              // "Demo-resident2" vs "demo-resident2"), so a phone user who
              // doesn't notice the capital sees only "Неверный логин или
              // пароль" with no clue why. Force the keyboard off:
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>

          <div>
            <label htmlFor="password-field" className="block text-xs font-bold uppercase tracking-[1px] text-gray-800 mb-1.5">{t('auth.password')}</label>
            <div className="relative">
              <input
                id="password-field"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(normalizeAuthField(e.target.value))}
                placeholder={language === 'ru' ? 'Введите пароль' : 'Parol kiriting'}
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                aria-label={language === 'ru' ? 'Пароль' : 'Parol'}
                autoComplete="current-password"
                // type=password defaults to autoCapitalize=off on most
                // browsers, BUT when the user taps the eye icon the field
                // flips to type=text and some Android keyboards happily
                // start capitalizing — leading to "Kamizo" being silently
                // sent instead of "kamizo". Force the keyboard off in
                // both modes:
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowPassword(!showPassword);
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 active:text-gray-800 touch-manipulation p-3 z-20"
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

          {/* v118.148 — public-offer checkbox + modal removed. Kamizo has
              no in-app payments, so the "публичная оферта" (public offer
              agreement) requirement wasn't needed for App Store
              submission. Privacy policy is the only legal document Apple
              requires and it lives at kamizo.uz/privacy (linked from the
              app metadata). Any offer-related state, refs, useEffect,
              Modal component + its ~525 lines of legal text also removed. */}
          <button
            type="submit"
            disabled={authLoading}
            className="w-full text-center py-3.5 min-h-[48px] text-[15px] font-semibold rounded-xl transition-all active:scale-[0.98] touch-manipulation bg-primary-500 text-white shadow-lg shadow-primary-200/50 hover:bg-primary-600 disabled:opacity-70"
          >
            {authLoading ? (language === 'ru' ? 'Вход...' : 'Kirish...') : (language === 'ru' ? 'Войти' : 'Kirish')}
          </button>
        </form>

        {/* Footer text */}
        <p className="text-center text-xs text-gray-300 mt-4">
          {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'} · Kamizo CRM
        </p>

        {/* DEV bypass — visible only when running under `vite` (import.meta.env.DEV).
            Stuffs a fake resident user + token directly into the zustand-persist
            localStorage key so the app considers itself logged in and renders the
            resident UI without an API round-trip. API calls will fail (token is
            fake) so data lists are empty, but UI / layouts render fully — enough
            to preview screens like /vehicles, /, /chat. Gone from production
            bundles automatically via tree-shaking. */}
        {import.meta.env.DEV && (
          <div className="mt-6 pt-6 border-t border-dashed border-amber-300">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 text-center mb-2">
              DEV preview · только локально
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'dev-resident-farhod', name: 'Фарход (DEV)', login: 'dev-farhod', apt: '45', area: 65, route: '/vehicles' },
                { id: 'dev-resident-aziza',  name: 'Aziza (DEV)',  login: 'dev-aziza',  apt: '12', area: 58, route: '/' },
              ].map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    const fakeUser = {
                      id: u.id,
                      login: u.login,
                      phone: '+998 90 000 00 00',
                      name: u.name,
                      role: 'resident',
                      address: 'ул. Навои, 25',
                      apartment: u.apt,
                      buildingId: 'dev-building-1',
                      totalArea: u.area,
                    };
                    const fakeToken = 'dev-bypass-token-' + u.id;
                    localStorage.setItem('uk-auth-storage', JSON.stringify({
                      state: { user: fakeUser, token: fakeToken },
                      version: 4,
                    }));
                    localStorage.setItem('auth_token', fakeToken);
                    window.location.assign(u.route);
                  }}
                  className="px-3 py-2.5 rounded-xl text-[12px] font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 active:scale-[0.98] transition-all border border-amber-200 text-left leading-tight"
                >
                  {u.name}
                  <span className="block text-[10px] font-normal text-amber-700 mt-0.5">→ {u.route}</span>
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-amber-700/70 text-center mt-2 leading-tight">
              API запросы упадут (фейковый токен), но UI отрисуется. Хватит для preview визуала.
            </p>
          </div>
        )}

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
                    }}
                    className={`flex items-center gap-2 px-2.5 py-2 min-h-[40px] sm:min-h-[44px] rounded-xl transition-colors touch-manipulation text-left ${
                      isDemoTenant
                        ? 'bg-primary-50 hover:bg-primary-100/70'
                        : 'bg-gray-50 hover:bg-gray-100 active:bg-gray-200'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDemoTenant ? 'bg-gradient-to-br from-primary-400 to-primary-600' : account.color
                      }`}
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
      </div>


      {/* Tenant-picker overlay.
          Mounted when authStore.pickerTenants is non-null — i.e. the
          backend returned needs_tenant_pick=true. Covers the entire
          login viewport with the same warm gradient as the form so it
          reads as one continuous flow, not a popup. The form card
          stays mounted underneath (so the password value, agreed-to-
          terms checkbox, etc. survive a cancel), it's just visually
          hidden by this layer.

          Password lifecycle: it lives only in the LoginPage's `password`
          useState; nothing in this overlay reads or echoes it. On
          successful re-submit the page unmounts as App routes away;
          on cancel the form re-appears with the value intact so the
          user can edit and retry without re-typing. On unmount React
          discards the state. */}
      {pickerTenants && pickerTenants.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-gradient-to-br from-white via-orange-50/30 to-orange-50/50"
          style={{
            // v129 P1 — same Capacitor fallback as the parent /login
            // scroll region above.
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            height: '100svh',
            minHeight: '100vh',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={language === 'ru' ? 'Выбор управляющей компании' : 'Boshqaruv kompaniyasini tanlash'}
        >
          <div
            className="flex min-h-full px-4 sm:p-4"
            style={{
              paddingTop: 'max(2rem, env(safe-area-inset-top))',
              paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6 sm:p-8 w-full max-w-[400px] m-auto">
              {/* Header: back arrow + title */}
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={handleCancelPicker}
                  type="button"
                  aria-label={language === 'ru' ? 'Назад' : 'Ortga'}
                  className="w-10 h-10 grid place-items-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 touch-manipulation"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-[18px] font-bold text-gray-900 leading-tight" style={{ letterSpacing: '-0.01em' }}>
                  {language === 'ru' ? 'Выберите компанию' : 'Kompaniyani tanlang'}
                </h1>
              </div>

              {/* Subtitle */}
              <p className="text-sm text-gray-600 mb-6 leading-snug">
                {language === 'ru'
                  ? 'Ваш логин зарегистрирован в нескольких управляющих компаниях. Выберите, в какую войти.'
                  : 'Login bir nechta boshqaruv kompaniyasida ro\'yxatdan o\'tgan. Qaysi biriga kirishni tanlang.'}
              </p>

              {/* Tenant list */}
              <div className="flex flex-col gap-2">
                {pickerTenants.map((t) => {
                  const busy = pickingSlug === t.slug;
                  const disabled = !!pickingSlug; // disable all rows while one is in-flight
                  return (
                    <button
                      key={t.slug}
                      onClick={() => handleSelectTenant(t.slug)}
                      type="button"
                      disabled={disabled}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-2xl bg-white hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-left transition-colors"
                    >
                      {/* Logo or initial-letter chip */}
                      {t.logo ? (
                        <img
                          src={t.logo}
                          alt=""
                          className="w-11 h-11 flex-shrink-0 rounded-xl object-cover border border-gray-100"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 flex-shrink-0 rounded-xl grid place-items-center text-white font-bold text-base"
                          style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                        >
                          {t.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      {/* Name + secondary line (the slug, helps disambiguate when names collide) */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-gray-900 leading-tight truncate">
                          {t.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {t.slug}.kamizo.uz
                        </div>
                      </div>
                      {/* Trailing icon: spinner while this row is in-flight, otherwise chevron */}
                      {busy ? (
                        <Loader2 className="w-5 h-5 text-gray-400 animate-spin flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Error / status row */}
              {displayError && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{displayError}</span>
                </div>
              )}

              {/* Cancel link as a softer secondary action */}
              <button
                onClick={handleCancelPicker}
                type="button"
                disabled={!!pickingSlug}
                className="w-full mt-5 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation py-2"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
