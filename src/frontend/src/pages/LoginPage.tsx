import { useState, useEffect, useRef, type ComponentType } from 'react';
import { Eye, EyeOff, AlertCircle, Users, UserCog, Wrench, ShieldCheck, Crown, Briefcase, Truck, Store, Building2, Home, ArrowLeft, ChevronRight, ChevronDown, Loader2, Megaphone } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore, type Language } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';
import { AppLogo } from '../components/common/AppLogo';
import { authApi } from '../services/api/auth';
import type { DemoRole } from '../types/auth';

const DEMO_GATE_SESSION_KEY = 'kamizo_demo_gate';
const DEMO_GATE_DIGEST = '5532bcd984f55a53a1ab897267b9ac10323e17dcfea9fbf35b2fe46ea1c19864';

export function shouldOpenDemoGate(hostname: string, localBootMarker: boolean, storedGate: string | null): boolean {
  return storedGate !== '1' && (hostname === 'demo.kamizo.uz' || localBootMarker);
}

type RolePresentation = {
  labelRu: string;
  labelUz: string;
  icon: ComponentType<{ className?: string }>;
};

const ROLE_PRESENTATION: Record<string, RolePresentation> = {
  director: { labelRu: 'Директор', labelUz: 'Direktor', icon: Briefcase },
  manager: { labelRu: 'Управляющий', labelUz: 'Boshqaruvchi', icon: UserCog },
  resident: { labelRu: 'Житель', labelUz: 'Aholi', icon: Users },
  executor: { labelRu: 'Сантехник', labelUz: 'Santexnik', icon: Wrench },
  security: { labelRu: 'Охранник', labelUz: 'Qo\'riqchi', icon: ShieldCheck },
  marketplace_manager: { labelRu: 'Менеджер магазина', labelUz: 'Do\'kon menejeri', icon: Store },
  admin: { labelRu: 'Администратор', labelUz: 'Administrator', icon: Crown },
  department_head: { labelRu: 'Глава отдела', labelUz: 'Bo\'lim boshlig\'i', icon: Building2 },
  dispatcher: { labelRu: 'Диспетчер', labelUz: 'Dispetcher', icon: Megaphone },
  electrician: { labelRu: 'Электрик', labelUz: 'Elektrik', icon: Wrench },
  courier: { labelRu: 'Курьер', labelUz: 'Kuryer', icon: Truck },
  tenant: { labelRu: 'Арендатор', labelUz: 'Ijarachi', icon: Home },
  advertiser: { labelRu: 'Рекламодатель', labelUz: 'Reklama beruvchi', icon: Megaphone },
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function DemoGate({ onUnlock, language }: { onUnlock: () => void; language: Language }) {
  const [entry, setEntry] = useState('');
  const [err, setErr] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sha256(entry) === DEMO_GATE_DIGEST) {
      try { sessionStorage.setItem(DEMO_GATE_SESSION_KEY, '1'); } catch { /* Safari private mode: skip storage, unlock anyway */ }
      onUnlock();
    } else {
      setErr(language === 'ru' ? 'Неверный пароль' : 'Parol noto‘g‘ri');
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-gate-title"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-full items-center justify-center" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center mb-5">
          <AppLogo size="md" forceDefault />
          <h1 ref={titleRef} id="demo-gate-title" tabIndex={-1} className="mt-3 text-lg font-bold text-gray-900 outline-none">Kamizo Demo</h1>
          <p className="text-xs text-gray-500 mt-1 text-center">
            {language === 'ru'
              ? 'Введите пароль доступа к демо-версии'
              : 'Namoyish kirish parolini kiriting'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
          <input
            type="password"
            value={entry}
            onChange={(e) => { setEntry(e.target.value); setErr(''); }}
            className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40 text-base"
            placeholder={language === 'ru' ? 'Пароль доступа' : 'Kirish paroli'}
            aria-label={language === 'ru' ? 'Пароль доступа' : 'Kirish paroli'}
            autoComplete="off"
          />
          {err && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              {err}
            </p>
          )}
          <button
            type="submit"
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm transition-colors"
          >
            {language === 'ru' ? 'Войти в демо' : 'Kirish'}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const demoLogin = useAuthStore((state) => state.demoLogin);
  const authLoading = useAuthStore((state) => state.isLoading);
  const authError = useAuthStore((state) => state.error);
  const pickerTenants = useAuthStore((state) => state.pickerTenants);
  const clearPicker = useAuthStore((state) => state.clearPicker);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const t = useLanguageStore((state) => state.t);
  const tenantConfig = useTenantStore((state) => state.config);
  const tenant = tenantConfig?.tenant;
  const demoBootMarked = shouldOpenDemoGate(
    window.location.hostname,
    import.meta.env.VITE_DEMO_TENANT === '1',
    null,
  );

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

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ru', label: 'RU', flag: '🇷🇺' },
    { code: 'uz', label: 'UZ', flag: '🇺🇿' },
  ];

  // Track which workspace row is in-flight, so we can show a spinner on
  // that exact row while the second login round-trip runs.
  const [pickingSlug, setPickingSlug] = useState<string | null>(null);

  // Demo entrance gate — only relevant when tenant.slug === 'demo'.
  // Default `true` = show gate; useEffect flips to false immediately if
  // this tab has already unlocked (sessionStorage sentinel).
  const [demoGateOpen, setDemoGateOpen] = useState(() => {
    try {
      return shouldOpenDemoGate(
        window.location.hostname,
        import.meta.env.VITE_DEMO_TENANT === '1' || tenant?.slug === 'demo',
        sessionStorage.getItem(DEMO_GATE_SESSION_KEY),
      );
    } catch {
      return window.location.hostname === 'demo.kamizo.uz' || import.meta.env.VITE_DEMO_TENANT === '1';
    }
  });
  useEffect(() => {
    try {
      if (tenant?.slug === 'demo') {
        setDemoGateOpen(sessionStorage.getItem(DEMO_GATE_SESSION_KEY) !== '1');
      }
    } catch { /* Safari private mode: leave gate open */ }
  }, [tenant?.slug]);

  const [demoRoles, setDemoRoles] = useState<DemoRole[]>([]);
  const [demoRolesLoading, setDemoRolesLoading] = useState(false);
  const [demoRolesError, setDemoRolesError] = useState('');
  const [demoRolesReload, setDemoRolesReload] = useState(0);
  const [demoLoggingIn, setDemoLoggingIn] = useState<string | null>(null);

  useEffect(() => {
    if (tenant?.slug !== 'demo' || demoGateOpen) return;
    let cancelled = false;
    setDemoRolesLoading(true);
    setDemoRolesError('');
    authApi.getDemoRoles().then((roles) => {
      if (!cancelled) setDemoRoles([...roles].sort((a, b) => a.order - b.order));
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        setDemoRoles([]);
        setDemoRolesError(loadError instanceof Error ? loadError.message : (language === 'ru' ? 'Не удалось загрузить роли' : 'Rollarni yuklab bo\'lmadi'));
      }
    }).finally(() => {
      if (!cancelled) setDemoRolesLoading(false);
    });
    return () => { cancelled = true; };
  }, [tenant?.slug, demoGateOpen, demoRolesReload, language]);

  const handleDemoLogin = async (roleKey: string) => {
    if (demoLoggingIn || authLoading) return;
    setDemoLoggingIn(roleKey);
    setError('');
    try {
      await demoLogin(roleKey);
    } catch {
      setError(language === 'ru' ? 'Ошибка при входе' : 'Kirishda xatolik');
    } finally {
      setDemoLoggingIn(null);
    }
  };

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
  const primaryDemoRoles = demoRoles.filter((role) => role.primary);
  const secondaryDemoRoles = demoRoles.filter((role) => !role.primary);

  const renderDemoRole = (role: DemoRole) => {
    const presentation = ROLE_PRESENTATION[role.roleKey] ?? {
      labelRu: role.roleKey,
      labelUz: role.roleKey,
      icon: Users,
    };
    const Icon = presentation.icon;
    const label = language === 'ru' ? presentation.labelRu : presentation.labelUz;
    const selected = demoLoggingIn === role.roleKey;
    return (
      <button
        key={role.roleKey}
        type="button"
        disabled={authLoading || demoLoggingIn !== null}
        onClick={() => handleDemoLogin(role.roleKey)}
        aria-label={label}
        className="flex min-h-[72px] min-w-0 items-center gap-3 rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-3 text-left transition-colors hover:bg-orange-100/70 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 touch-manipulation"
      >
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-primary-500 text-white">
          {selected ? (
            <Loader2 data-role-spinner="true" className="h-5 w-5 animate-spin" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight text-gray-900">{label}</span>
        </span>
      </button>
    );
  };

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
    <>
    {/* Demo-tenant password gate — mounted ONLY when tenant.slug === 'demo'
        and this tab hasn't unlocked yet. Renders as a fixed inset-0
        overlay so it fully occludes the login page beneath it.
        Every other tenant (myhelper, choko, my-humo, service, …) never
        mounts this — condition is exclusively `tenant?.slug === 'demo'`. */}
    {(demoBootMarked || tenant?.slug === 'demo') && demoGateOpen && (
      <DemoGate onUnlock={() => setDemoGateOpen(false)} language={language} />
    )}
    {/* Mobile app-shell in index.css locks body/#root/.layout-root to
        height:100dvh; overflow:hidden so the resident shell (fixed bars +
        single scrollable .main-content) works. /login renders outside
        <Layout>, so it inherits the page-lock with no scroll container.
        Make this div the scroll region itself: definite viewport height +
        overflow-y:auto, with m-auto-on-flex-child centering so the card
        centers when it fits the viewport and scrolls when it overflows. */}
    <div
      data-login-page
      aria-hidden={demoGateOpen ? true : undefined}
      {...(demoGateOpen ? { inert: '' } : {})}
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
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-sm font-semibold transition-all touch-manipulation ${
                  language === lang.code
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="text-[12px]">{lang.flag}</span>
                <span className="text-[12px]">{lang.label}</span>
              </button>
            ))}
          </div>
        </div>

        {tenant?.slug === 'demo' && !demoGateOpen && (
          <section aria-labelledby="demo-roles-title" className="mb-5">
            <div className="mb-3">
              <h2 id="demo-roles-title" className="text-[22px] font-extrabold leading-tight text-gray-900">
                {language === 'ru' ? 'Выберите роль' : 'Rolni tanlang'}
              </h2>
              <p className="mt-1 text-[13px] text-gray-500">
                {language === 'ru' ? 'Откройте демо одним нажатием' : 'Bir bosishda demo rejimini oching'}
              </p>
            </div>

            {demoRolesLoading && (
              <div className="space-y-2" aria-live="polite">
                <p className="text-sm text-gray-500">{language === 'ru' ? 'Загрузка ролей...' : 'Rollar yuklanmoqda...'}</p>
                <div className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-[72px] animate-pulse rounded-xl bg-gray-100" />
                  ))}
                </div>
              </div>
            )}

            {!demoRolesLoading && demoRolesError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{demoRolesError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDemoRolesReload((value) => value + 1)}
                  className="mt-2 min-h-[44px] rounded-lg px-3 font-semibold text-red-700 hover:bg-red-100 touch-manipulation"
                >
                  {language === 'ru' ? 'Повторить' : 'Qayta urinish'}
                </button>
              </div>
            )}

            {!demoRolesLoading && !demoRolesError && demoRoles.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-600">
                {language === 'ru' ? 'Демо-роли пока недоступны' : 'Demo rollar hozircha mavjud emas'}
              </div>
            )}

            {!demoRolesLoading && !demoRolesError && primaryDemoRoles.length > 0 && (
              <div role="group" aria-label={language === 'ru' ? 'Основные роли' : 'Asosiy rollar'} className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
                {primaryDemoRoles.map(renderDemoRole)}
              </div>
            )}

            {!demoRolesLoading && secondaryDemoRoles.length > 0 && (
              <details className="mt-3 group">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl px-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 touch-manipulation">
                  <span>{language === 'ru' ? 'Другие роли' : 'Boshqa rollar'}</span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div role="group" aria-label={language === 'ru' ? 'Другие роли' : 'Boshqa rollar'} className="mt-2 grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
                  {secondaryDemoRoles.map(renderDemoRole)}
                </div>
              </details>
            )}

            {displayError && !demoRolesError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{displayError}</span>
              </div>
            )}
          </section>
        )}

        <details open={tenant?.slug !== 'demo' || undefined}>
          {tenant?.slug === 'demo' && (
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl border-t border-gray-200 px-1 pt-4 text-sm font-semibold text-gray-600 touch-manipulation">
              <span>{language === 'ru' ? 'Войти вручную' : 'Qo\'lda kirish'}</span>
              <ChevronDown className="h-4 w-4" />
            </summary>
          )}
          <div className={tenant?.slug === 'demo' ? 'pt-4' : undefined}>
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
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
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
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-base text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
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
          </div>
        </details>

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
    </>
  );
}
