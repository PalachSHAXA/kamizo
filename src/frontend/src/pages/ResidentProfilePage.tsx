import { useState, useMemo, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModalPresence } from '../stores/modalStore';
import {
  FileText, QrCode, CreditCard, Star,
  Building2, Home, Users, Phone,
  Key, ShieldCheck, Globe, Bell, Download,
  Check, Pencil, ChevronRight, LogOut,
  X, Loader2, Eye, EyeOff, AlertCircle, Save,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { useRequestStore } from '../stores/dataStore';
import { useTenantStore } from '../stores/tenantStore';
import { useBuildingStore } from '../stores/buildingStore';
import { formatName } from '../utils/formatName';
import { formatPhone } from '../utils/formatPhone';
import { InstallAppSection } from '../components/InstallAppSection';
import { generateQRCode } from '../components/LazyQRCode';

// ─── Page implements Claude Design §07-profil. Source of truth lives in
//     design/handoff/profile-handoff.md. Visual structure (hero / tiles /
//     sections / logout / version) follows that spec; data + interactions
//     stay wired to the existing authStore, requestStore and InstallApp /
//     QR utilities. Do not redesign here without updating the handoff. ───

// ── shared visual helpers ───────────────────────────────────────────────
const SURFACE = '#FFFFFF';
const SURFACE_SUNKEN = '#EDE7DB';
const BORDER = '#E6DFD2';
const HAIRLINE = 'rgba(28,25,23,0.06)';
const TEXT_PRIMARY = '#1C1917';
const TEXT_SECONDARY = '#6F6A62';
const TEXT_MUTED = '#A8A29E';
const TEXT_ON_DARK = '#F4F0E8';
// Reuse the dashboard's --app-bg (set in index.css :root) so the page
// background matches the body and there is no tonal seam between this
// page and the surrounding shell (no perceived "white strips" on the
// sides or below the scroll content).
const APP_BG = 'var(--app-bg)';
const BRAND_TINT = '#FFF3EA';
const BRAND_DARK = '#EA580C';
const STATUS_CRITICAL = '#E2483D';
const STATUS_ACTIVE = '#15A06E';
const STATUS_ACTIVE_BG = 'rgba(21,160,110,0.12)';
const STATUS_INFO_BG = 'rgba(47,119,194,0.12)';
const SHADOW_SM = '0 1px 2px rgba(28,25,23,0.04)';

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
  const { language, setLanguage } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const getRequestsByResident = useRequestStore(s => s.getRequestsByResident);
  // УК (управляющая компания) identity for the new "Управляющая
  // компания" card. Logo + name come from /api/tenant/config (already
  // populated by the auth bootstrap); the ЖК card pulls the real
  // building name/address from buildingStore (lazy-loaded once on mount
  // when the user has a buildingId).
  const tenantConfig = useTenantStore(s => s.config?.tenant);
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
    installApp: 'Установить как приложение',
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
    installApp: 'Ilova sifatida oʼrnatish',
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
      sub: '—',
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

  // ── render: hero / tiles / sections / logout / version ───────────────
  return (
    <div
      style={{
        minHeight: '100%',
        background: APP_BG,
        color: TEXT_PRIMARY,
        paddingBottom: 'calc(124px + env(safe-area-inset-bottom, 0px))',
        letterSpacing: '-0.01em',
      }}
    >
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
            <div
              style={{
                width: 66,
                height: 66,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #FB923C, #EA580C)',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: 23,
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
                boxShadow: '0 6px 16px rgba(249,115,22,0.4)',
                letterSpacing: '-0.02em',
              }}
              aria-hidden
            >
              {initials}
            </div>
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
            icon={<Download size={17} />}
            label={t.installApp}
            chevron
            accent
            onClick={() => setShowInstallModal(true)}
          />
        </SettingsSection>

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
  icon, label, value, chevron, editable, badge, accent, onClick, isLast,
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
      {editable && !badge && <Pencil size={15} style={{ color: TEXT_MUTED, flex: '0 0 auto' }} />}
      {chevron && !badge && <ChevronRight size={16} style={{ color: TEXT_MUTED, flex: '0 0 auto' }} />}
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: SURFACE,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: '14px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -12px 32px rgba(28,25,23,0.18)',
          animation: 'kz-sheet-up 0.22s cubic-bezier(0.2,0,0,1) both',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#D8CFBE' }} />
        </div>
        <button
          type="button"
          onClick={onClose}
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
