import { useState, useMemo, useEffect, useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModalPresence } from '../stores/modalStore';
import {
  FileText, QrCode, CreditCard, Star,
  Building2, Home, Users, Phone,
  Key, ShieldCheck, Globe, Bell, Download, Moon,
  Check, Pencil, ChevronRight, LogOut,
  X, Loader2, Eye, EyeOff, AlertCircle, Save,
  Shield,
} from 'lucide-react';
import { ThemeToggle } from '../components/common';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { useRequestStore } from '../stores/dataStore';
import { useTenantStore } from '../stores/tenantStore';
import { useBuildingStore } from '../stores/buildingStore';
import { formatName } from '../utils/formatName';
import { formatPhone } from '../utils/formatPhone';
import { InstallAppSection } from '../components/InstallAppSection';
// v118.91 — Capacitor runtime detection so the "Установить как
// приложение" item can be hidden when we're already in the native iOS/
// Android app (where there is nothing to "install"). Apple sometimes
// flags such no-op rows on App Store review.
import { Capacitor } from '@capacitor/core';
import { RoleAvatar } from '../components/RoleAvatar';
import { generateQRCode } from '../components/LazyQRCode';
import { API_URL, getToken } from '../services/api/client';
import { downloadBlob } from '../utils/downloadFile';

// ─── Page implements Claude Design §07-profil. Source of truth lives in
//     design/handoff/profile-handoff.md. Visual structure (hero / tiles /
//     sections / logout / version) follows that spec; data + interactions
//     stay wired to the existing authStore, requestStore and InstallApp /
//     QR utilities. Do not redesign here without updating the handoff. ───

// ── shared visual helpers ───────────────────────────────────────────────
//
// Tokens reference CSS custom properties with the EXISTING hex as the
// fallback. That keeps the light look pixel-identical for every user
// who hasn't opted into dark mode. When the user enables dark via the
// ThemeProvider (sets `html.dark`), index.css's `html.dark` block
// overrides the same --rpp-* tokens with their dark equivalents — the
// whole page flips without any per-component branching.
const SURFACE = 'var(--rpp-surface, #FFFFFF)';
const SURFACE_SUNKEN = 'var(--rpp-surface-sunken, #EDE7DB)';
const BORDER = 'var(--rpp-border, #E6DFD2)';
const HAIRLINE = 'var(--rpp-hairline, rgba(28,25,23,0.06))';
const TEXT_PRIMARY = 'var(--rpp-text-primary, #1C1917)';
const TEXT_SECONDARY = 'var(--rpp-text-secondary, #6F6A62)';
const TEXT_MUTED = 'var(--rpp-text-muted, #A8A29E)';
const TEXT_ON_DARK = '#F4F0E8';
// Reuse the dashboard's --app-bg (set in index.css :root) so the page
// background matches the body and there is no tonal seam between this
// page and the surrounding shell (no perceived "white strips" on the
// sides or below the scroll content). `--rpp-bg` is undefined in the
// light path so this falls back to the global --app-bg verbatim.
const APP_BG = 'var(--rpp-bg, var(--app-bg))';
const BRAND_TINT = 'var(--rpp-brand-tint, #FFF3EA)';
const BRAND_DARK = '#EA580C';
const STATUS_CRITICAL = '#E2483D';
const STATUS_ACTIVE = '#15A06E';
const STATUS_ACTIVE_BG = 'rgba(21,160,110,0.12)';
const STATUS_INFO_BG = 'rgba(47,119,194,0.12)';
const SHADOW_SM = 'var(--rpp-shadow-sm, 0 1px 2px rgba(28,25,23,0.04))';

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const formatJoinDate = (iso: string | undefined, lang: 'ru' | 'uz'): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { month: 'long' });
  const year = d.getFullYear();
  return lang === 'ru' ? `с ${month} ${year}` : `${month} ${year} dan`;
};

const maskPhone = (raw: string | undefined): string => {
  const pretty = formatPhone(raw || '');
  if (!pretty) return '';
  // formatPhone → "+998 90 100 00 11" → "+998 (90) ··· 00 11"
  const parts = pretty.split(' ');
  if (parts.length !== 5) return pretty;
  return `${parts[0]} (${parts[1]}) ··· ${parts[3]} ${parts[4]}`;
};

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || '2.4.1';

export function ResidentProfilePage() {
  const navigate = useNavigate();
  const { user, changePassword, updateProfile, logout, refreshUser } = useAuthStore();
  // Pull a fresh /api/users/me on mount so manager-set fields the
  // resident can't edit themselves (personal_account, building link,
  // contract status …) appear without forcing the resident to log out
  // and back in. Cheap — one GET per profile visit.
  useEffect(() => { void refreshUser(); }, [refreshUser]);

  // Dark mode graduated from the test-account pilot to a real, app-wide
  // theme. The page's CSS-var tokens (--rpp-* + globals) now resolve
  // via the `html.dark` class that ThemeProvider sets/unsets based on
  // the user's persisted choice. No per-page gate, no test-account
  // check — the toggle that drives it lives in the "Приложение"
  // settings section below.
  const { language, setLanguage } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const getRequestsByResident = useRequestStore(s => s.getRequestsByResident);
  // УК (управляющая компания) identity for the new "Управляющая
  // компания" card. Logo + name come from /api/tenant/config (already
  // populated by the auth bootstrap); the ЖК card pulls the real
  // building name/address from buildingStore (lazy-loaded once on mount
  // when the user has a buildingId).
  const tenantConfig = useTenantStore(s => s.config?.tenant);
  // Sprint 85 commit 3 — refresh /api/tenant/config on profile open so the
  // "Договор управления" section reflects any super-admin / director
  // change since the resident last booted the app (upload, replace,
  // delete). Cheap — single GET, same pattern as refreshUser() above.
  const refetchTenantConfig = useTenantStore(s => s.fetchConfig);
  useEffect(() => { void refetchTenantConfig(); }, [refetchTenantConfig]);
  const tenantContract = tenantConfig?.contract ?? null;
  const [contractDownloading, setContractDownloading] = useState(false);
  const fetchBuildingById = useBuildingStore(s => s.fetchBuildingById);
  const residentBuilding = useBuildingStore(s =>
    user?.buildingId ? s.buildings.find(b => b.id === user.buildingId) : undefined
  );
  useEffect(() => {
    if (user?.buildingId && !residentBuilding) {
      fetchBuildingById(user.buildingId);
    }
  }, [user?.buildingId, residentBuilding, fetchBuildingById]);

  // ── modal / inline-edit state ────────────────────────────────────────
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState(user?.phone || '');
  const [phoneSaving, setPhoneSaving] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  // Hero pencil drives this — opens an edit-profile sheet with name + phone
  // fields wired to authStore.updateProfile. The old behavior (silently
  // toggling the off-screen phone-edit row) read as "button doesn't work".
  const [showEditProfile, setShowEditProfile] = useState(false);

  // Generate the QR pass lazily, only the first time the sheet opens
  useEffect(() => {
    if (!showQrModal || !user || qrUrl) return;
    let cancelled = false;
    (async () => {
      const text = [
        `ФИО: ${user.name}`,
        `Логин: ${user.login}`,
        user.address ? `Адрес: ${user.address}` : null,
        user.apartment ? `Кв: ${user.apartment}` : null,
        user.phone ? `Тел: ${user.phone}` : null,
      ].filter(Boolean).join('\n');
      const url = await generateQRCode(text, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1C1917', light: '#ffffff' },
      });
      if (!cancelled) setQrUrl(url);
    })();
    return () => { cancelled = true; };
  }, [showQrModal, user, qrUrl]);

  const t = useMemo(() => language === 'ru' ? {
    role_resident: 'Собственник',
    role_tenant: 'Арендатор',
    role_commercial: 'Владелец',
    verified: 'Верифицирован',
    statRequests: 'заявок',
    statRating: 'рейтинг',
    statPoints: 'баллов',
    tileContract: 'Договор',
    tileQR: 'QR пропуск',
    tilePayment: 'Оплата',
    tileBonus: 'Бонусы',
    qrActive: 'Активен',
    sectionHome: 'Дом и квартира',
    sectionSecurity: 'Безопасность',
    sectionApp: 'Приложение',
    address: 'Адрес',
    apartment: 'Квартира',
    personalAccount: 'Лицевой счёт',
    personalAccountCopied: 'Скопировано',
    household: 'Состав семьи',
    phone: 'Телефон',
    changePass: 'Сменить пароль',
    twoFA: 'Двухфакторная защита',
    twoFAValue: 'Включена',
    appLanguage: 'Язык',
    langName: 'Русский',
    notifications: 'Уведомления',
    notifValue: 'Все',
    darkMode: 'Тёмная тема',
    installApp: 'Установить как приложение',
    privacyPolicy: 'Политика конфиденциальности',
    legalSection: 'Юридическая информация',
    // v118.117 — `deleteAccount*` keys removed (button + handler
    // gone, see component body). `infoDeleteAccount` is the
    // replacement App-Store-compliance info line shown to residents.
    infoDeleteAccount: 'Для удаления аккаунта обратитесь в вашу управляющую компанию.',
    logout: 'Выйти из аккаунта',
    logoutConfirm: 'Выйти из аккаунта?',
    notSet: 'Не указан',
    save: 'Сохранить',
    cancel: 'Отмена',
    edit: 'Изменить',
    passwordTitle: 'Сменить пароль',
    currentPassword: 'Текущий пароль',
    newPassword: 'Новый пароль',
    confirmPassword: 'Подтвердите пароль',
    minChars: 'Минимум 4 символа',
    repeatPassword: 'Повторите новый пароль',
    passwordChanged: 'Пароль успешно изменён',
    phoneSaved: 'Телефон сохранён',
    profileSaved: 'Профиль сохранён',
    editProfileTitle: 'Редактировать профиль',
    nameLabel: 'Имя',
    namePlaceholder: 'Ваше имя',
    nameRequired: 'Введите имя',
    wrongPassword: 'Неверный текущий пароль',
    passwordsNotMatch: 'Пароли не совпадают',
    passwordSameAsOld: 'Новый пароль должен отличаться от текущего',
    enterCurrentPassword: 'Введите текущий пароль',
    passwordTooShort: 'Пароль должен быть минимум 4 символа',
    passwordError: 'Ошибка при смене пароля',
    qrSubtitle: 'QR-код для пропуска и подписания документов',
    versionLabel: 'версия',
    sectionUk: 'Управляющая компания',
    ukEyebrow: 'Управляющая компания',
    ukBuildingLine: 'Жилой комплекс',
    contractSectionTitle: 'Договор управления',
    contractDownloadBtn: 'Скачать договор',
    contractHelpWithName: (uk: string) => `Договор управления многоквартирным домом с УК ${uk}`,
    contractHelpNoName: 'Договор управления многоквартирным домом с вашей УК',
    contractEmptyTitle: 'Договор ещё не загружен',
    contractEmptyHelp: 'Обратитесь в управляющую компанию, чтобы они загрузили договор управления',
    contractDownloadSuccess: 'Договор скачан',
    contractDownloadNetwork: 'Не удалось скачать. Проверьте подключение.',
    contractDownloadGone: 'Договор больше не доступен. Обновите страницу.',
  } : {
    role_resident: 'Egasi',
    role_tenant: 'Ijarachi',
    role_commercial: 'Egasi',
    verified: 'Tasdiqlangan',
    statRequests: 'ariza',
    statRating: 'reyting',
    statPoints: 'ball',
    tileContract: 'Shartnoma',
    tileQR: 'QR ruxsat',
    tilePayment: "To'lov",
    tileBonus: 'Bonuslar',
    qrActive: 'Faol',
    sectionHome: 'Uy va kvartira',
    sectionSecurity: 'Xavfsizlik',
    sectionApp: 'Ilova',
    address: 'Manzil',
    apartment: 'Kvartira',
    personalAccount: 'Hisob raqami',
    personalAccountCopied: 'Nusxalandi',
    household: 'Oila tarkibi',
    phone: 'Telefon',
    changePass: "Parolni o'zgartirish",
    twoFA: 'Ikki bosqichli himoya',
    twoFAValue: 'Yoqilgan',
    appLanguage: 'Til',
    langName: "O'zbekcha",
    notifications: 'Bildirishnomalar',
    notifValue: 'Hammasi',
    darkMode: 'Tungi rejim',
    installApp: 'Ilova sifatida oʼrnatish',
    privacyPolicy: 'Maxfiylik siyosati',
    legalSection: 'Huquqiy maʼlumotlar',
    // v118.117 — see RU block above; replacement single info line.
    infoDeleteAccount: 'Akkauntni oʻchirish uchun boshqaruv kompaniyangizga murojaat qiling.',
    logout: 'Akkauntdan chiqish',
    logoutConfirm: 'Akkauntdan chiqmoqchimisiz?',
    notSet: "Ko'rsatilmagan",
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    edit: "O'zgartirish",
    passwordTitle: "Parolni o'zgartirish",
    currentPassword: 'Joriy parol',
    newPassword: 'Yangi parol',
    confirmPassword: 'Parolni tasdiqlang',
    minChars: 'Kamida 4 ta belgi',
    repeatPassword: 'Yangi parolni takrorlang',
    passwordChanged: "Parol muvaffaqiyatli oʼzgartirildi",
    phoneSaved: 'Telefon saqlandi',
    profileSaved: 'Profil saqlandi',
    editProfileTitle: 'Profilni tahrirlash',
    nameLabel: 'Ism',
    namePlaceholder: 'Ismingiz',
    nameRequired: 'Ismni kiriting',
    wrongPassword: "Joriy parol notoʼgʼri",
    passwordsNotMatch: 'Parollar mos kelmaydi',
    passwordSameAsOld: 'Yangi parol joriy paroldan farq qilishi kerak',
    enterCurrentPassword: 'Joriy parolni kiriting',
    passwordTooShort: "Parol kamida 4 ta belgidan iborat boʼlishi kerak",
    passwordError: "Parolni oʼzgartirishda xatolik",
    qrSubtitle: 'Hujjatlarni imzolash va ruxsat uchun QR',
    versionLabel: 'versiya',
    sectionUk: 'Boshqaruv kompaniyasi',
    ukEyebrow: 'Boshqaruv kompaniyasi',
    ukBuildingLine: 'Turar-joy majmuasi',
    contractSectionTitle: 'Boshqaruv shartnomasi',
    contractDownloadBtn: 'Shartnomani yuklab olish',
    contractHelpWithName: (uk: string) => `${uk} BK bilan koʻp xonadonli uy boshqaruv shartnomasi`,
    contractHelpNoName: 'Sizning BK bilan koʻp xonadonli uy boshqaruv shartnomasi',
    contractEmptyTitle: 'Shartnoma hali yuklanmagan',
    contractEmptyHelp: 'Boshqaruv shartnomasini yuklash uchun boshqaruv kompaniyasiga murojaat qiling',
    contractDownloadSuccess: 'Shartnoma yuklab olindi',
    contractDownloadNetwork: 'Yuklab boʻlmadi. Internetni tekshiring.',
    contractDownloadGone: 'Shartnoma endi mavjud emas. Sahifani yangilang.',
  }, [language]);

  if (!user) return null;

  const displayName = formatName(user.name) || user.name || user.login;
  const initials = getInitials(displayName);
  const roleLabel = user.role === 'tenant' ? t.role_tenant
    : user.role === 'commercial_owner' ? t.role_commercial
    : t.role_resident;
  const joinedSince = formatJoinDate(user.createdAt, language);
  const subtitle = joinedSince ? `${roleLabel} · ${joinedSince}` : roleLabel;
  const verified = Boolean(user.contractSignedAt);

  const requestCount = getRequestsByResident(user.id).length;
  const stats: Array<{ v: string; l: string }> = [
    { v: String(requestCount), l: t.statRequests },
    { v: '—', l: t.statRating },
    { v: '—', l: t.statPoints },
  ];

  const tiles: Array<{
    Icon: typeof FileText;
    label: string;
    sub: string;
    fg: string;
    bg: string;
    onClick?: () => void;
  }> = [
    {
      Icon: FileText,
      label: t.tileContract,
      sub: user.contractNumber || (user.contractSignedAt ? '№ —' : '—'),
      fg: '#EA580C',
      bg: BRAND_TINT,
      onClick: () => navigate('/contract'),
    },
    {
      Icon: QrCode,
      label: t.tileQR,
      sub: t.qrActive,
      fg: STATUS_ACTIVE,
      bg: STATUS_ACTIVE_BG,
      onClick: () => setShowQrModal(true),
    },
    {
      Icon: CreditCard,
      label: t.tilePayment,
      sub: '—',
      fg: '#2F77C2',
      bg: STATUS_INFO_BG,
      onClick: () => navigate('/finance/charges'),
    },
    {
      Icon: Star,
      label: t.tileBonus,
      // v127 P0 — was a dead button (no onClick, no visual disabled state).
      // Resident-side bonuses program isn't shipped yet, so flag it as
      // "Скоро" the same way the resident HomeTab tile does. The cursor
      // already drops to 'default' below when onClick is undefined.
      sub: language === 'ru' ? 'Скоро' : 'Tez orada',
      fg: '#7C3AED',
      bg: 'rgba(124,58,237,0.12)',
    },
  ];

  // ── action handlers ──────────────────────────────────────────────────
  const handleSavePhone = async () => {
    const trimmed = newPhone.trim();
    if (!trimmed || trimmed === user.phone) {
      setEditingPhone(false);
      return;
    }
    setPhoneSaving(true);
    try {
      const ok = await updateProfile({ phone: trimmed });
      if (ok) {
        setEditingPhone(false);
        addToast('success', t.phoneSaved);
      }
    } finally {
      setPhoneSaving(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined' && window.confirm(t.logoutConfirm)) {
      logout();
      navigate('/login', { replace: true });
    }
  };

  // v118.35 — Privacy Policy link required by both App Store and
  // Google Play. Opens https://kamizo.uz/privacy in the system
  // browser (Capacitor preserves window.open for external https URLs
  // via SFSafariViewController on iOS / Chrome Custom Tabs on
  // Android). Falls back to a regular navigation if window.open
  // returns null (PWA / desktop).
  const handlePrivacyPolicy = () => {
    const url = 'https://kamizo.uz/privacy';
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) window.location.href = url;
    } catch {
      window.location.href = url;
    }
  };

  // v118.117 — handleDeleteAccount + the related i18n keys removed.
  // Residents cannot self-delete (UK-managed onboarding via the
  // government billing system); the in-app entry point was
  // non-functional and only routed to a mailto: anyway. Apple 5.1.1(v)
  // compliance is now satisfied by an info line under the Logout
  // button telling the user to contact their management company.

  // ── Tenant management contract (Sprint 85 commit 3) ──────────────────
  // GET /api/resident/contract streams the PDF bytes. The download flow
  // mirrors the director widget's (ContractUploader.handleDownload):
  // fetch → blob → URL.createObjectURL → synthetic <a download> → revoke
  // on the next animation frame so Android WebView's DownloadManager
  // has time to consume the click before the blob URL goes away.
  // 404 means the contract was deleted between page-load and tap; we
  // silently refetch the tenant config so the section flips to the
  // empty state on the resident's next tap.
  const handleDownloadTenantContract = async () => {
    if (!tenantContract || contractDownloading) return;
    setContractDownloading(true);
    try {
      const token = getToken();
      const resp = await fetch(`${API_URL}/api/resident/contract`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (resp.status === 404) {
        addToast('error', t.contractDownloadGone);
        void refetchTenantConfig();
        return;
      }
      if (!resp.ok) {
        addToast('error', t.contractDownloadNetwork);
        return;
      }
      const blob = await resp.blob();
      // v130 — route through the shared downloadBlob helper so iOS uses
      // @capacitor/filesystem (Documents/ → Files app) instead of the
      // synthetic <a download> which silently no-ops in WKWebView.
      // PWA + Android keep their existing anchor/DownloadManager behavior.
      // silent=true because this page surfaces its own contractDownloadSuccess
      // toast with locale-aware copy that matches the rest of the resident
      // profile.
      await downloadBlob(blob, {
        filename: tenantContract.filename || 'contract.pdf',
        language: language === 'ru' ? 'ru' : 'uz',
        silent: true,
      });
      addToast('success', t.contractDownloadSuccess);
    } catch {
      addToast('error', t.contractDownloadNetwork);
    } finally {
      setContractDownloading(false);
    }
  };

  // ── render: hero / tiles / sections / logout / version ───────────────
  return (
    // v118.79 — kz-screen opts into the global iOS-like page-enter slide+fade.
    <div
      className="kz-screen"
      style={{
        minHeight: '100%',
        background: APP_BG,
        color: TEXT_PRIMARY,
        paddingBottom: 'calc(124px + env(safe-area-inset-bottom, 0px))',
        letterSpacing: '-0.01em',
      }}
    >
      {/* Dark-theme tokens (--rpp-* page vars + --bb-* bottombar vars) now
          live in src/frontend/src/index.css under `html.dark`, driven by
          ThemeProvider. Every visual token in this page and the BottomBar
          reads through `var(--…, <light-fallback>)`, so the page renders
          identically in light mode for non-opted users. */}
      {/* ── Hero — premium dark card ─────────────────────────────────── */}
      <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px 0' }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 28,
            background: 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)',
            color: TEXT_ON_DARK,
            padding: 20,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.4,
              background: 'radial-gradient(90% 80% at 90% 0%, rgba(251,146,60,0.45), transparent 55%)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* v118.19 — was a brand-orange circle with the user's
                initials (e.g. "ТС"). Now driven by central
                RoleAvatar — residents see Home, executors see Key,
                directors/admins/managers/etc see Building2, security
                sees the boom-barrier custom icon. super_admin and any
                future un-mapped role fall back to the initials
                inside the same orange circle. The адмиU card on this
                same page (around line 990) is intentionally NOT
                switched — that's the УК (management company)
                logo/photo fallback, not a user avatar. */}
            <RoleAvatar
              role={user.role}
              name={displayName}
              size={66}
              iconRatio={0.46}
              boxShadow="0 6px 16px rgba(249,115,22,0.4)"
              style={{ fontSize: 23 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: TEXT_ON_DARK,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName}
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(244,240,232,0.6)', marginTop: 2 }}>
                {subtitle}
              </div>
              {verified && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 7,
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: 'rgba(34,197,94,0.18)',
                    color: '#86EFAC',
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  <Check size={11} strokeWidth={3} /> {t.verified}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowEditProfile(true)}
              aria-label={t.edit}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: 'rgba(244,240,232,0.12)',
                border: '1px solid rgba(244,240,232,0.14)',
                display: 'grid',
                placeItems: 'center',
                color: TEXT_ON_DARK,
                cursor: 'pointer',
                flex: '0 0 auto',
                padding: 0,
              }}
            >
              <Pencil size={16} />
            </button>
          </div>
          {/* stats strip */}
          <div style={{ position: 'relative', display: 'flex', marginTop: 18 }}>
            {stats.map((s, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  borderRight: i < stats.length - 1 ? '1px solid rgba(244,240,232,0.12)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    color: TEXT_ON_DARK,
                  }}
                >
                  {s.v}
                </div>
                <div style={{ fontSize: 10.5, color: 'rgba(244,240,232,0.6)', marginTop: 1 }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick tiles — 2-col grid ─────────────────────────────────── */}
      <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tiles.map((tile, i) => (
          <button
            key={i}
            type="button"
            onClick={tile.onClick}
            // v127 P0 — tiles without onClick (Бонусы) read as broken
            // buttons on tap without these aria/disabled signals. Mark
            // them disabled so the press doesn't even register an active
            // state, and screen readers announce them correctly.
            disabled={!tile.onClick}
            aria-disabled={!tile.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: 13,
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: 20,
              boxShadow: SHADOW_SM,
              cursor: tile.onClick ? 'pointer' : 'default',
              opacity: tile.onClick ? 1 : 0.7,
              textAlign: 'left',
              minWidth: 0,
              color: TEXT_PRIMARY,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: tile.bg,
                color: tile.fg,
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
              }}
              aria-hidden
            >
              <tile.Icon size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', color: TEXT_PRIMARY }}>
                {tile.label}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: TEXT_SECONDARY,
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {tile.sub}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Управляющая компания ──────────────────────────────────────
          Real УК identity from /api/tenant/config (logo + name) + the
          resident's ЖК (real building name + address) when buildingId
          resolves through buildingStore. Falls back gracefully when
          fields are missing — the only currently-missing pieces are
          the УК's legal-form prefix (ТСЖ/УК/ХУЖМШ) and a public УК
          rating endpoint; both noted in design/feature notes. */}
      <div style={{ padding: '20px 16px 0' }}>
        <ManagementCompanyCard
          tenantName={tenantConfig?.name || 'Kamizo'}
          tenantLogo={tenantConfig?.logo || null}
          ukLabel={t.ukEyebrow}
          buildingName={residentBuilding?.name || user.building || null}
          buildingAddress={residentBuilding?.address || user.address || null}
          jkLabel={t.ukBuildingLine}
          onClick={() => navigate('/contract')}
        />
      </div>

      {/* ── Договор управления (Sprint 85 commit 3) ──────────────────
          Per-tenant PDF that super-admin or the tenant's director
          uploaded (commits 1 + 2). Residents see filename + upload
          date + a "Скачать договор" primary button when present, or
          a quiet empty state asking them to contact the УК when not.
          Bytes stream over GET /api/resident/contract; tenant_id is
          derived from the resident's JWT, never from URL or body. */}
      <div style={{ padding: '20px 16px 0' }}>
        <TenantContractSection
          contract={tenantContract}
          tenantName={tenantConfig?.name || null}
          downloading={contractDownloading}
          onDownload={handleDownloadTenantContract}
          t={{
            title: t.contractSectionTitle,
            downloadBtn: t.contractDownloadBtn,
            helpWithName: t.contractHelpWithName,
            helpNoName: t.contractHelpNoName,
            emptyTitle: t.contractEmptyTitle,
            emptyHelp: t.contractEmptyHelp,
          }}
          language={language}
        />
      </div>

      {/* ── Settings sections ───────────────────────────────────────── */}
      <div style={{ padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Дом и квартира */}
        <SettingsSection title={t.sectionHome}>
          <SettingsRow
            icon={<Building2 size={17} />}
            label={t.address}
            value={user.address || t.notSet}
            chevron
          />
          <SettingsRow
            icon={<Home size={17} />}
            label={t.apartment}
            value={
              user.apartment
                ? `${language === 'ru' ? 'Кв.' : 'Kv.'} ${user.apartment}${user.totalArea ? ` · ${user.totalArea} ${language === 'ru' ? 'м²' : 'm²'}` : ''}`
                : '—'
            }
            chevron
          />
          {/* Лицевой счёт — read-only on the resident side; set by УК
              management via PATCH /api/users/:id/personal-account.
              Tap-to-copy when populated so the resident can paste it
              into a bank app; empty → "—" (same fallback the other
              optional rows already use). Sits between «Квартира» and
              «Состав семьи» per design. */}
          <SettingsRow
            icon={<FileText size={17} />}
            label={t.personalAccount}
            value={user.personalAccount || '—'}
            onClick={user.personalAccount ? () => {
              const acct = user.personalAccount!;
              const showCopied = () => useToastStore.getState().addToast('success', t.personalAccountCopied);
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(acct).then(showCopied).catch(() => {
                  // execCommand fallback for older WebViews where the
                  // async clipboard API is missing or blocked.
                  const ta = document.createElement('textarea');
                  ta.value = acct;
                  ta.style.position = 'fixed';
                  ta.style.opacity = '0';
                  document.body.appendChild(ta);
                  ta.select();
                  try { document.execCommand('copy'); showCopied(); } catch { /* swallow */ }
                  document.body.removeChild(ta);
                });
              } else {
                const ta = document.createElement('textarea');
                ta.value = acct;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); showCopied(); } catch { /* swallow */ }
                document.body.removeChild(ta);
              }
            } : undefined}
          />
          <SettingsRow
            icon={<Users size={17} />}
            label={t.household}
            value="—"
            chevron
          />
        </SettingsSection>

        {/* Безопасность */}
        <SettingsSection title={t.sectionSecurity}>
          {editingPhone ? (
            <PhoneEditRow
              value={newPhone}
              onChange={setNewPhone}
              onSave={handleSavePhone}
              onCancel={() => { setEditingPhone(false); setNewPhone(user.phone || ''); }}
              loading={phoneSaving}
              labelText={t.phone}
              saveText={t.save}
              cancelText={t.cancel}
            />
          ) : (
            <SettingsRow
              icon={<Phone size={17} />}
              label={t.phone}
              value={user.phone ? maskPhone(user.phone) : t.notSet}
              editable
              onClick={() => { setNewPhone(user.phone || ''); setEditingPhone(true); }}
            />
          )}
          <SettingsRow
            icon={<Key size={17} />}
            label={t.changePass}
            chevron
            onClick={() => setShowPasswordModal(true)}
          />
          <SettingsRow
            icon={<ShieldCheck size={17} />}
            label={t.twoFA}
            badge={t.twoFAValue}
          />
        </SettingsSection>

        {/* Приложение */}
        <SettingsSection title={t.sectionApp}>
          <SettingsRow
            icon={<Globe size={17} />}
            label={t.appLanguage}
            value={t.langName}
            chevron
            onClick={() => setLanguage(language === 'ru' ? 'uz' : 'ru')}
          />
          <SettingsRow
            icon={<Bell size={17} />}
            label={t.notifications}
            value={t.notifValue}
            chevron
          />
          <SettingsRow
            icon={<Moon size={17} />}
            label={t.darkMode}
            rightSlot={<ThemeToggle ariaLabel={t.darkMode} />}
          />
          {/* v118.91 — hide "Установить как приложение" when we're
              already in the native Capacitor app (iOS / Android). The
              row only makes sense in a web browser / PWA shell, where
              the user can actually add the app to their home screen.
              In native there's nothing to install → no-op button is
              both confusing for users and a potential App Store
              review red flag. */}
          {!Capacitor.isNativePlatform() && (
            <SettingsRow
              icon={<Download size={17} />}
              label={t.installApp}
              chevron
              accent
              onClick={() => setShowInstallModal(true)}
            />
          )}
        </SettingsSection>

        {/* v118.35 — Legal section. Privacy Policy required by both
            stores (also linked in App Store Connect / Play Console
            listings). Account deletion required by Apple Guideline
            5.1.1(v) for any app with account creation. */}
        <SettingsSection title={t.legalSection}>
          <SettingsRow
            icon={<Shield size={17} />}
            label={t.privacyPolicy}
            chevron
            onClick={handlePrivacyPolicy}
          />
        </SettingsSection>

        {/* v118.117 — "Удалить аккаунт" button + its two-step
            confirmation flow + the DELETE /api/account/me fallback
            were removed. Residents are onboarded by the property-
            management company through a government billing system
            and cannot self-delete; the button was non-functional
            in practice and only routed to a mailto: anyway.
            Replaced with a single non-interactive info line below
            so the screen still complies with Apple guideline
            5.1.1(v) (apps must show users how to request deletion
            even when org-managed) — see infoDeleteAccount in i18n.
            Director / admin / staff profiles are a separate
            component (admin/SettingsPage.tsx) and were never wired
            to this flow, so they stay unaffected. */}
        <div
          style={{
            padding: '12px 14px',
            background: 'transparent',
            border: `1px dashed ${BORDER}`,
            borderRadius: 14,
            color: TEXT_SECONDARY,
            fontSize: 12.5,
            lineHeight: 1.45,
            textAlign: 'center',
          }}
        >
          {t.infoDeleteAccount}
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: STATUS_CRITICAL,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: SHADOW_SM,
            width: '100%',
          }}
        >
          <LogOut size={16} /> {t.logout}
        </button>

        {/* Version label */}
        <div style={{ textAlign: 'center', fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
          Kamizo · {t.versionLabel} {APP_VERSION}
        </div>
      </div>

      {showEditProfile && (
        <EditProfileModal
          onClose={() => setShowEditProfile(false)}
          initialName={user.name || ''}
          initialPhone={user.phone || ''}
          updateProfile={updateProfile}
          t={t}
          onSuccess={() => addToast('success', t.profileSaved)}
        />
      )}

      {showPasswordModal && (
        <PasswordModal
          onClose={() => setShowPasswordModal(false)}
          changePassword={changePassword}
          t={t}
          onSuccess={() => addToast('success', t.passwordChanged)}
        />
      )}

      {showInstallModal && (
        <BottomSheet onClose={() => setShowInstallModal(false)}>
          <InstallAppSection
            language={language}
            roleContext={user.role}
            onHideForever={() => setShowInstallModal(false)}
          />
        </BottomSheet>
      )}

      {showQrModal && (
        <BottomSheet onClose={() => setShowQrModal(false)}>
          <div style={{ padding: '4px 4px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 4 }}>
              {t.tileQR}
            </div>
            <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, marginBottom: 16 }}>
              {t.qrSubtitle}
            </div>
            <div
              style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 20,
                padding: 20,
                display: 'grid',
                placeItems: 'center',
                minHeight: 260,
              }}
            >
              {qrUrl ? (
                <img src={qrUrl} alt="QR" style={{ width: 240, height: 240, display: 'block' }} />
              ) : (
                <Loader2 size={28} className="animate-spin" style={{ color: TEXT_MUTED }} />
              )}
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─── presentational sub-components ──────────────────────────────────────

// Tappable "Управляющая компания" card. Visible at the top of the
// resident profile under the action tiles. Shows the УК logo + name
// from the real tenant config and (when available) the resident's ЖК
// name + address from buildingStore. Falls back to clean initials and
// the raw `user.building` / `user.address` strings when the optional
// fields are missing.
function ManagementCompanyCard({
  tenantName, tenantLogo, ukLabel,
  buildingName, buildingAddress, jkLabel,
  onClick,
}: {
  tenantName: string;
  tenantLogo: string | null;
  ukLabel: string;
  buildingName: string | null;
  buildingAddress: string | null;
  jkLabel: string;
  onClick?: () => void;
}) {
  const initials = (() => {
    const parts = tenantName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return ((parts[0][0] || '') + (parts[1][0] || '')).toUpperCase();
  })();

  const hasBuilding = !!(buildingName || buildingAddress);
  const buildingLine = buildingName && buildingAddress && buildingName !== buildingAddress
    ? `${buildingName} · ${buildingAddress}`
    : (buildingName || buildingAddress || '');

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: 20, boxShadow: SHADOW_SM,
        padding: 14, cursor: onClick ? 'pointer' : 'default',
        font: 'inherit', color: 'inherit',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {tenantLogo ? (
          <div style={{
            width: 50, height: 50, borderRadius: 14,
            background: '#FFFFFF', border: `1px solid ${BORDER}`,
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            overflow: 'hidden',
          }}>
            <img
              src={tenantLogo}
              alt={tenantName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ) : (
          <div style={{
            width: 50, height: 50, borderRadius: 14,
            background: 'linear-gradient(135deg, #FB923C, #EA580C)',
            color: '#fff', fontWeight: 800, fontSize: 17,
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            letterSpacing: '-0.02em',
            boxShadow: '0 6px 16px rgba(249,115,22,0.32)',
          }}>
            {initials}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em',
            color: BRAND_DARK, textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {ukLabel}
          </div>
          <div style={{
            fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', color: TEXT_PRIMARY,
            marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {tenantName}
          </div>
        </div>
        {onClick && (
          <ChevronRight size={18} style={{ color: TEXT_MUTED, flex: '0 0 auto' }} />
        )}
      </div>

      {hasBuilding && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: `1px solid ${HAIRLINE}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: BRAND_TINT, color: BRAND_DARK,
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
          }}>
            <Building2 size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
              color: TEXT_MUTED, textTransform: 'uppercase',
            }}>
              {jkLabel}
            </div>
            <div style={{
              fontSize: 13.5, fontWeight: 600, color: TEXT_PRIMARY,
              marginTop: 1, lineHeight: 1.35,
              wordBreak: 'break-word',
            }}>
              {buildingLine}
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

// Sprint 85 commit 3 — presentational "Договор управления" section.
// Read-only on the resident side: no upload, no delete, no replace.
// Two states:
//   filled   → eyebrow + card with file icon, filename, upload date,
//              "Скачать договор" primary button, help line below
//   empty    → eyebrow + card with muted icon, "Договор ещё не
//              загружен" title, and a help line asking the resident
//              to contact the УК
// Visual language matches the rest of the resident profile (inline
// styles + --rpp-* tokens) — intentionally NOT the Tailwind-based
// ContractUploader so it sits cleanly next to ManagementCompanyCard
// and SettingsSection without a tonal seam.
function TenantContractSection({
  contract,
  tenantName,
  downloading,
  onDownload,
  t,
  language,
}: {
  contract: { filename: string | null; uploaded_at: string | null; uploaded_by_name: string | null } | null;
  tenantName: string | null;
  downloading: boolean;
  onDownload: () => void;
  t: {
    title: string;
    downloadBtn: string;
    helpWithName: (uk: string) => string;
    helpNoName: string;
    emptyTitle: string;
    emptyHelp: string;
  };
  language: 'ru' | 'uz';
}) {
  const eyebrowStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
    padding: '0 4px',
    marginBottom: 8,
  };
  const cardStyle: CSSProperties = {
    background: SURFACE,
    borderRadius: 20,
    border: `1px solid ${BORDER}`,
    boxShadow: SHADOW_SM,
    padding: 16,
  };

  const dateLabel = (iso: string | null): string => {
    if (!iso) return '';
    // SQLite TEXT timestamps land as "YYYY-MM-DD HH:MM:SS" (UTC, no
    // suffix) — same shape we already format in ContractUploader.
    const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  return (
    <div>
      <div style={eyebrowStyle}>{t.title}</div>
      {contract ? (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: BRAND_TINT,
                color: BRAND_DARK,
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
              }}
              aria-hidden
            >
              <FileText size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  color: TEXT_PRIMARY,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {contract.filename || 'contract.pdf'}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: TEXT_SECONDARY,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {dateLabel(contract.uploaded_at)}
                {contract.uploaded_at && contract.uploaded_by_name ? ' · ' : ''}
                {contract.uploaded_by_name && (language === 'ru'
                  ? `загрузил ${contract.uploaded_by_name}`
                  : `yukladi ${contract.uploaded_by_name}`)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 14,
              width: '100%',
              padding: '12px 14px',
              borderRadius: 14,
              background: BRAND_DARK,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              border: 'none',
              cursor: downloading ? 'default' : 'pointer',
              opacity: downloading ? 0.7 : 1,
              boxShadow: '0 6px 14px rgba(234,88,12,0.22)',
            }}
          >
            {downloading
              ? <Loader2 size={16} className="animate-spin" />
              : <Download size={16} />}
            {t.downloadBtn}
          </button>

          <div
            style={{
              marginTop: 10,
              fontSize: 11.5,
              lineHeight: 1.4,
              color: TEXT_MUTED,
            }}
          >
            {tenantName ? t.helpWithName(tenantName) : t.helpNoName}
          </div>
        </div>
      ) : (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: SURFACE_SUNKEN,
                color: TEXT_MUTED,
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
              }}
              aria-hidden
            >
              <FileText size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  color: TEXT_PRIMARY,
                }}
              >
                {t.emptyTitle}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: TEXT_SECONDARY,
                }}
              >
                {t.emptyHelp}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.06em',
          color: TEXT_SECONDARY,
          textTransform: 'uppercase',
          padding: '0 4px',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          background: SURFACE,
          borderRadius: 20,
          border: `1px solid ${BORDER}`,
          boxShadow: SHADOW_SM,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  icon, label, value, chevron, editable, badge, accent, onClick, isLast, rightSlot,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  chevron?: boolean;
  editable?: boolean;
  badge?: string;
  accent?: boolean;
  onClick?: () => void;
  isLast?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '13px 14px',
    borderBottom: isLast ? 'none' : `1px solid ${HAIRLINE}`,
    cursor: onClick ? 'pointer' : 'default',
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    minWidth: 0,
  };
  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick} style={rowStyle}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: accent ? BRAND_TINT : SURFACE_SUNKEN,
          color: accent ? BRAND_DARK : TEXT_SECONDARY,
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
        }}
        aria-hidden
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 650 as unknown as number,
            letterSpacing: '-0.01em',
            color: accent ? BRAND_DARK : TEXT_PRIMARY,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {value && !badge && (
          <div
            style={{
              fontSize: 12,
              color: TEXT_SECONDARY,
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {value}
          </div>
        )}
      </div>
      {badge && (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: STATUS_ACTIVE,
            background: STATUS_ACTIVE_BG,
            padding: '3px 9px',
            borderRadius: 999,
            flex: '0 0 auto',
          }}
        >
          {badge}
        </span>
      )}
      {rightSlot}
      {editable && !badge && !rightSlot && <Pencil size={15} style={{ color: TEXT_MUTED, flex: '0 0 auto' }} />}
      {chevron && !badge && !rightSlot && <ChevronRight size={16} style={{ color: TEXT_MUTED, flex: '0 0 auto' }} />}
    </div>
  );
}

function PhoneEditRow({
  value, onChange, onSave, onCancel, loading, labelText, saveText, cancelText,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
  labelText: string;
  saveText: string;
  cancelText: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '13px 14px',
        borderBottom: `1px solid ${HAIRLINE}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: SURFACE_SUNKEN,
            color: TEXT_SECONDARY,
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
          }}
        >
          <Phone size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: TEXT_SECONDARY,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {labelText}
          </div>
          <input
            type="tel"
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="+998 90 100 00 11"
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              padding: '4px 0 0',
              fontSize: 14,
              fontWeight: 600,
              color: TEXT_PRIMARY,
              background: 'transparent',
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, paddingLeft: 46 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: 12,
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            color: TEXT_SECONDARY,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={loading}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: 12,
            border: 'none',
            background: BRAND_DARK,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saveText}
        </button>
      </div>
    </div>
  );
}

function BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // Every sheet on this page (EditProfile / PasswordModal / QR pass /
  // InstallApp) mounts through this wrapper; registering once here hides
  // the global BottomBar while ANY of them is open. Decrements on unmount,
  // which covers backdrop-tap / X / Escape / programmatic close.
  useModalPresence();

  // Lock body scroll while the sheet is open so the user can't pull the page
  // behind the overlay; rolled back on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // v118.95 — swipe-to-dismiss (same Pointer-Events pattern as the
  // shared Sheet.tsx v210). Drag handle + close-X header row are
  // ALWAYS draggable; the body becomes draggable only when scrollTop
  // === 0 + finger moves down (so internal scroll still works for
  // sheets with long content). Threshold for dismiss: max(80px, 25%
  // sheet height) OR downward velocity > 600 px/sec. Below threshold
  // → snap-back via inline transition.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ y: 0, t: 0 });
  const dragLast = useRef({ y: 0, t: 0 });

  const startDrag = (clientY: number) => {
    const now = performance.now();
    dragStart.current = { y: clientY, t: now };
    dragLast.current = { y: clientY, t: now };
    setIsDragging(true);
  };
  const updateDrag = (clientY: number) => {
    const dy = Math.max(0, clientY - dragStart.current.y);
    dragLast.current = { y: clientY, t: performance.now() };
    setDragY(dy);
  };
  const endDrag = () => {
    const el = sheetRef.current;
    setIsDragging(false);
    if (!el) { setDragY(0); return; }
    const sheetH = el.clientHeight;
    const threshold = Math.max(80, sheetH * 0.25);
    const elapsed = Math.max(1, dragLast.current.t - dragStart.current.t);
    const totalDy = dragLast.current.y - dragStart.current.y;
    const velocity = (totalDy / elapsed) * 1000;
    if (dragY > threshold || velocity > 600) {
      setDragY(sheetH + 80);
      window.setTimeout(() => { setDragY(0); onClose(); }, 220);
    } else {
      setDragY(0);
    }
  };

  const handleDragHandlers: React.HTMLAttributes<HTMLDivElement> = {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
      startDrag(e.clientY);
    },
    onPointerMove: (e) => { if (isDragging) updateDrag(e.clientY); },
    onPointerUp: (e) => {
      if (!isDragging) return;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      endDrag();
    },
    onPointerCancel: (e) => {
      if (!isDragging) return;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      setIsDragging(false);
      setDragY(0);
    },
  };

  const bodyDragHandlers: React.HTMLAttributes<HTMLDivElement> = {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = sheetRef.current;
      if (el && el.scrollTop > 0) return; // user scrolling — let native scroll happen
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
      startDrag(e.clientY);
    },
    onPointerMove: (e) => { if (isDragging) updateDrag(e.clientY); },
    onPointerUp: (e) => {
      if (!isDragging) return;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      endDrag();
    },
    onPointerCancel: (e) => {
      if (!isDragging) return;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      setIsDragging(false);
      setDragY(0);
    },
  };

  const dragStyle: React.CSSProperties = dragY > 0 ? {
    transform: `translateY(${dragY}px)`,
    transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
    touchAction: 'none',
  } : {};

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(28,25,23,0.45)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        {...bodyDragHandlers}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: SURFACE,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: '14px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh',
          // v118.111 — added the iOS-safe momentum + rubber-band combo
          // (see ScrollArea.tsx). Was overflowY:auto only — risked the
          // dead-edge-at-bottom on long sheets.
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          boxShadow: '0 -12px 32px rgba(28,25,23,0.18)',
          animation: 'kz-sheet-up 0.22s cubic-bezier(0.2,0,0,1) both',
          ...dragStyle,
        }}
      >
        <div
          {...handleDragHandlers}
          style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#D8CFBE' }} />
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 999,
            background: SURFACE_SUNKEN,
            color: TEXT_SECONDARY,
            border: 'none',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
        {children}
      </div>
      <style>{`
        @keyframes kz-sheet-up {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function PasswordModal({
  onClose,
  changePassword,
  t,
  onSuccess,
}: {
  onClose: () => void;
  changePassword: (current: string, next: string) => Promise<boolean>;
  t: {
    passwordTitle: string; currentPassword: string; newPassword: string;
    confirmPassword: string; minChars: string; repeatPassword: string;
    cancel: string; save: string;
    wrongPassword: string; passwordsNotMatch: string; passwordSameAsOld: string;
    enterCurrentPassword: string; passwordTooShort: string; passwordError: string;
  };
  onSuccess: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    if (!current.trim()) { setErr(t.enterCurrentPassword); return; }
    if (next.length < 4) { setErr(t.passwordTooShort); return; }
    if (next !== confirm) { setErr(t.passwordsNotMatch); return; }
    if (current === next) { setErr(t.passwordSameAsOld); return; }
    setBusy(true);
    try {
      const ok = await changePassword(current, next);
      if (ok) {
        onSuccess();
        onClose();
      } else {
        setErr(t.wrongPassword);
      }
    } catch (e) {
      const msg = (e as Error)?.message || '';
      setErr(/incorrect|wrong|неверный/i.test(msg) ? t.wrongPassword : t.passwordError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: '4px 4px 8px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_PRIMARY, marginBottom: 14 }}>
          {t.passwordTitle}
        </div>
        <PasswordField
          label={t.currentPassword}
          value={current}
          onChange={setCurrent}
          visible={showCurrent}
          onToggle={() => setShowCurrent(v => !v)}
          placeholder="••••••••"
        />
        <PasswordField
          label={t.newPassword}
          value={next}
          onChange={setNext}
          visible={showNext}
          onToggle={() => setShowNext(v => !v)}
          placeholder={t.minChars}
        />
        <PasswordField
          label={t.confirmPassword}
          value={confirm}
          onChange={setConfirm}
          visible={showNext}
          placeholder={t.repeatPassword}
        />
        {err && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              background: 'rgba(226,72,61,0.08)',
              color: STATUS_CRITICAL,
              borderRadius: 12,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} /> {err}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 14,
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              color: TEXT_SECONDARY,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 14,
              border: 'none',
              background: BRAND_DARK,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t.save}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function PasswordField({
  label, value, onChange, visible, onToggle, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle?: () => void;
  placeholder: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: TEXT_SECONDARY,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          marginBottom: 6,
          paddingLeft: 4,
        }}
      >
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '12px 44px 12px 14px',
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            fontSize: 14,
            color: TEXT_PRIMARY,
            background: SURFACE,
            outline: 'none',
          }}
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="toggle visibility"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 32,
              height: 32,
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: TEXT_MUTED,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function EditProfileModal({
  onClose, initialName, initialPhone, updateProfile, t, onSuccess,
}: {
  onClose: () => void;
  initialName: string;
  initialPhone: string;
  updateProfile: (updates: { phone?: string; name?: string }) => Promise<boolean>;
  t: {
    editProfileTitle: string; nameLabel: string; namePlaceholder: string; nameRequired: string;
    phone: string; cancel: string; save: string;
  };
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    const trimmedName = name.trim();
    if (!trimmedName) { setErr(t.nameRequired); return; }
    const updates: { name?: string; phone?: string } = {};
    if (trimmedName !== initialName) updates.name = trimmedName;
    const trimmedPhone = phone.trim();
    if (trimmedPhone !== initialPhone) updates.phone = trimmedPhone;
    if (Object.keys(updates).length === 0) { onClose(); return; }
    setBusy(true);
    try {
      const ok = await updateProfile(updates);
      if (ok) {
        onSuccess();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: '4px 4px 8px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_PRIMARY, marginBottom: 14 }}>
          {t.editProfileTitle}
        </div>

        <FieldLabel>{t.nameLabel}</FieldLabel>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.namePlaceholder}
          autoFocus
          style={{
            width: '100%',
            padding: '12px 14px',
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            fontSize: 14,
            color: TEXT_PRIMARY,
            background: SURFACE,
            outline: 'none',
            marginBottom: 12,
          }}
        />

        <FieldLabel>{t.phone}</FieldLabel>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+998 90 100 00 11"
          style={{
            width: '100%',
            padding: '12px 14px',
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            fontSize: 14,
            color: TEXT_PRIMARY,
            background: SURFACE,
            outline: 'none',
          }}
        />

        {err && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              background: 'rgba(226,72,61,0.08)',
              color: STATUS_CRITICAL,
              borderRadius: 12,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} /> {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 14,
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              color: TEXT_SECONDARY,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 14,
              border: 'none',
              background: BRAND_DARK,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t.save}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        color: TEXT_SECONDARY,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        marginBottom: 6,
        paddingLeft: 4,
      }}
    >
      {children}
    </div>
  );
}
