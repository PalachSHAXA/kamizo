import { useState, useEffect } from 'react';
import { Bell, X, Loader2 } from 'lucide-react';
import { pushNotifications } from '../services/pushNotifications';
import { useAuthStore } from '../stores/authStore';

export function PushNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    // Проверяем, поддерживаются ли уведомления
    if (!pushNotifications.isBrowserNotificationsSupported()) {
      return;
    }

    const permission = pushNotifications.getPermission();
    const dismissedKey = `push_prompt_dismissed_${user?.id || 'anon'}`;
    const wasDismissed = localStorage.getItem(dismissedKey);
    const lastDismissedTime = wasDismissed ? parseInt(wasDismissed) : 0;
    const daysSinceDismissed = (Date.now() - lastDismissedTime) / (1000 * 60 * 60 * 24);

    // Показываем промпт если:
    // 1. permission === 'default' и не отклоняли ранее
    // 2. Или прошло больше 7 дней с момента отклонения
    const shouldShow = permission === 'default' && (!wasDismissed || daysSinceDismissed > 7);

    if (shouldShow) {
      // Небольшая задержка для лучшего UX
      const timer = setTimeout(() => setShow(true), 2000);
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
          await swRegistration.showNotification('🔔 Уведомления включены!', {
            body: subscription
              ? 'Теперь вы будете получать уведомления от УК Kamizo даже когда приложение закрыто.'
              : 'Теперь вы будете получать важные уведомления о заявках и объявлениях.',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'welcome-notification',
            requireInteraction: false,
          });
        } catch (swError) {
          console.warn('Service Worker notification failed, falling back:', swError);
          // Fallback to browser Notification API
          await pushNotifications.show({
            title: '🔔 Уведомления включены!',
            body: 'Теперь вы будете получать важные уведомления о заявках и объявлениях.',
            requireInteraction: false,
          });
        }
      } else if (!subscription) {
        // No Service Worker, try browser notifications
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
    setDismissed(true);
  };

  if (!show || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
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
