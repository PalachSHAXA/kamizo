import { useState, useEffect, useMemo } from 'react';
import {
  Key, MapPin, Home, Phone, Save, Eye, EyeOff, Edit3,
  AlertCircle, Shield, Loader2, X, FileText, CheckCircle,
  Building2, Ruler, QrCode, Globe,
  Download, User as UserIcon, Sparkles
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { generateQRCode } from '../components/LazyQRCode';
import { generateContractDocx } from '../utils/contractGenerator';
import { ContractPreview } from '../components/ContractPreview';

export function ResidentProfilePage() {
  const { user, changePassword, updateProfile, markContractSigned } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();

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
        // Password change is now tracked in DB (passwordChangedAt) via authStore.changePassword
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
      alert(language === 'ru' ? 'Ошибка при генерации договора' : 'Shartnoma yaratishda xatolik');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24 md:pb-6">
      {/* Header Card */}
      <div className="glass-card p-4 md:p-6 bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200">
        <h1 className="text-lg font-bold text-gray-900 leading-tight">{user.name}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
            {user.role === 'tenant' ? t.tenant : user.role === 'commercial_owner' ? t.commercialOwner : t.resident}
          </span>
          {!isRentalUser && user.contractSignedAt && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {t.active}
            </span>
          )}
        </div>
        <p className="text-gray-500 mt-2 text-xs">{t.personalData}</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="p-3 bg-green-50 text-green-700 rounded-xl flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Personal Info Section */}
      <div className="glass-card p-4 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
          <UserIcon className="w-5 h-5 text-primary-500" />
          {t.personalInfo}
        </h2>

        <div className="space-y-4">
          {/* Login (Л/С) */}
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Key className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500 font-medium">{t.personalAccount}</div>
              <div className="font-mono font-bold text-gray-900">{user.login}</div>
            </div>
            <div className="px-2 py-1 bg-gray-200 rounded text-xs text-gray-500 flex-shrink-0">
              {t.cannotChange}
            </div>
          </div>

          {/* Address */}
          {user.address && (
            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 font-medium">{t.address}</div>
                <div className="font-medium text-gray-900 break-words leading-snug">{user.address}</div>
              </div>
            </div>
          )}

          {/* Apartment and Area - Grid */}
          <div className="grid grid-cols-2 gap-3">
            {user.apartment && (
              <div className="p-3 bg-purple-50 rounded-xl text-center">
                <Home className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <div className="text-xs text-gray-500">{t.apartment}</div>
                <div className="font-bold text-gray-900">{user.apartment}</div>
              </div>
            )}
            {user.totalArea && (
              <div className="p-3 bg-cyan-50 rounded-xl text-center">
                <Ruler className="w-5 h-5 text-cyan-600 mx-auto mb-1" />
                <div className="text-xs text-gray-500">{t.area}</div>
                <div className="font-bold text-gray-900">{user.totalArea} м²</div>
              </div>
            )}
          </div>

          {/* Branch (only show if not redundant with address) */}
          {user.branch && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
              <Building2 className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-xs text-gray-500">{t.branch}</div>
                <div className="font-bold text-gray-900">{user.branch}</div>
              </div>
            </div>
          )}

          {/* Phone - Editable */}
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Phone className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500 font-medium">{t.phone}</div>
              {!editingPhone ? (
                <div className="font-medium text-gray-900">
                  {user.phone || t.notSpecified}
                </div>
              ) : (
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+998 90 123 45 67"
                  className="input-field py-1.5 text-sm"
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
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Edit3 className="w-5 h-5 text-gray-500" />
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={handleSavePhone}
                  disabled={phoneLoading}
                  className="p-2 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {phoneLoading ? (
                    <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5 text-green-600" />
                  )}
                </button>
                <button
                  onClick={() => setEditingPhone(false)}
                  disabled={phoneLoading}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Language Switcher Section */}
      <div className="glass-card p-4 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-blue-500" />
          {t.languageTitle}
        </h2>

        <div className="flex gap-3">
          <button
            onClick={() => setLanguage('ru')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
              language === 'ru'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className="text-lg">🇷🇺</span>
            {t.languageRu}
          </button>
          <button
            onClick={() => setLanguage('uz')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
              language === 'uz'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className="text-lg">🇺🇿</span>
            {t.languageUz}
          </button>
        </div>
      </div>

      {/* Contract Section - only for residents, not rental users */}
      {!isRentalUser && (
        <div className="glass-card p-4 md:p-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-yellow-500" />
            {t.contractInfo}
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Contract Details */}
            <div className="space-y-3">
              {/* Contract Number */}
              <div className="p-3 bg-yellow-50 rounded-xl">
                <div className="text-xs text-gray-500 mb-1">{t.contractNumber}</div>
                <div className="font-mono font-bold text-gray-900">
                  {user.contractNumber || `ДОГ-${new Date().getFullYear()}-${user.login}`}
                </div>
              </div>

              {/* Contract Type */}
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-xs text-gray-500 mb-1">{t.contractType}</div>
                <div className="font-medium text-gray-900">
                  {getContractTypeLabel(user.contractType)}
                </div>
              </div>

              {/* Status */}
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-xs text-gray-500 mb-1">{t.contractStatus}</div>
                <div className="flex items-center gap-2">
                  {user.contractSignedAt ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="font-medium text-green-700">{t.active}</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span className="font-medium text-yellow-700">{t.pending}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">{t.contractStart}</div>
                  <div className="font-medium text-gray-900 text-sm">
                    {formatDate(user.contractStartDate || user.contractSignedAt || user.createdAt)}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">{t.contractEnd}</div>
                  <div className="font-medium text-gray-900 text-sm flex items-center gap-1">
                    {user.contractEndDate ? formatDate(user.contractEndDate) : (
                      <>
                        <Sparkles className="w-3 h-3 text-green-500" />
                        {t.indefinite}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* QR Code & Signature ID */}
            <div className="flex flex-col items-center justify-center p-4 bg-white border-2 border-dashed border-gray-200 rounded-xl">
              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <QrCode className="w-3 h-3" />
                {t.yourQrCode}
              </div>
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32" />
              ) : (
                <div className="w-32 h-32 bg-gray-100 rounded animate-pulse" />
              )}
              <p className="text-xs text-gray-400 mt-2 text-center max-w-[180px]">
                {t.qrHint}
              </p>
              {/* Signature ID */}
              <div className="mt-3 pt-3 border-t border-gray-200 w-full text-center">
                <div className="text-xs text-gray-500">{language === 'ru' ? 'ID подписи' : 'Imzo ID'}</div>
                <div className="font-mono text-sm font-bold text-gray-700 select-all">{user.id}</div>
              </div>
            </div>
          </div>

          {/* Contract Actions */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={() => setShowContract(!showContract)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
            >
              {showContract ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showContract ? t.hideContract : t.viewContract}
            </button>
            <button
              onClick={handleDownloadContract}
              disabled={isDownloading || !qrCodeUrl}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-400 hover:bg-orange-500 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-gray-900 transition-colors"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isDownloading ? t.downloading : t.downloadContract}
            </button>
          </div>

          {/* Contract Preview - Full Document */}
          {showContract && (
            <div className="mt-4">
              <ContractPreview user={user} qrCodeUrl={qrCodeUrl} language={language} />
            </div>
          )}
        </div>
      )}

      {/* Security Section */}
      <div className="glass-card p-4 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-red-500" />
          {t.security}
        </h2>

        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Key className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-gray-500 font-medium">{t.password}</div>
            <div className="font-medium text-gray-900">••••••••</div>
          </div>
          {!editingPassword && (
            <button
              onClick={() => setEditingPassword(true)}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Edit3 className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {editingPassword && (
          <div className="space-y-3 mt-4 pt-4 border-t">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.currentPassword}
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.newPassword}
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder={t.minChars}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.confirmPassword}
              </label>
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder={t.repeatPassword}
              />
            </div>

            {/* Error Message */}
            {passwordError && (
              <div className="p-2 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {passwordError}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setEditingPassword(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordError('');
                }}
                disabled={passwordLoading}
                className="btn-secondary flex-1"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSavePassword}
                disabled={passwordLoading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
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

      {/* Info Note - only for residents */}
      {!isRentalUser && (
        <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-700">
          <p className="font-medium mb-1">{t.loginInfoTitle}</p>
          <p>{t.loginInfo}</p>
        </div>
      )}
    </div>
  );
}
