import { useState, useEffect } from 'react';
import { Bell, X, Loader2, Share, Plus } from 'lucide-react';
import { pushNotifications } from '../services/pushNotifications';
import { useAuthStore } from '../stores/authStore';
import { useTenantStore } from '../stores/tenantStore';

// Detect iOS (iPhone, iPad, iPod)
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Check if running as installed PWA (standalone mode)
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

export function PushNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const { user } = useAuthStore();
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';

  useEffect(() => {
    const dismissedKey = `push_prompt_dismissed_${user?.id || 'anon'}`;
    const sessionKey = `push_prompt_shown_${user?.id || 'anon'}`;
    const wasDismissed = localStorage.getItem(dismissedKey);
    const lastDismissedTime = wasDismissed ? parseInt(wasDismissed) : 0;
    const daysSinceDismissed = (Date.now() - lastDismissedTime) / (1000 * 60 * 60 * 24);

    // Don't show if dismissed within 7 days or already shown this session
    const alreadyShownThisSession = sessionStorage.getItem(sessionKey);
    const shouldShow = !alreadyShownThisSession && (!wasDismissed || daysSinceDismissed > 7);
    if (!shouldShow) return;

    // iOS in browser (not PWA) - show "Add to Home Screen" prompt
    if (isIOS() && !isStandalone()) {
      const timer = setTimeout(() => {
        setShowIOSPrompt(true);
        sessionStorage.setItem(sessionKey, '1');
      }, 3000);
      return () => clearTimeout(timer);
    }

    // All other platforms - show standard push prompt
    if (!pushNotifications.isBrowserNotificationsSupported()) return;

    const permission = pushNotifications.getPermission();
    if (permission === 'default') {
      const timer = setTimeout(() => {
        setShow(true);
        sessionStorage.setItem(sessionKey, '1');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [user?.id]);

  const handleAllow = async () => {
    setIsSubscribing(true);
    try {
      // Subscribe to Web Push (this also requests permission)
      const subscription = await pushNotifications.subscribe();

      // Show test notification via Service Worker for better mobile support
      if ('serviceWorker' in navigator) {
        try {
          const swRegistration = await navigator.serviceWorker.ready;
          await swRegistration.showNotification('Уведомления включены!', {
            body: subscription
              ? `Теперь вы будете получать уведомления от УК ${tenantName} даже когда приложение закрыто.`
              : 'Теперь вы будете получать важные уведомления о заявках и объявлениях.',
            icon: '/icons/favicon.ico',
            badge: '/icons/favicon.ico',
            tag: 'welcome-notification',
            requireInteraction: false,
          });
        } catch (swError) {
          console.warn('Service Worker notification failed, falling back:', swError);
          await pushNotifications.show({
            title: 'Уведомления включены!',
            body: 'Теперь вы будете получать важные уведомления о заявках и объявлениях.',
            requireInteraction: false,
          });
        }
      } else if (!subscription) {
        const granted = await pushNotifications.requestPermission();
        if (granted) {
          await pushNotifications.show({
            title: 'Уведомления включены!',
            body: 'Теперь вы будете получать важные уведомления о заявках и объявлениях.',
            requireInteraction: false,
          });
        }
      }
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
    } finally {
      setIsSubscribing(false);
      setShow(false);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    const dismissedKey = `push_prompt_dismissed_${user?.id || 'anon'}`;
    localStorage.setItem(dismissedKey, Date.now().toString());
    setShow(false);
    setShowIOSPrompt(false);
    setDismissed(true);
  };

  if (dismissed) return null;

  // iOS "Add to Home Screen" prompt
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[150] animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">Установите приложение</h3>
              <p className="text-sm text-gray-600 mt-1">
                Чтобы получать уведомления на iPhone, добавьте {tenantName} на домашний экран:
              </p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Share className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span>Нажмите <strong>Поделиться</strong> внизу экрана</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Plus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span>Выберите <strong>На экран «Домой»</strong></span>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="mt-3 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Понятно
              </button>
            </div>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard push notification prompt (Android/Desktop)
  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[150] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-yellow-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Включить уведомления?</h3>
            <p className="text-sm text-gray-600 mt-1">
              Получайте мгновенные уведомления о завершении заявок, срочных объявлениях и собраниях жильцов.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAllow}
                disabled={isSubscribing}
                className="px-4 py-2 bg-primary-400 hover:bg-primary-500 text-black font-medium rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Включение...
                  </>
                ) : (
                  'Разрешить'
                )}
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Позже
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
