import { useState, useEffect, useMemo } from 'react';
import {
  Key, MapPin, Home, Phone, Save, Eye, EyeOff, Edit3,
  AlertCircle, Shield, Loader2, X, FileText, CheckCircle,
  Building2, Ruler, QrCode, Globe,
  Download, User as UserIcon, Sparkles, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { generateQRCode } from '../components/LazyQRCode';
import { generateContractDocx } from '../utils/contractGenerator';
import { ContractPreview } from '../components/ContractPreview';
import { InstallAppSection } from '../components/InstallAppSection';

export function ResidentProfilePage() {
  const { user, changePassword, updateProfile, markContractSigned } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);

  // Check if user is a rental user (tenant/commercial_owner) - they have simplified profile
  const isRentalUser = user?.role === 'tenant' || user?.role === 'commercial_owner';

  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState(user?.phone || '');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showContract, setShowContract] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Generate QR code with resident data
  useEffect(() => {
    const generateQR = async () => {
      if (!user) return;

      // Compact format with Cyrillic - no decorative symbols
      const residentData = [
        `ФИО: ${user.name}`,
        `Л/С: ${user.login}`,
        user.address ? `Адрес: ${user.address}` : null,
        user.apartment ? `Кв: ${user.apartment}` : null,
        user.phone ? `Тел: ${user.phone}` : null,
      ].filter(Boolean).join('\n');

      const url = await generateQRCode(residentData, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1f2937', light: '#ffffff' },
      });
      setQrCodeUrl(url);
    };

    generateQR();
  }, [user]);

  // Translations
  const t = useMemo(() => ({
    // Page header
    myProfile: language === 'ru' ? 'Мой профиль' : 'Mening profilim',
    personalData: language === 'ru' ? 'Ваши личные данные и договор' : 'Shaxsiy ma\'lumotlaringiz va shartnoma',

    // Sections
    personalInfo: language === 'ru' ? 'Личные данные' : 'Shaxsiy ma\'lumotlar',
    contractInfo: language === 'ru' ? 'Договор с УК' : 'UK bilan shartnoma',
    security: language === 'ru' ? 'Безопасность' : 'Xavfsizlik',

    // Personal data labels
    resident: language === 'ru' ? 'Житель' : 'Aholi',
    tenant: language === 'ru' ? 'Арендатор' : 'Ijarachi',
    commercialOwner: language === 'ru' ? 'Владелец' : 'Egasi',
    personalAccount: language === 'ru' ? 'Лицевой счёт' : 'Shaxsiy hisob',
    loginHint: language === 'ru' ? 'Логин для входа' : 'Kirish logini',
    cannotChange: language === 'ru' ? 'Нельзя изменить' : 'O\'zgartirib bo\'lmaydi',
    address: language === 'ru' ? 'Адрес' : 'Manzil',
    apartment: language === 'ru' ? 'Квартира' : 'Kvartira',
    area: language === 'ru' ? 'Площадь' : 'Maydon',
    phone: language === 'ru' ? 'Телефон' : 'Telefon',
    notSpecified: language === 'ru' ? 'Не указан' : 'Ko\'rsatilmagan',
    branch: language === 'ru' ? 'Филиал' : 'Filial',
    building: language === 'ru' ? 'Дом' : 'Uy',

    // Contract labels
    contractNumber: language === 'ru' ? 'Номер договора' : 'Shartnoma raqami',
    contractType: language === 'ru' ? 'Тип договора' : 'Shartnoma turi',
    contractStart: language === 'ru' ? 'Дата начала' : 'Boshlanish sanasi',
    contractEnd: language === 'ru' ? 'Дата окончания' : 'Tugash sanasi',
    indefinite: language === 'ru' ? 'Бессрочный' : 'Muddatsiz',
    contractStatus: language === 'ru' ? 'Статус договора' : 'Shartnoma holati',
    active: language === 'ru' ? 'Действующий' : 'Amalda',
    pending: language === 'ru' ? 'Ожидает подписания' : 'Imzo kutilmoqda',
    yourQrCode: language === 'ru' ? 'Ваш QR-код' : 'Sizning QR-kodingiz',
    qrHint: language === 'ru' ? 'Уникальный идентификатор для подписания документов' : 'Hujjatlarni imzolash uchun noyob identifikator',
    viewContract: language === 'ru' ? 'Посмотреть договор' : 'Shartnomani ko\'rish',
    hideContract: language === 'ru' ? 'Скрыть' : 'Yashirish',
    downloadContract: language === 'ru' ? 'Скачать договор' : 'Shartnomani yuklash',
    downloading: language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...',

    // Contract types
    typeStandard: language === 'ru' ? 'Стандартный' : 'Standart',
    typeCommercial: language === 'ru' ? 'Коммерческий' : 'Tijorat',
    typeTemporary: language === 'ru' ? 'Временный' : 'Vaqtinchalik',

    // Security
    password: language === 'ru' ? 'Пароль' : 'Parol',
    currentPassword: language === 'ru' ? 'Текущий пароль' : 'Joriy parol',
    newPassword: language === 'ru' ? 'Новый пароль' : 'Yangi parol',
    confirmPassword: language === 'ru' ? 'Подтвердите пароль' : 'Parolni tasdiqlang',
    minChars: language === 'ru' ? 'Минимум 4 символа' : 'Kamida 4 ta belgi',
    repeatPassword: language === 'ru' ? 'Повторите новый пароль' : 'Yangi parolni takrorlang',
    passwordChanged: language === 'ru' ? 'Пароль успешно изменён' : 'Parol muvaffaqiyatli o\'zgartirildi',
    wrongPassword: language === 'ru' ? 'Неверный текущий пароль' : 'Joriy parol noto\'g\'ri',
    passwordsNotMatch: language === 'ru' ? 'Пароли не совпадают' : 'Parollar mos kelmaydi',
    passwordSameAsOld: language === 'ru' ? 'Новый пароль должен отличаться от текущего' : 'Yangi parol joriy paroldan farq qilishi kerak',
    enterCurrentPassword: language === 'ru' ? 'Введите текущий пароль' : 'Joriy parolni kiriting',
    passwordTooShort: language === 'ru' ? 'Пароль должен быть минимум 4 символа' : 'Parol kamida 4 ta belgidan iborat bo\'lishi kerak',
    passwordError: language === 'ru' ? 'Ошибка при смене пароля' : 'Parolni o\'zgartirishda xatolik',

    // Actions
    save: language === 'ru' ? 'Сохранить' : 'Saqlash',
    cancel: language === 'ru' ? 'Отмена' : 'Bekor qilish',
    phoneSaved: language === 'ru' ? 'Телефон сохранён' : 'Telefon saqlandi',

    // Info
    loginInfo: language === 'ru'
      ? 'Используйте ваш Л/С (лицевой счёт) как логин для входа в систему.'
      : 'Tizimga kirish uchun L/H (shaxsiy hisob) dan foydalaning.',
    loginInfoTitle: language === 'ru' ? 'Данные для входа:' : 'Kirish ma\'lumotlari:',

    // Language switcher
    languageTitle: language === 'ru' ? 'Язык интерфейса' : 'Interfeys tili',
    languageRu: 'Русский',
    languageUz: 'O\'zbekcha',
    changePassword: language === 'ru' ? 'Изменить пароль' : 'Parolni o\'zgartirish',
  }), [language]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const getContractTypeLabel = (type?: string) => {
    switch (type) {
      case 'commercial': return t.typeCommercial;
      case 'temporary': return t.typeTemporary;
      default: return t.typeStandard;
    }
  };

  if (!user) {
    return null;
  }

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
      // Error handled by store
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleSavePassword = async () => {
    setPasswordError('');

    if (!currentPassword.trim()) {
      setPasswordError(t.enterCurrentPassword);
      return;
    }

    if (newPassword.length < 4) {
      setPasswordError(t.passwordTooShort);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t.passwordsNotMatch);
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError(t.passwordSameAsOld);
      return;
    }

    setPasswordLoading(true);
    try {
      const success = await changePassword(currentPassword, newPassword);
      if (success) {
        setEditingPassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccessMessage(t.passwordChanged);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setPasswordError(t.wrongPassword);
      }
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || '';
      if (errorMessage.includes('incorrect') || errorMessage.includes('неверный')) {
        setPasswordError(t.wrongPassword);
      } else {
        setPasswordError(t.passwordError);
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDownloadContract = async () => {
    if (!user || !qrCodeUrl || isDownloading) return;

    setIsDownloading(true);
    try {
      await generateContractDocx(user, qrCodeUrl, language);
      // Mark contract as signed if not already
      if (!user.contractSignedAt) {
        await markContractSigned();
      }
    } catch (error) {
      console.error('Error generating contract:', error);
      addToast('error', language === 'ru' ? 'Ошибка при генерации договора' : 'Shartnoma yaratishda xatolik');
    } finally {
      setIsDownloading(false);
    }
  };

  const roleLabel = user.role === 'tenant' ? t.tenant : user.role === 'commercial_owner' ? t.commercialOwner : t.resident;

  return (
    <div className="max-w-2xl xl:max-w-3xl mx-auto pb-24 md:pb-6 -mx-4 -mt-4 md:mx-auto md:mt-0">
      {/* User Card */}
      <div className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 opacity-[0.04]" style={{ background: 'radial-gradient(ellipse at top right, rgb(var(--brand-rgb)), transparent 70%)' }} />
        <div className="relative px-5 pb-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
          <div className="flex items-center gap-4">
            <div
              className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.75))' }}
            >
              <UserIcon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{user.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2.5 py-0.5 bg-primary-50 text-primary-600 rounded-full text-xs font-semibold">
                  {roleLabel}
                </span>
                {!isRentalUser && user.contractSignedAt && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-xs font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {t.active}
                  </span>
                )}
              </div>
              {user.address && (
                <div className="flex items-center gap-1 mt-1.5">
                  <MapPin className="w-3 h-3 text-gray-400" />
                  <span className="text-[12px] text-gray-500 truncate">{user.address}{user.apartment ? `, ${t.apartment.toLowerCase()} ${user.apartment}` : ''}</span>
                </div>
              )}
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
        {/* Personal Info Section */}
        <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary-500" />
              {t.personalInfo}
            </h2>
          </div>

          <div className="divide-y divide-gray-50">
            {/* Login (Л/С) */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 bg-primary-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                <Key className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-400 font-medium">{t.personalAccount}</div>
                <div className="font-mono font-bold text-[14px] text-gray-900">{user.login}</div>
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t.cannotChange}</span>
            </div>

            {/* Address */}
            {user.address && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 bg-green-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400 font-medium">{t.address}</div>
                  <div className="font-medium text-[14px] text-gray-900 break-words leading-snug">{user.address}</div>
                </div>
              </div>
            )}

            {/* Apartment & Area row */}
            {(user.apartment || user.totalArea) && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex gap-4 flex-1">
                  {user.apartment && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-purple-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                        <Home className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 font-medium">{t.apartment}</div>
                        <div className="font-bold text-[14px] text-gray-900">{user.apartment}</div>
                      </div>
                    </div>
                  )}
                  {user.totalArea && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-cyan-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                        <Ruler className="w-4 h-4 text-cyan-600" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 font-medium">{t.area}</div>
                        <div className="font-bold text-[14px] text-gray-900">{user.totalArea} m²</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Branch */}
            {user.branch && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 bg-amber-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400 font-medium">{t.branch}</div>
                  <div className="font-bold text-[14px] text-gray-900">{user.branch}</div>
                </div>
              </div>
            )}

            {/* Phone - Editable */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 bg-primary-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-400 font-medium">{t.phone}</div>
                {!editingPhone ? (
                  <div className="font-medium text-[14px] text-gray-900">
                    {user.phone || t.notSpecified}
                  </div>
                ) : (
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full py-1 text-[14px] font-medium text-gray-900 border-b-2 border-primary-400 outline-none bg-transparent"
                    maxLength={13}
                    autoFocus
                  />
                )}
              </div>
              {!editingPhone ? (
                <button
                  onClick={() => {
                    setNewPhone(user.phone || '');
                    setEditingPhone(true);
                  }}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-gray-100 rounded-[10px] transition-colors touch-manipulation"
                >
                  <Edit3 className="w-4 h-4 text-gray-400" />
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={handleSavePhone}
                    disabled={phoneLoading}
                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-green-50 rounded-[10px] transition-colors disabled:opacity-50 touch-manipulation"
                  >
                    {phoneLoading ? (
                      <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 text-green-600" />
                    )}
                  </button>
                  <button
                    onClick={() => setEditingPhone(false)}
                    disabled={phoneLoading}
                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-gray-100 rounded-[10px] transition-colors disabled:opacity-50 touch-manipulation"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Language Switcher Section */}
        <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary-500" />
              {t.languageTitle}
            </h2>
          </div>
          <div className="px-4 pb-4">
            <div className="flex gap-2.5">
              <button
                onClick={() => setLanguage('ru')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-[12px] font-medium transition-all touch-manipulation ${
                  language === 'ru'
                    ? 'bg-primary-500 text-white shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]'
                    : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                }`}
              >
                <span className="text-[16px]">🇷🇺</span>
                <span className="text-[14px] font-semibold">{t.languageRu}</span>
              </button>
              <button
                onClick={() => setLanguage('uz')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-[12px] font-medium transition-all touch-manipulation ${
                  language === 'uz'
                    ? 'bg-primary-500 text-white shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]'
                    : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                }`}
              >
                <span className="text-[16px]">🇺🇿</span>
                <span className="text-[14px] font-semibold">{t.languageUz}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Contract Section - only for residents, not rental users */}
        {!isRentalUser && (
          <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-yellow-500" />
                {t.contractInfo}
              </h2>
            </div>

            <div className="px-4 pb-4">
              <div className="space-y-3">
                {/* Contract Number & Status */}
                <div className="flex gap-3">
                  <div className="flex-1 p-3 bg-yellow-50 rounded-[12px]">
                    <div className="text-xs text-gray-400 mb-0.5">{t.contractNumber}</div>
                    <div className="font-mono font-bold text-[13px] text-gray-900">
                      {user.contractNumber || `ДОГ-${new Date().getFullYear()}-${user.login}`}
                    </div>
                  </div>
                  <div className="flex-1 p-3 bg-gray-50 rounded-[12px]">
                    <div className="text-xs text-gray-400 mb-0.5">{t.contractStatus}</div>
                    <div className="flex items-center gap-1.5">
                      {user.contractSignedAt ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="font-semibold text-[13px] text-green-700">{t.active}</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                          <span className="font-semibold text-[13px] text-yellow-700">{t.pending}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contract Type & Dates */}
                <div className="flex gap-3">
                  <div className="flex-1 p-3 bg-gray-50 rounded-[12px]">
                    <div className="text-xs text-gray-400 mb-0.5">{t.contractType}</div>
                    <div className="font-medium text-[13px] text-gray-900">{getContractTypeLabel(user.contractType)}</div>
                  </div>
                  <div className="flex-1 p-3 bg-gray-50 rounded-[12px]">
                    <div className="text-xs text-gray-400 mb-0.5">{t.contractEnd}</div>
                    <div className="font-medium text-[13px] text-gray-900 flex items-center gap-1">
                      {user.contractEndDate ? formatDate(user.contractEndDate) : (
                        <>
                          <Sparkles className="w-3 h-3 text-green-500" />
                          {t.indefinite}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-[14px] border border-dashed border-gray-200">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="QR Code" className="w-20 h-20 rounded-[8px]" />
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded-[8px] animate-pulse" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-gray-500" />
                      {t.yourQrCode}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{t.qrHint}</p>
                    <div className="mt-1.5">
                      <span className="text-xs text-gray-400">ID:</span>
                      <span className="font-mono text-xs font-bold text-gray-500 ml-1 select-all">{user.id}</span>
                    </div>
                  </div>
                </div>

                {/* Contract Actions */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setShowContract(!showContract)}
                    className="flex items-center justify-center gap-2 px-3 py-3 min-h-[44px] bg-gray-50 active:bg-gray-100 rounded-[12px] text-[13px] font-semibold text-gray-600 transition-colors touch-manipulation"
                  >
                    {showContract ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showContract ? t.hideContract : t.viewContract}
                  </button>
                  <button
                    onClick={handleDownloadContract}
                    disabled={isDownloading || !qrCodeUrl}
                    className="flex items-center justify-center gap-2 px-3 py-3 min-h-[44px] bg-primary-500 active:bg-primary-600 disabled:bg-gray-200 rounded-[12px] text-[13px] font-semibold text-white disabled:text-gray-400 transition-colors touch-manipulation shadow-[0_4px_12px_rgba(var(--brand-rgb),0.25)]"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isDownloading ? t.downloading : t.downloadContract}
                  </button>
                </div>
              </div>
            </div>

            {/* Contract Preview - Full Document */}
            {showContract && (
              <div className="px-4 pb-4">
                <ContractPreview user={user} qrCodeUrl={qrCodeUrl} language={language} />
              </div>
            )}
          </div>
        )}

        {/* Security Section */}
        <div className="bg-white rounded-[18px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-500" />
              {t.security}
            </h2>
          </div>

          <div className="px-4 pb-4">
            {!editingPassword ? (
              <button
                onClick={() => setEditingPassword(true)}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-[12px] active:bg-gray-100 transition-colors touch-manipulation"
              >
                <div className="w-9 h-9 bg-red-50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                  <Key className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[14px] font-semibold text-gray-900">{t.changePassword}</div>
                  <div className="text-xs text-gray-400">••••••••</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ) : (
              <div className="space-y-3">
                {/* Current Password */}
                <div>
                  <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                    {t.currentPassword}
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 rounded-[12px] text-[14px] outline-none focus:ring-2 focus:ring-primary-500/20 focus:bg-white border border-transparent focus:border-primary-300"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 touch-manipulation"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                    {t.newPassword}
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 rounded-[12px] text-[14px] outline-none focus:ring-2 focus:ring-primary-500/20 focus:bg-white border border-transparent focus:border-primary-300"
                      placeholder={t.minChars}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 touch-manipulation"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                    {t.confirmPassword}
                  </label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-[12px] text-[14px] outline-none focus:ring-2 focus:ring-primary-500/20 focus:bg-white border border-transparent focus:border-primary-300"
                    placeholder={t.repeatPassword}
                  />
                </div>

                {/* Error Message */}
                {passwordError && (
                  <div className="p-2.5 bg-red-50 text-red-600 text-[13px] rounded-[10px] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {passwordError}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={() => {
                      setEditingPassword(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setPasswordError('');
                    }}
                    disabled={passwordLoading}
                    className="flex-1 py-3 min-h-[44px] bg-gray-50 active:bg-gray-100 rounded-[12px] text-[14px] font-semibold text-gray-600 transition-colors touch-manipulation"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleSavePassword}
                    disabled={passwordLoading}
                    className="flex-1 py-3 min-h-[44px] bg-primary-500 active:bg-primary-600 rounded-[12px] text-[14px] font-semibold text-white flex items-center justify-center gap-2 transition-colors touch-manipulation shadow-[0_4px_12px_rgba(var(--brand-rgb),0.25)]"
                  >
                    {passwordLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {t.save}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Install App Section */}
        <InstallAppSection language={language} />

        {/* Info Note - only for residents */}
        {!isRentalUser && (
          <div className="p-4 bg-primary-50 rounded-[14px] text-[13px] text-primary-700">
            <p className="font-semibold mb-1">{t.loginInfoTitle}</p>
            <p className="text-primary-600">{t.loginInfo}</p>
          </div>
        )}
      </div>
    </div>
  );
}

