import { useState, useEffect, useRef, type ComponentType } from 'react';
import { Eye, EyeOff, AlertCircle, Users, UserCog, Wrench, ShieldCheck, Crown, Briefcase, Truck, Store, Building2, Home, ArrowLeft, ChevronRight, ChevronDown, Loader2, Megaphone } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore, type Language } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';
import { AppLogo } from '../components/common/AppLogo';
import { authApi } from '../services/api/auth';
import type { DemoRole } from '../types/auth';
import { TelegramActivationFlow } from '../components/auth/TelegramActivationFlow';
import { RecoveryCodeFlow } from '../components/auth/RecoveryCodeFlow';

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
  const pendingApproval = useAuthStore((state) => state.pendingApproval);
  const awaitLoginApproval = useAuthStore((state) => state.awaitLoginApproval);
  const clearPendingApproval = useAuthStore((state) => state.clearPendingApproval);
  const pendingActivation = useAuthStore((state) => state.pendingActivation);
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
  // Единый флаг "мы в демо-контексте". На native (Origin=capacitor://localhost)
  // tenant.slug пустой до успешного логина, поэтому role-picker и всё, что
  // рисуется ПОСЛЕ прохождения DemoGate, должно смотреть на этот флаг,
  // а не только на tenant?.slug === 'demo'. Иначе после закрытия гейта
  // юзер сваливается в обычную форму «Логин/Пароль».
  const isDemoContext = demoBootMarked || tenant?.slug === 'demo';

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
  const [approvalCode, setApprovalCode] = useState('');
  const [approvalCodeError, setApprovalCodeError] = useState('');
  const [approvalCodeAccepted, setApprovalCodeAccepted] = useState(false);
  const [isVerifyingApprovalCode, setIsVerifyingApprovalCode] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ru', label: 'RU', flag: '🇷🇺' },
    { code: 'uz', label: 'UZ', flag: '🇺🇿' },
  ];

  // Track which workspace row is in-flight, so we can show a spinner on
  // that exact row while the second login round-trip runs.
  const [pickingSlug, setPickingSlug] = useState<string | null>(null);

  // v12 — новый визуал login-экрана из Claude Design (Kamizo Login.dc.html):
  // небо-градиент + солнце-круг + 3 ряда домов с «загорающимися» окнами +
  // slide-to-login вместо обычной кнопки. Логика login/password/handleSubmit
  // общие для обоих визуалов; здесь только состояние slide и computed
  // deriveds для окон и солнца.
  const slideTrackRef = useRef<HTMLDivElement | null>(null);
  const [slideX, setSlideX] = useState(0);
  const [slideDragging, setSlideDragging] = useState(false);
  const [slideDone, setSlideDone] = useState(false);
  const [loginSucceeded, setLoginSucceeded] = useState(false);
  const SLIDE_TRACK_W_REF = 327; // ширина трека из макета, для scale-корректировки
  const SLIDE_KNOB = 52;
  const SLIDE_MAX = SLIDE_TRACK_W_REF - SLIDE_KNOB - 10;
  // Слои зданий из макета. Держим в useRef, чтобы окна не пересоздавались
  // на каждом рендере (иначе «случайный» порядок огней прыгал бы).
  const buildingsRef = useRef<{ w: number; h: number; cols: number; antenna?: boolean; windows: { i: number; rank: number }[] }[] | null>(null);
  if (buildingsRef.current === null) {
    const source = [
      { w: 56, h: 150, cols: 3 }, { w: 40, h: 96, cols: 2, antenna: true },
      { w: 70, h: 200, cols: 4, antenna: true }, { w: 44, h: 124, cols: 2 },
      { w: 62, h: 170, cols: 3, antenna: true }, { w: 42, h: 108, cols: 2 },
    ];
    let seed = 7, idx = 0;
    // LCG (ТЗ п.2.4) — детерминированный, воспроизводимый при каждой
    // загрузке страницы (не Math.random).
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    // 1) Создаём исходные объекты окон с {i, r} на местах в layout.
    type WinObj = { i: number; r: number; rank: number };
    const layout: { w: number; h: number; cols: number; antenna?: boolean; windows: WinObj[] }[] = source.map((b) => {
      const rows = Math.floor((b.h - 16) / 17);
      return {
        ...b,
        windows: Array.from({ length: rows * b.cols }, () => ({ i: idx++, r: rnd(), rank: 0 })),
      };
    });
    // 2) Сортируем ССЫЛКИ (без spread!), присваиваем rank прямо в layout —
    //    иначе rank установится на копиях, а оригиналы, которые рендерятся,
    //    останутся с rank=0/undefined и все окна навсегда «off».
    const all = layout.flatMap((b) => b.windows).sort((a, b) => a.r - b.r);
    all.forEach((w, k) => { w.rank = k; });
    buildingsRef.current = layout.map((b) => ({
      w: b.w, h: b.h, cols: b.cols, antenna: b.antenna,
      windows: b.windows.map((w) => ({ i: w.i, rank: w.rank })),
    }));
  }
  // Константа TOTAL_WINDOWS по ТЗ п.1.4 — сумма таблицы (21+8+40+12+27+10=118)
  // считается из BUILDINGS-layout, а не хардкодится, чтобы правка домов
  // автоматически меняла и знаменатель badge, и порог зажигания.
  const totalWindows = buildingsRef.current.reduce((s, b) => s + b.windows.length, 0);
  const typedLen = loginValue.length + password.length;
  // errorActive — форсирует сцену в «пустое» состояние (litN=0, sunLift=0,
  // slider disabled) при появлении красного блока с ошибкой, но поля НЕ
  // стирает и текст ошибки не гасит.
  const [errorActive, setErrorActive] = useState(false);
  // errorSnapshotLen — длина текста на момент edit'а ПОСЛЕ ошибки. Нужно,
  // чтобы после сброса errorActive сцена не «вспыхивала» с 0 до max при
  // стирании (пользователь стёр 1 символ из 20 → typedLen=19 → без
  // snapshot litN мгновенно скакал бы в 94). Формула:
  //   effective = errorActive
  //             ? 0
  //             : (snapshot > 0 ? max(0, typedLen - snapshot) : typedLen)
  // Snapshot сам сбрасывается в 0, когда typedLen становится 0 (см.
  // useEffect ниже) — пользователь полностью очистил поле, и с этого
  // момента сцена снова считает нормально.
  const [errorSnapshotLen, setErrorSnapshotLen] = useState(0);
  const effectiveTypedLen = errorActive
    ? 0
    : errorSnapshotLen > 0
      ? Math.max(0, typedLen - errorSnapshotLen)
      : typedLen;
  useEffect(() => {
    if (errorSnapshotLen > 0 && typedLen === 0) setErrorSnapshotLen(0);
  }, [typedLen, errorSnapshotLen]);
  // Каноничные пропорции из макета Kamizo Login.dc.html (п.2.4-2.5):
  //   litN     = round(TOTAL * 0.8 * min(1, typedLen / 16))
  //   sunLift  =            min(1, typedLen / 16) * 0.75
  // При slideDone (успешный вход) — все 118 окон горят, sunLift = 1.
  const litN = slideDone ? totalWindows : Math.round(totalWindows * 0.8 * Math.min(1, effectiveTypedLen / 16));
  const sunLift = slideDone ? 1 : Math.min(1, effectiveTypedLen / 16) * 0.75;
  const sunTopPx = 330 - sunLift * 230;
  const skyGradient = slideDone
    ? 'linear-gradient(180deg,#FFEDD5 0%,#FED7AA 48%,#FFFFFF 100%)'
    : 'linear-gradient(180deg,#FFF7ED 0%,#FFEDD5 48%,#FFFFFF 100%)';
  const canSubmit = !errorActive && !!loginValue && !!password && !authLoading;

  // Slide-to-login: pointer drag на knob → при отпускании > 80% ширины →
  // вызвать handleSubmit (эквивалент кнопки Войти). Тот же паттерн, что
  // в макете (native pointer events, без сторонних библиотек).
  useEffect(() => {
    // Любая ошибка входа (сервер / валидация / внутренняя) → сцена
    // возвращается в «пустое» визуально: окна гаснут, солнце опускается,
    // slider возвращается на 0. Поля НЕ стираются, красный блок ошибки
    // остаётся видимым — errorActive сбрасывается только на первом
    // изменении логина/пароля (см. handleFieldEdit ниже).
    const hasError = !!(error || authError);
    if (hasError) {
      setErrorActive(true);
      if (slideDone) setSlideDone(false);
      setSlideX(0);
    }
  }, [error, authError, slideDone]);
  // Общий helper — сбрасывает errorActive и старую ошибку при
  // редактировании любого поля. Красный блок с текстом ошибки исчезает
  // именно тут (как «уже сейчас реализовано» — при новом наборе).
  const handleFieldEdit = () => {
    if (errorActive) {
      // Snapshot текущей длины: любые последующие уменьшения typedLen
      // будут «съедать» этот баланс, а не открывать окна разом.
      setErrorSnapshotLen(loginValue.length + password.length);
      setErrorActive(false);
    }
    if (error) setError('');
    // authError чистит authStore на следующем login attempt — не трогаем.
  };
  // Reset only after an actual authenticated login. slideDone is set before
  // the request to preserve the completion animation, but picker/approval
  // outcomes still need the entered credentials and must never arm this timer.
  useEffect(() => {
    if (!loginSucceeded) return;
    const t = window.setTimeout(() => {
      setSlideDone(false);
      setSlideX(0);
      setLoginSucceeded(false);
      setLoginValue('');
      setPassword('');
      setShowPassword(false);
    }, 4200);
    return () => window.clearTimeout(t);
  }, [loginSucceeded]);
  const slideCleanupRef = useRef<(() => void) | null>(null);
  const startSlideDrag = (e: React.PointerEvent) => {
    if (!canSubmit || slideDone) return;
    e.preventDefault();
    const el = slideTrackRef.current;
    const scale = el ? el.getBoundingClientRect().width / SLIDE_TRACK_W_REF : 1;
    const startX = e.clientX;
    setSlideDragging(true);
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(SLIDE_MAX, (ev.clientX - startX) / scale));
      setSlideX(x);
    };
    const up = () => {
      cleanup();
      setSlideDragging(false);
      // Читаем актуальный slideX через setState-callback, чтобы не завязываться на closure.
      setSlideX((current) => {
        if (current > SLIDE_MAX * 0.8) {
          setSlideDone(true);
          // Триггерим login flow как обычная submit-кнопка. Через
          // setTimeout(0), чтобы React успел зафиксировать done-state
          // и sky-gradient сменился до сетевого запроса.
          window.setTimeout(() => {
            // Fake FormEvent для handleSubmit — ему нужна только preventDefault.
            handleSubmit({ preventDefault: () => {} } as React.FormEvent);
          }, 0);
          return SLIDE_MAX;
        }
        return 0;
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      slideCleanupRef.current = null;
    };
    slideCleanupRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  useEffect(() => () => { slideCleanupRef.current?.(); }, []);

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

  const navigateAfterLogin = () => {
    const requested = new URLSearchParams(window.location.search).get('returnTo');
    const target = requested?.startsWith('/') && !requested.startsWith('//')
      ? requested
      : '/';
    window.history.replaceState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const finishTelegramApproval = async () => {
    const result = await awaitLoginApproval();
    if (result === 'denied') {
      setError(language === 'ru' ? 'Вход отклонён в Telegram.' : 'Kirish Telegramda rad etildi.');
    } else if (result === 'expired') {
      setError(language === 'ru' ? 'Время подтверждения истекло.' : 'Tasdiqlash vaqti tugadi.');
    } else if (result === 'success') {
      setLoginSucceeded(true);
      navigateAfterLogin();
    }
  };

  // Re-request a fresh code on the other enabled channel (Telegram ⇄ email).
  // clearPendingApproval stops the previous poll (it returns 'error', which
  // finishTelegramApproval ignores); the re-login sends a new code and sets a
  // new pending request, then we start a poll for it.
  const [switchingChannel, setSwitchingChannel] = useState<'email' | 'telegram' | null>(null);
  const switchApprovalChannel = async (ch: 'email' | 'telegram') => {
    if (switchingChannel) return;
    setSwitchingChannel(ch);
    setApprovalCode('');
    setApprovalCodeError('');
    setError('');
    clearPendingApproval();
    try {
      const outcome = await login(loginValue, password, undefined, ch);
      if (outcome === 'approval') void finishTelegramApproval();
      else if (outcome === 'success') navigateAfterLogin();
    } finally {
      setSwitchingChannel(null);
    }
  };

  const handleVerifyApprovalCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingApproval || !/^\d{6}$/.test(approvalCode) || isVerifyingApprovalCode) return;
    setIsVerifyingApprovalCode(true);
    setApprovalCodeError('');
    try {
      const result = await authApi.verifyLoginApprovalCode(pendingApproval.requestId, approvalCode);
      if (result.verified) {
        setApprovalCodeAccepted(true);
        return;
      }
      if (result.status === 'expired') {
        setApprovalCodeError(language === 'ru' ? 'Код истёк. Войдите заново.' : 'Kod muddati tugadi. Qaytadan kiring.');
      } else if (result.status === 'denied') {
        setApprovalCodeError(language === 'ru' ? 'Попытки закончились. Войдите заново.' : 'Urinishlar tugadi. Qaytadan kiring.');
      } else {
        setApprovalCodeError(language === 'ru'
          ? `Неверный код. Осталось попыток: ${result.remainingAttempts}`
          : `Kod noto‘g‘ri. Qolgan urinishlar: ${result.remainingAttempts}`);
      }
    } catch (verificationError: unknown) {
      setApprovalCodeError(verificationError instanceof Error
        ? verificationError.message
        : (language === 'ru' ? 'Не удалось проверить код' : 'Kodni tekshirib bo‘lmadi'));
    } finally {
      setIsVerifyingApprovalCode(false);
    }
  };

  useEffect(() => {
    if (!pendingApproval) {
      setApprovalCode('');
      setApprovalCodeError('');
      setApprovalCodeAccepted(false);
    }
  }, [pendingApproval]);

  useEffect(() => {
    if (!isDemoContext || demoGateOpen) return;
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
  }, [isDemoContext, demoGateOpen, demoRolesReload, language]);

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
      const outcome = await login(loginValue, password);
      // outcome === 'picker' → the workspace picker render below opens
      //   (driven by store.pickerTenants); password stays in this
      //   component's useState for the re-submit.
      // outcome === 'success' → App re-renders with Layout when user is set.
      if (outcome === 'approval') {
        await finishTelegramApproval();
      } else if (outcome === 'success') {
        setLoginSucceeded(true);
        navigateAfterLogin();
      } else if (outcome === 'picker') {
        setSlideDone(false);
        setSlideX(0);
      }
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
      const outcome = await login(loginValue, password, slug);
      if (outcome === 'approval') await finishTelegramApproval();
      else if (outcome === 'success') navigateAfterLogin();
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
        className="flex min-h-[84px] min-w-0 flex-col justify-center text-center items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/70 px-2 py-3 transition-colors hover:bg-orange-100/70 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 touch-manipulation"
      >
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-primary-500 text-white">
          {selected ? (
            <Loader2 data-role-spinner="true" className="h-5 w-5 animate-spin" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block break-words text-[12px] font-semibold leading-tight text-gray-900">{label}</span>
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

      {/* v12 — Kamizo Login.dc.html: НОВЫЙ визуал только для не-demo и когда
          нет workspace-picker / approval-flow. Demo-tenant остаётся на
          старой карточке с ролевым picker'ом (там своя UX-логика).
          Ветка ниже покрывает основной поток на apex/tenant-домах. */}
      {!isDemoContext && !(pickerTenants && pickerTenants.length > 0) && !pendingApproval && (
        <div
          className="relative min-h-full w-full overflow-hidden"
          style={{ background: skyGradient, transition: 'background 1s cubic-bezier(.3,.8,.2,1)' }}
        >
          {/* Sun */}
          <div
            style={{
              position: 'absolute', left: '50%', width: 200, height: 200, marginLeft: -100,
              borderRadius: '50%', background: '#FB923C', top: sunTopPx,
              boxShadow: '0 0 0 22px rgba(251,146,60,.12), 0 0 0 48px rgba(251,146,60,.06), 0 20px 60px rgba(249,115,22,.25)',
              transition: 'top 1s cubic-bezier(.3,.8,.2,1)',
              pointerEvents: 'none',
            }}
          />

          {/* Header row — logo + language toggle */}
          <div style={{ position: 'relative', paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AppLogo size="md" forceDefault />
                <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1, color: '#141413' }}>Kamizo</div>
              </div>
              <div style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'rgba(20,20,19,.05)', gap: 2 }}>
                {(['ru', 'uz'] as const).map((lg) => {
                  const on = language === lg;
                  return (
                    <button
                      key={lg}
                      type="button"
                      onClick={() => setLanguage(lg)}
                      style={{
                        border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                        padding: '7px 11px', borderRadius: 999,
                        background: on ? '#F97316' : 'transparent',
                        color: on ? '#FFFFFF' : '#141413',
                        boxShadow: on ? '0 4px 12px rgba(249,115,22,0.30)' : 'none',
                        transition: 'all .2s',
                      }}
                    >
                      {lg.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Buildings — three overlaid rows */}
          {/* Far row (silhouettes) */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 150, height: 260, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 6px', pointerEvents: 'none' }}>
            <div style={{ width: 34, height: 150, background: '#FDEFDF', borderRadius: '6px 6px 0 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 3, height: 26, background: '#FFEDD5' }} />
              <div style={{ width: 18, height: 20, background: '#FDEFDF', borderRadius: '9px 9px 0 0' }} />
              <div style={{ width: 30, height: 190, background: '#FFEDD5' }} />
            </div>
            <div style={{ width: 52, height: 170, background: '#FDEFDF', borderRadius: '6px 6px 0 0' }} />
            <div style={{ width: 40, height: 205, background: '#FDEFDF', borderRadius: '20px 20px 0 0' }} />
            <div style={{ width: 46, height: 160, background: '#FDEFDF', borderRadius: '6px 6px 0 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 3, height: 30, background: '#FFEDD5' }} />
              <div style={{ width: 26, height: 200, background: '#FFEDD5' }} />
            </div>
            <div style={{ width: 44, height: 140, background: '#FDEFDF', borderRadius: '6px 6px 0 0' }} />
          </div>

          {/* Mid row (плоские силуэты для перспективы) */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 170, height: 240, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, pointerEvents: 'none' }}>
            {[
              { w: 44, h: 168 }, { w: 58, h: 140 }, { w: 36, h: 196 },
              { w: 62, h: 150 }, { w: 40, h: 186 }, { w: 54, h: 132 },
            ].map((b, i) => (
              <div key={i} style={{ width: b.w, height: b.h, background: '#FAE7D3', borderRadius: '8px 8px 0 0' }} />
            ))}
          </div>

          {/* Front row — с реальными окнами, которые «загораются» */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 170, height: 240, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, pointerEvents: 'none' }}>
            {buildingsRef.current.map((bd, bi) => (
              <div
                key={bi}
                style={{
                  position: 'relative', width: bd.w, height: bd.h,
                  background: '#F1D3B5', borderTop: '3px solid #E5C4A0',
                  borderRadius: '10px 10px 0 0', padding: '12px 8px 0', boxSizing: 'border-box',
                  display: 'grid', gridTemplateColumns: `repeat(${bd.cols}, 1fr)`,
                  alignContent: 'start', gap: '8px 7px',
                }}
              >
                {bd.antenna && (
                  <div style={{ position: 'absolute', left: '50%', top: -17, width: 2, height: 14, marginLeft: -1, background: '#E5C4A0', borderRadius: 1 }} />
                )}
                {bd.windows.map((w) => {
                  const on = w.rank < litN;
                  return (
                    <div
                      key={w.i}
                      style={{
                        height: 8, borderRadius: 2,
                        // Тёплый жёлто-оранжевый «свет из окна» (близкий
                        // к брендовому #F97316, но мягче — как лампа
                        // накаливания). Off — тёмная стена #7B4A2E.
                        background: on ? '#FFD9A0' : '#7B4A2E',
                        boxShadow: on ? '0 0 8px 2px rgba(255,200,120,0.75), 0 0 2px 1px rgba(255,180,90,0.9) inset' : 'none',
                        transition: 'background .35s, box-shadow .35s',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Bottom sheet — login form */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0, top: 392, bottom: 0,
              background: '#FFFFFF', borderRadius: '32px 32px 0 0',
              boxShadow: '0 -18px 40px -12px rgba(217,119,87,.18)',
              padding: '26px 24px calc(env(safe-area-inset-bottom, 0px) + 24px)',
              overflow: 'auto',
            }}
          >
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#141413' }}>
                  {slideDone
                    ? (language === 'ru' ? 'Добро пожаловать!' : 'Xush kelibsiz!')
                    : (language === 'ru' ? 'Вход в кабинет' : 'Kabinetga kirish')}
                </div>
                <div
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 999,
                    background: slideDone ? 'rgba(90,155,94,.14)' : '#FFEDD5',
                    color: slideDone ? '#5A9B5E' : '#EA580C',
                    transition: 'all .3s',
                  }}
                >
                  {litN}/{totalWindows}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label
                  style={{
                    display: 'block', height: 62, boxSizing: 'border-box',
                    borderRadius: 18, padding: '10px 16px 0', background: '#FFFFFF',
                    border: '1.5px solid #F0EFEB',
                    cursor: 'text',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#8a8985', marginBottom: 3 }}>
                    {language === 'ru' ? 'Логин' : 'Login'}
                  </div>
                  <input
                    value={loginValue}
                    onChange={(e) => { setLoginValue(normalizeAuthField(e.target.value)); handleFieldEdit(); }}
                    placeholder={language === 'ru' ? 'например, a.karimov' : 'masalan, a.karimov'}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{
                      width: '100%', fontFamily: 'inherit', fontSize: 17, fontWeight: 600,
                      color: '#141413', background: 'transparent', border: 0, padding: 0,
                      caretColor: '#F97316', outline: 'none',
                    }}
                  />
                </label>
                <label
                  style={{
                    display: 'flex', alignItems: 'center', height: 62, boxSizing: 'border-box',
                    borderRadius: 18, padding: '0 8px 0 16px', background: '#FFFFFF',
                    border: '1.5px solid #F0EFEB',
                    cursor: 'text',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#8a8985', marginBottom: 3 }}>
                      {language === 'ru' ? 'Пароль' : 'Parol'}
                    </div>
                    <input
                      value={password}
                      onChange={(e) => { setPassword(normalizeAuthField(e.target.value)); handleFieldEdit(); }}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      style={{
                        width: '100%', fontFamily: 'inherit', fontSize: 17, fontWeight: 600,
                        color: '#141413', background: 'transparent', border: 0, padding: 0,
                        caretColor: '#F97316', outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowPassword((v) => !v); }}
                    aria-label={showPassword ? (language === 'ru' ? 'Скрыть пароль' : "Yashirish") : (language === 'ru' ? 'Показать пароль' : "Ko'rsatish")}
                    style={{
                      flex: 'none', width: 44, height: 44, border: 0, borderRadius: 22,
                      cursor: 'pointer', background: 'transparent', color: '#8a8985',
                      display: 'grid', placeItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </label>
              </div>

              {displayError && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 14,
                  background: '#FEECEB', border: '1px solid #FCD9D6', color: '#B42318',
                  fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{displayError}</span>
                </div>
              )}

              {/* Slide-to-login track */}
              <div
                ref={slideTrackRef}
                style={{
                  position: 'relative', marginTop: 18, height: 62, borderRadius: 31,
                  background: canSubmit ? '#FFEDD5' : '#F0EFEB',
                  transition: 'background .4s', overflow: 'hidden', userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                {/* Fill */}
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: slideDone ? '100%' : (canSubmit ? slideX + SLIDE_KNOB + 10 : 0) + 'px',
                    background: slideDone ? 'linear-gradient(90deg,#7FB981,#5A9B5E)' : '#F97316',
                    borderRadius: 31,
                    transition: slideDragging ? 'none' : 'width .4s cubic-bezier(.3,.8,.2,1)',
                  }}
                />
                {/* Label — при errorActive показываем красный
                    «Неверный логин или пароль» прямо на слайдере (кроме
                    отдельного блока ошибки под полями). Держим до
                    первого edit'а — тот же handleFieldEdit сбрасывает. */}
                <div
                  style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', paddingLeft: 40, paddingRight: 12,
                    fontSize: errorActive ? 14 : 15, fontWeight: 700,
                    color: errorActive
                      ? '#B42318'
                      : slideDone ? '#FFFFFF' : canSubmit ? '#EA580C' : '#8a8985',
                    opacity: slideDone ? 1 : errorActive ? 1 : 1 - (slideX / SLIDE_MAX) * 1.2,
                    transition: 'color .3s', pointerEvents: 'none',
                    textAlign: 'center', letterSpacing: '-0.005em',
                  }}
                >
                  {errorActive
                    ? (language === 'ru' ? 'Неверный логин или пароль' : "Login yoki parol noto'g'ri")
                    : slideDone
                      ? (language === 'ru' ? 'Готово ✓' : 'Tayyor ✓')
                      : canSubmit
                        ? (language === 'ru' ? 'Проведите, чтобы войти  ›››' : 'Kirish uchun suring  ›››')
                        : (language === 'ru' ? 'Заполните поля' : "Maydonlarni to'ldiring")}
                </div>
                {/* Knob */}
                <div
                  onPointerDown={startSlideDrag}
                  role="button"
                  aria-label={language === 'ru' ? 'Войти' : 'Kirish'}
                  style={{
                    position: 'absolute', top: 5, left: 5, width: 52, height: 52, borderRadius: 26,
                    background: slideDone ? '#FFFFFF' : canSubmit ? '#F97316' : '#F4F0E8',
                    color: slideDone ? '#5A9B5E' : canSubmit ? '#FFFFFF' : '#8a8985',
                    display: 'grid', placeItems: 'center',
                    cursor: canSubmit && !slideDone ? 'grab' : 'default',
                    touchAction: 'none',
                    transform: `translateX(${slideX}px)`,
                    transition: slideDragging ? 'none' : 'transform .4s cubic-bezier(.3,.8,.2,1.2)',
                    boxShadow: slideDone ? '0 6px 14px -6px rgba(90,155,94,.45)'
                      : canSubmit ? '0 4px 12px rgba(249,115,22,0.30)' : 'none',
                  }}
                >
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d={slideDone ? 'M5 12l5 5 9-10' : 'M5 12h14M13 6l6 6-6 6'} />
                  </svg>
                </div>
              </div>

              {tenant?.slug && (
                <button
                  type="button"
                  onClick={() => setRecoveryOpen(true)}
                  style={{
                    marginTop: 10, width: '100%', background: 'transparent', border: 0,
                    padding: '8px 0', fontSize: 13, fontWeight: 500, color: '#8a8985', cursor: 'pointer',
                  }}
                >
                  {language === 'ru' ? 'Войти по резервному коду' : 'Zaxira kodi bilan kirish'}
                </button>
              )}

              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, fontWeight: 500, color: '#8a8985' }}>
                Kamizo CRM · {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legacy карточка: demo-tenant + workspace picker + любой fallback.
          Оставлена как есть — там DemoGate/role-picker/tenants-выбор. */}
      {(isDemoContext || (pickerTenants && pickerTenants.length > 0) || pendingApproval) && (
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

        {isDemoContext && !demoGateOpen && (
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
                <div className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-3">
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
              <div role="group" aria-label={language === 'ru' ? 'Основные роли' : 'Asosiy rollar'} className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-3">
                {primaryDemoRoles.map(renderDemoRole)}
              </div>
            )}

            {!demoRolesLoading && secondaryDemoRoles.length > 0 && (
              <details className="mt-3 group">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl px-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 touch-manipulation">
                  <span>{language === 'ru' ? 'Другие роли' : 'Boshqa rollar'}</span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div role="group" aria-label={language === 'ru' ? 'Другие роли' : 'Boshqa rollar'} className="mt-2 grid grid-cols-1 gap-2 min-[340px]:grid-cols-3">
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

        <details open={!isDemoContext || undefined}>
          {isDemoContext && (
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl border-t border-gray-200 px-1 pt-4 text-sm font-semibold text-gray-600 touch-manipulation">
              <span>{language === 'ru' ? 'Войти вручную' : 'Qo\'lda kirish'}</span>
              <ChevronDown className="h-4 w-4" />
            </summary>
          )}
          <div className={isDemoContext ? 'pt-4' : undefined}>
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
          {tenant?.slug && tenant.slug !== 'demo' && (
            <button type="button" onClick={() => setRecoveryOpen(true)} className="w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-800">
              {language === 'ru' ? 'Войти по резервному коду' : 'Zaxira kodi bilan kirish'}
            </button>
          )}
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
      )}

      {pendingActivation && <TelegramActivationFlow />}
      {recoveryOpen && tenant?.slug && <RecoveryCodeFlow tenantSlug={tenant.slug} onClose={() => setRecoveryOpen(false)} />}

      {pendingApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 px-6" style={{ height: '100svh' }}>
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
              <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
            </div>
            <h2 className="mb-2 text-lg font-semibold">
              {language === 'ru' ? 'Подтвердите вход' : 'Kirishni tasdiqlang'}
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              {pendingApproval.channel === 'email'
                ? (language === 'ru'
                    ? `Введите код, отправленный на ${pendingApproval.maskedEmail || 'вашу почту'}.`
                    : `${pendingApproval.maskedEmail || 'pochtangizga'} yuborilgan kodni kiriting.`)
                : (language === 'ru'
                    ? 'Введите код из Telegram или нажмите «Это я» в сообщении бота.'
                    : 'Telegramdagi kodni kiriting yoki bot xabaridagi «Bu men» tugmasini bosing.')}
            </p>
            <form onSubmit={handleVerifyApprovalCode} className="mb-4 space-y-3">
              <input
                value={approvalCode}
                onChange={event => setApprovalCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                aria-label={language === 'ru' ? 'Код из Telegram' : 'Telegram kodi'}
                placeholder="000000"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
              {approvalCodeError && <p className="text-sm text-red-600">{approvalCodeError}</p>}
              {approvalCodeAccepted && (
                <p className="text-sm text-green-600">
                  {language === 'ru' ? 'Код принят. Выполняется вход…' : 'Kod qabul qilindi. Kirilmoqda…'}
                </p>
              )}
              <button
                type="submit"
                disabled={approvalCode.length !== 6 || isVerifyingApprovalCode || approvalCodeAccepted}
                className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isVerifyingApprovalCode
                  ? (language === 'ru' ? 'Проверяем…' : 'Tekshirilmoqda…')
                  : (language === 'ru' ? 'Подтвердить код' : 'Kodni tasdiqlash')}
              </button>
            </form>
            {pendingApproval.availableChannels && pendingApproval.availableChannels.length > 1 && (
              <div className="mb-4 flex items-center justify-center gap-2 text-sm">
                <span className="text-gray-400">{language === 'ru' ? 'Код:' : 'Kod:'}</span>
                {pendingApproval.availableChannels.map((ch) => {
                  const active = pendingApproval.channel === ch;
                  const label = ch === 'email'
                    ? (language === 'ru' ? 'на почту' : 'pochtaga')
                    : 'Telegram';
                  return (
                    <button
                      key={ch}
                      type="button"
                      disabled={active || !!switchingChannel}
                      onClick={() => switchApprovalChannel(ch)}
                      className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                        active ? 'bg-primary-100 text-primary-700' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      } disabled:opacity-60`}
                    >
                      {switchingChannel === ch ? '…' : label}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => { clearPendingApproval(); setError(''); setApprovalCode(''); }}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
          </div>
        </div>
      )}

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
