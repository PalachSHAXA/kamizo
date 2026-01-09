import { useState, useEffect } from 'react';
import { Building2, Settings, Bell, Users, CheckCircle, User, Globe, Trash2, AlertTriangle, Loader2, Smartphone, Send, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { apiRequest, usersApi } from '../../services/api';
import { pushNotifications as pushService } from '../../services/pushNotifications';

export function SettingsPage() {
  const { settings, updateSettings } = useDataStore();
  const { user, updateUserProfile } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'profile' | 'general' | 'notifications' | 'integrations' | 'users'>('profile');
  const [saved, setSaved] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Update profile form when user changes
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

  // Push notification state
  const [pushStatus, setPushStatus] = useState<{
    isSupported: boolean;
    permission: NotificationPermission | 'unsupported';
    isSubscribed: boolean;
    endpoint?: string;
  }>({
    isSupported: false,
    permission: 'unsupported',
    isSubscribed: false
  });
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [pushTestResult, setPushTestResult] = useState<string | null>(null);

  // Check push notification status on mount
  useEffect(() => {
    const checkPushStatus = () => {
      const isSupported = pushService.isSupported();
      const permission = isSupported ? pushService.getPermission() : 'unsupported';
      const isSubscribed = pushService.isSubscribed();
      const subscription = pushService.getSubscription();

      setPushStatus({
        isSupported,
        permission: permission as NotificationPermission | 'unsupported',
        isSubscribed,
        endpoint: subscription?.endpoint
      });
    };

    checkPushStatus();
  }, []);

  // Handle push subscription
  const handleEnablePush = async () => {
    setIsPushLoading(true);
    setPushTestResult(null);
    try {
      console.log('[Settings] Enabling push notifications...');
      const subscription = await pushService.subscribe();
      if (subscription) {
        setPushStatus(prev => ({
          ...prev,
          permission: 'granted',
          isSubscribed: true,
          endpoint: subscription.endpoint
        }));
        setPushTestResult('Push-уведомления успешно включены!');
      } else {
        setPushTestResult('Не удалось подписаться. Проверьте разрешения браузера.');
      }
    } catch (error) {
      console.error('[Settings] Push enable error:', error);
      setPushTestResult(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsPushLoading(false);
    }
  };

  // Send test push notification
  const handleTestPush = async () => {
    setIsPushLoading(true);
    setPushTestResult(null);
    try {
      console.log('[Settings] Sending test push notification...');
      const response = await apiRequest<{ success: boolean; message?: string }>('/api/push/test', {
        method: 'POST'
      });
      if (response.success) {
        setPushTestResult('Тестовое уведомление отправлено! Проверьте телефон.');
      } else {
        setPushTestResult(response.message || 'Не удалось отправить уведомление');
      }
    } catch (error) {
      console.error('[Settings] Test push error:', error);
      setPushTestResult(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsPushLoading(false);
    }
  };

  // Refresh push status
  const handleRefreshPushStatus = async () => {
    const isSupported = pushService.isSupported();
    const permission = isSupported ? pushService.getPermission() : 'unsupported';
    const isSubscribed = pushService.isSubscribed();
    const subscription = pushService.getSubscription();

    setPushStatus({
      isSupported,
      permission: permission as NotificationPermission | 'unsupported',
      isSubscribed,
      endpoint: subscription?.endpoint
    });

    // Also check server-side subscription
    try {
      const serverStatus = await apiRequest<{ subscribed: boolean }>('/api/push/status');
      console.log('[Settings] Server push status:', serverStatus);
    } catch (e) {
      console.error('[Settings] Failed to get server push status:', e);
    }
  };

  // Local state for form editing
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companyInn, setCompanyInn] = useState(settings.companyInn);
  const [companyAddress, setCompanyAddress] = useState(settings.companyAddress);
  const [companyPhone, setCompanyPhone] = useState(settings.companyPhone);
  const [routingMode, setRoutingMode] = useState(settings.routingMode);
  const [workingHoursStart, setWorkingHoursStart] = useState(settings.workingHoursStart);
  const [workingHoursEnd, setWorkingHoursEnd] = useState(settings.workingHoursEnd);
  const [autoAssign, setAutoAssign] = useState(settings.autoAssign);
  const [notifyOnNew, setNotifyOnNew] = useState(settings.notifyOnNew);
  const [notifyOnComplete, setNotifyOnComplete] = useState(settings.notifyOnComplete);
  const [notifyOnRating, setNotifyOnRating] = useState(settings.notifyOnRating);
  const [smsNotifications, setSmsNotifications] = useState(settings.smsNotifications);
  const [emailNotifications, setEmailNotifications] = useState(settings.emailNotifications);
  const [pushNotifications, setPushNotifications] = useState(settings.pushNotifications);

  const handleSave = () => {
    updateSettings({
      companyName,
      companyInn,
      companyAddress,
      companyPhone,
      routingMode,
      workingHoursStart,
      workingHoursEnd,
      autoAssign,
      notifyOnNew,
      notifyOnComplete,
      notifyOnRating,
      smsNotifications,
      emailNotifications,
      pushNotifications,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleResetRequests = async () => {
    setIsResetting(true);
    setResetMessage(null);
    try {
      await apiRequest('/api/admin/requests/reset', { method: 'POST' });
      setResetMessage({ type: 'success', text: 'Все заявки успешно удалены' });
      setShowResetModal(false);
      // Refresh page data after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setResetMessage({ type: 'error', text: err.message || 'Ошибка при сбросе заявок' });
    } finally {
      setIsResetting(false);
    }
  };

  // Save profile
  const handleSaveProfile = async () => {
    setIsProfileSaving(true);
    setProfileMessage(null);
    try {
      const result = await usersApi.updateMe({
        name: profileName,
        phone: profilePhone,
      });
      if (result.user && user) {
        updateUserProfile(user.login, { name: result.user.name, phone: result.user.phone });
      }
      setProfileMessage({ type: 'success', text: 'Профиль успешно сохранён' });
      setTimeout(() => setProfileMessage(null), 3000);
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || 'Ошибка при сохранении профиля' });
    } finally {
      setIsProfileSaving(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    setPasswordMessage(null);

    // Validation
    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Введите текущий пароль' });
      return;
    }
    if (!newPassword) {
      setPasswordMessage({ type: 'error', text: 'Введите новый пароль' });
      return;
    }
    if (newPassword.length < 4) {
      setPasswordMessage({ type: 'error', text: 'Пароль должен быть минимум 4 символа' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Пароли не совпадают' });
      return;
    }

    setIsPasswordSaving(true);
    try {
      await usersApi.changePassword(currentPassword, newPassword);
      setPasswordMessage({ type: 'success', text: 'Пароль успешно изменён' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMessage(null), 3000);
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'Ошибка при смене пароля' });
    } finally {
      setIsPasswordSaving(false);
    }
  };

  // Different tabs for admin vs manager
  const tabs = isAdmin
    ? [
        { id: 'profile' as const, label: 'Профиль', icon: User },
        { id: 'general' as const, label: 'Общие', icon: Settings },
        { id: 'notifications' as const, label: 'Уведомления', icon: Bell },
        { id: 'integrations' as const, label: 'Интеграции', icon: Globe },
        { id: 'users' as const, label: 'Пользователи', icon: Users },
      ]
    : [
        { id: 'profile' as const, label: 'Профиль', icon: User },
        { id: 'notifications' as const, label: 'Уведомления', icon: Bell },
      ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - mobile optimized */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Настройки</h1>
          <p className="text-gray-500 text-sm md:text-base mt-0.5 md:mt-1">Параметры системы</p>
        </div>
        {saved && (
          <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-green-100 text-green-700 rounded-xl text-sm">
            <CheckCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Сохранено</span>
          </div>
        )}
      </div>

      {/* Tabs - horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar">
        <div className="glass-card p-1 inline-flex gap-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 md:px-4 rounded-xl font-medium transition-colors text-sm md:text-base whitespace-nowrap touch-manipulation ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-gray-900'
                  : 'hover:bg-white/30 text-gray-600 active:bg-white/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Profile Settings */}
      {activeTab === 'profile' && (
        <div className="space-y-4 md:space-y-6">
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400" />
              Мой профиль
            </h2>
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-3xl font-bold text-white">
                  {profileName?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
                </div>
              </div>

              {/* User Info */}
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="input-field text-base"
                      placeholder="Введите имя"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Логин</label>
                    <input
                      type="text"
                      value={user?.login || ''}
                      disabled
                      className="input-field text-base bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="input-field text-base"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="input-field text-base"
                      placeholder="+998 90 123 45 67"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      user?.role === 'admin' ? 'bg-red-100 text-red-700' :
                      user?.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user?.role === 'admin' ? 'Администратор' :
                       user?.role === 'manager' ? 'Менеджер' :
                       user?.role || 'Пользователь'}
                    </span>
                  </div>
                </div>

                {profileMessage && (
                  <div className={`p-3 rounded-xl text-sm ${
                    profileMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {profileMessage.text}
                  </div>
                )}

                <button
                  onClick={handleSaveProfile}
                  disabled={isProfileSaving}
                  className="btn-primary py-2.5 px-6 flex items-center gap-2 touch-manipulation"
                >
                  {isProfileSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    'Сохранить профиль'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Language Settings */}
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-gray-400" />
              Язык интерфейса
            </h2>
            <div className="flex gap-3">
              <button
                onClick={() => setLanguage('ru')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                  language === 'ru'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-primary-300'
                }`}
              >
                <div className="text-2xl mb-1">🇷🇺</div>
                <div className="font-medium">Русский</div>
              </button>
              <button
                onClick={() => setLanguage('uz')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                  language === 'uz'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-primary-300'
                }`}
              >
                <div className="text-2xl mb-1">🇺🇿</div>
                <div className="font-medium">O'zbekcha</div>
              </button>
            </div>
          </div>

          {/* Change Password */}
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Изменить пароль</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Текущий пароль</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-field text-base pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-field text-base pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Подтвердите пароль</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field text-base"
                  placeholder="••••••••"
                />
              </div>

              {passwordMessage && (
                <div className={`p-3 rounded-xl text-sm ${
                  passwordMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {passwordMessage.text}
                </div>
              )}

              <button
                onClick={handleChangePassword}
                disabled={isPasswordSaving}
                className="btn-secondary py-2.5 px-6 flex items-center gap-2 touch-manipulation"
              >
                {isPasswordSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Изменить пароль'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* General Settings */}
      {activeTab === 'general' && isAdmin && (
        <div className="space-y-4 md:space-y-6">
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-400" />
              Информация о компании
            </h2>
            <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название компании</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input-field text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ИНН</label>
                <input type="text" value={companyInn} onChange={(e) => setCompanyInn(e.target.value)} className="input-field text-base" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                <input type="text" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} className="input-field text-base" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                <input type="tel" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} className="input-field text-base" />
              </div>
            </div>
          </div>

          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-400" />
              Режим работы
            </h2>
            <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Режим маршрутизации</label>
                <select
                  value={routingMode}
                  onChange={(e) => setRoutingMode(e.target.value as 'manual' | 'auto' | 'hybrid')}
                  className="input-field text-base"
                >
                  <option value="hybrid">Гибридный</option>
                  <option value="auto">Автоматический</option>
                  <option value="manual">Ручной</option>
                </select>
                <p className="text-xs text-gray-500 mt-1 hidden md:block">
                  Гибридный: система предлагает исполнителя, менеджер подтверждает
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Приоритет распределения</label>
                <select className="input-field text-base">
                  <option value="rating">По рейтингу</option>
                  <option value="workload">По загруженности</option>
                  <option value="distance">По расстоянию</option>
                  <option value="fifo">По очереди</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Начало рабочего дня</label>
                <input
                  type="time"
                  value={workingHoursStart}
                  onChange={(e) => setWorkingHoursStart(e.target.value)}
                  className="input-field text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Конец рабочего дня</label>
                <input
                  type="time"
                  value={workingHoursEnd}
                  onChange={(e) => setWorkingHoursEnd(e.target.value)}
                  className="input-field text-base"
                />
              </div>
            </div>

            <div className="mt-4 md:mt-6 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer p-2 -mx-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  checked={autoAssign}
                  onChange={(e) => setAutoAssign(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Автоматически назначать заявки</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer p-2 -mx-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Исполнители могут брать заявки</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer p-2 -mx-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Подтверждение от жителя</span>
              </label>
            </div>
          </div>

          <button onClick={handleSave} className="btn-primary w-full md:w-auto py-3 md:py-2 text-base touch-manipulation">
            Сохранить изменения
          </button>

          {/* Danger Zone */}
          <div className="glass-card p-4 md:p-6 border-2 border-red-200 bg-red-50/30">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Опасная зона
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-white/50 rounded-xl">
                <div className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
                  <div>
                    <div className="font-medium text-red-700">Сбросить все заявки</div>
                    <div className="text-sm text-gray-600 mt-1">Удалить все заявки, историю и сообщения. Это действие нельзя отменить.</div>
                  </div>
                  <button
                    onClick={() => setShowResetModal(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2 touch-manipulation flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    Сбросить
                  </button>
                </div>
              </div>
              {resetMessage && (
                <div className={`p-3 rounded-xl ${resetMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {resetMessage.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notifications Settings */}
      {activeTab === 'notifications' && (
        <div className="space-y-4 md:space-y-6">
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-gray-400" />
              Каналы уведомлений
            </h2>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 md:p-4 bg-white/30 rounded-xl cursor-pointer touch-manipulation active:bg-white/50">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="font-medium text-sm md:text-base">Push-уведомления</div>
                  <div className="text-xs md:text-sm text-gray-500">В приложении и браузере</div>
                </div>
                <input
                  type="checkbox"
                  checked={pushNotifications}
                  onChange={(e) => setPushNotifications(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
              </label>
              <label className="flex items-center justify-between p-3 md:p-4 bg-white/30 rounded-xl cursor-pointer touch-manipulation active:bg-white/50">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="font-medium text-sm md:text-base">SMS-уведомления</div>
                  <div className="text-xs md:text-sm text-gray-500">На телефон</div>
                </div>
                <input
                  type="checkbox"
                  checked={smsNotifications}
                  onChange={(e) => setSmsNotifications(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
              </label>
              <label className="flex items-center justify-between p-3 md:p-4 bg-white/30 rounded-xl cursor-pointer touch-manipulation active:bg-white/50">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="font-medium text-sm md:text-base">Email-уведомления</div>
                  <div className="text-xs md:text-sm text-gray-500">На почту</div>
                </div>
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
              </label>
              <label className="flex items-center justify-between p-3 md:p-4 bg-white/30 rounded-xl cursor-pointer touch-manipulation active:bg-white/50">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="font-medium text-sm md:text-base">Telegram-бот</div>
                  <div className="text-xs md:text-sm text-gray-500">Через Telegram</div>
                </div>
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
              </label>
            </div>
          </div>

          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">События для уведомлений</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  checked={notifyOnNew}
                  onChange={(e) => setNotifyOnNew(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Новая заявка</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Назначена исполнителю</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Принята исполнителем</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Работа начата</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  checked={notifyOnComplete}
                  onChange={(e) => setNotifyOnComplete(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Выполнена</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  checked={notifyOnRating}
                  onChange={(e) => setNotifyOnRating(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Получена оценка</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/30 touch-manipulation">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm">Срочная заявка</span>
              </label>
            </div>
          </div>

          {/* Push Notifications Setup */}
          <div className="glass-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-gray-400" />
                Настройка Push-уведомлений
              </h2>
              <button
                onClick={handleRefreshPushStatus}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Обновить статус"
              >
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Status Info */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between p-3 bg-white/30 rounded-xl">
                <span className="text-sm text-gray-600">Поддержка браузера:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  pushStatus.isSupported ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {pushStatus.isSupported ? 'Поддерживается' : 'Не поддерживается'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/30 rounded-xl">
                <span className="text-sm text-gray-600">Разрешение:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  pushStatus.permission === 'granted' ? 'bg-green-100 text-green-700' :
                  pushStatus.permission === 'denied' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {pushStatus.permission === 'granted' ? 'Разрешено' :
                   pushStatus.permission === 'denied' ? 'Запрещено' :
                   pushStatus.permission === 'default' ? 'Не запрошено' : 'Недоступно'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/30 rounded-xl">
                <span className="text-sm text-gray-600">Подписка на сервере:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  pushStatus.isSubscribed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {pushStatus.isSubscribed ? 'Активна' : 'Не активна'}
                </span>
              </div>

              {pushStatus.endpoint && (
                <div className="p-3 bg-white/30 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Endpoint:</div>
                  <div className="text-xs text-gray-500 font-mono break-all">
                    {pushStatus.endpoint.substring(0, 80)}...
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2">
              {pushStatus.permission !== 'granted' && pushStatus.isSupported && (
                <button
                  onClick={handleEnablePush}
                  disabled={isPushLoading}
                  className="flex-1 px-4 py-3 bg-orange-400 hover:bg-orange-500 text-black font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
                >
                  {isPushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  Включить уведомления
                </button>
              )}

              {pushStatus.permission === 'granted' && (
                <button
                  onClick={handleTestPush}
                  disabled={isPushLoading}
                  className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
                >
                  {isPushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Отправить тест
                </button>
              )}
            </div>

            {/* Result Message */}
            {pushTestResult && (
              <div className={`mt-3 p-3 rounded-xl text-sm ${
                pushTestResult.includes('успешно') || pushTestResult.includes('отправлено')
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {pushTestResult}
              </div>
            )}

            {/* Help Text */}
            <div className="mt-4 p-3 bg-blue-50 rounded-xl">
              <div className="text-sm text-blue-800">
                <strong>Для iOS:</strong> Чтобы получать уведомления на iPhone/iPad:
                <ol className="list-decimal ml-4 mt-2 space-y-1 text-xs">
                  <li>Откройте Safari и перейдите на app.kamizo.uz</li>
                  <li>Нажмите кнопку "Поделиться" (квадрат со стрелкой)</li>
                  <li>Выберите "На экран Домой"</li>
                  <li>Откройте приложение с домашнего экрана</li>
                  <li>Нажмите "Включить уведомления" выше</li>
                </ol>
              </div>
            </div>
          </div>

          <button onClick={handleSave} className="btn-primary w-full md:w-auto py-3 md:py-2 text-base touch-manipulation">
            Сохранить изменения
          </button>
        </div>
      )}

      {/* Integrations */}
      {activeTab === 'integrations' && isAdmin && (
        <div className="space-y-4 md:space-y-6">
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Интеграции</h2>
            <div className="space-y-3">
              <div className="p-3 md:p-4 bg-white/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">📱</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm md:text-base truncate">MENING UYIM</div>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs flex-shrink-0">Подключено</span>
                    </div>
                    <div className="text-xs md:text-sm text-gray-500 mt-0.5">Синхр. 5 мин назад</div>
                  </div>
                </div>
              </div>

              <div className="p-3 md:p-4 bg-white/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">💰</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm md:text-base">Платежи</div>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs flex-shrink-0">Подключено</span>
                    </div>
                    <div className="text-xs md:text-sm text-gray-500 mt-0.5">Click, Payme, Uzum</div>
                  </div>
                </div>
              </div>

              <div className="p-3 md:p-4 bg-white/30 rounded-xl opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">📊</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm md:text-base">1С:Бухгалтерия</div>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs flex-shrink-0">Скоро</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">В разработке</div>
                  </div>
                </div>
              </div>

              <div className="p-3 md:p-4 bg-white/30 rounded-xl opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">🤖</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm md:text-base">Telegram Bot</div>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs flex-shrink-0">Скоро</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">В разработке</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Management */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-4 md:space-y-6">
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" />
              Менеджеры системы
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 md:p-4 bg-white/30 rounded-xl">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center font-medium text-primary-700 flex-shrink-0">
                  АИ
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm md:text-base">Админ</div>
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs flex-shrink-0">Админ</span>
                  </div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">admin@uk.uz</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 md:p-4 bg-white/30 rounded-xl">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-medium text-blue-700 flex-shrink-0">
                  МИ
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm md:text-base">Менеджер</div>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs flex-shrink-0">Менеджер</span>
                  </div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">manager@uk.uz</div>
                </div>
              </div>
            </div>
            <button className="btn-secondary mt-4 w-full md:w-auto py-2.5 touch-manipulation">+ Добавить менеджера</button>
          </div>

          <div className="glass-card p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Права доступа</h2>
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
              <table className="w-full text-xs md:text-sm min-w-[400px]">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="pb-2 md:pb-3 font-medium">Право</th>
                    <th className="pb-2 md:pb-3 font-medium text-center px-1">А</th>
                    <th className="pb-2 md:pb-3 font-medium text-center px-1">М</th>
                    <th className="pb-2 md:pb-3 font-medium text-center px-1">И</th>
                    <th className="pb-2 md:pb-3 font-medium text-center px-1">Ж</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 md:py-3">Все заявки</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                  </tr>
                  <tr>
                    <td className="py-2 md:py-3">Создание заявок</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                  </tr>
                  <tr>
                    <td className="py-2 md:py-3">Назначение</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                  </tr>
                  <tr>
                    <td className="py-2 md:py-3">Пользователи</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                  </tr>
                  <tr>
                    <td className="py-2 md:py-3">Настройки</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                  </tr>
                  <tr>
                    <td className="py-2 md:py-3">Отчёты</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">✅</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                    <td className="py-2 md:py-3 text-center">❌</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">А - Админ, М - Менеджер, И - Исполнитель, Ж - Житель</p>
          </div>
        </div>
      )}

      {/* Reset Requests Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Подтвердите действие</h3>
                <p className="text-sm text-gray-500">Это действие нельзя отменить</p>
              </div>
            </div>
            <p className="text-gray-700 mb-6">
              Вы уверены, что хотите удалить <strong>все заявки</strong>? Это также удалит всю историю изменений и сообщения в чатах заявок.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={isResetting}
              >
                Отмена
              </button>
              <button
                onClick={handleResetRequests}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                disabled={isResetting}
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Удаление...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Удалить все
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
