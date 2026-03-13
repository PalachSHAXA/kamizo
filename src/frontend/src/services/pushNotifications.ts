// Browser Push Notifications Service with Web Push API
import { apiRequest } from './api';

export type PushNotificationType =
  | 'request_completed'      // Заявка завершена - нужно подтвердить
  | 'announcement_urgent'    // Срочное объявление от УК
  | 'announcement_meeting'   // Собрание жильцов
  | 'request_assigned'       // Заявка назначена исполнителю
  | 'request_started'        // Работа началась
  | 'chat_message'           // Новое сообщение в чате
  | 'meeting'                // Собрание/голосование
  | 'announcement';          // Объявление

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean; // Не исчезает автоматически
  data?: {
    url?: string;
    requestId?: string;
    announcementId?: string;
    channelId?: string;
    meetingId?: string;
    type?: PushNotificationType;
    priority?: 'low' | 'normal' | 'urgent';
  };
}

// VAPID public key for Web Push (must match server's public key)
const VAPID_PUBLIC_KEY = 'BMTJw9s4vAY9Bzb05L8--r0XUDirigcJ0_yTTGuCLZL2uk8693U82ef7LLlWyLf9T-3PucveTAjYS_I36uv7RY4';

// Convert VAPID key to Uint8Array (for applicationServerKey)
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

class PushNotificationService {
  private permission: NotificationPermission = 'default';
  private swRegistration: ServiceWorkerRegistration | null = null;
  private pushSubscription: PushSubscription | null = null;

  constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
    this.initServiceWorker();
  }

  // Initialize service worker connection
  private async initServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.ready;

        // Check existing subscription
        this.pushSubscription = await this.swRegistration.pushManager.getSubscription();
      } catch (error) {
        console.error('[Push] Service Worker init failed:', error);
      }
    }
  }

  // Проверить поддержку браузера
  isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  // Проверить поддержку только браузерных уведомлений
  isBrowserNotificationsSupported(): boolean {
    return 'Notification' in window;
  }

  // Получить текущее разрешение
  getPermission(): NotificationPermission {
    return this.permission;
  }

  // Проверить, подписан ли пользователь на push
  isSubscribed(): boolean {
    return this.pushSubscription !== null;
  }

  // Запросить разрешение на уведомления
  async requestPermission(): Promise<boolean> {
    if (!this.isBrowserNotificationsSupported()) {
      console.warn('Push notifications are not supported in this browser');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  // Подписаться на Web Push уведомления
  async subscribe(): Promise<PushSubscription | null> {

    if (!this.isSupported()) {
      console.warn('[Push] Web Push not supported in this browser');
      return null;
    }

    // Request permission first
    if (this.permission !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('[Push] Permission not granted');
        return null;
      }
    }

    // Wait for service worker
    if (!this.swRegistration) {
      await this.initServiceWorker();
    }

    if (!this.swRegistration) {
      console.error('[Push] Service Worker not available after init');
      return null;
    }

    try {
      // Check for existing subscription
      const existingSub = await this.swRegistration.pushManager.getSubscription();
      if (existingSub) {
        this.pushSubscription = existingSub;
      } else {
        // Subscribe to push
        this.pushSubscription = await this.swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }


      // Send subscription to server
      await this.sendSubscriptionToServer(this.pushSubscription);

      return this.pushSubscription;
    } catch (error) {
      console.error('[Push] Subscribe failed:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('[Push] Error name:', error.name);
        console.error('[Push] Error message:', error.message);
      }
      return null;
    }
  }

  // Отписаться от Web Push
  async unsubscribe(): Promise<boolean> {
    if (!this.pushSubscription) {
      return true;
    }

    try {
      await this.pushSubscription.unsubscribe();

      // Remove from server
      await this.removeSubscriptionFromServer();

      this.pushSubscription = null;
      return true;
    } catch (error) {
      console.error('[Push] Unsubscribe failed:', error);
      return false;
    }
  }

  // Отправить подписку на сервер
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    try {
      const subscriptionData = subscription.toJSON();

      await apiRequest('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subscriptionData.endpoint,
          keys: subscriptionData.keys
        })
      });
    } catch (error) {
      console.error('[Push] Failed to send subscription to server:', error);
      // Re-throw to let caller know about failure
      throw error;
    }
  }

  // Удалить подписку с сервера
  private async removeSubscriptionFromServer(): Promise<void> {
    try {
      await apiRequest('/api/push/unsubscribe', {
        method: 'POST'
      });
    } catch (error) {
      console.error('[Push] Failed to remove subscription from server:', error);
    }
  }

  // Получить текущую подписку
  getSubscription(): PushSubscription | null {
    return this.pushSubscription;
  }

  // Показать push-уведомление
  async show(options: PushNotificationOptions): Promise<Notification | null> {
    if (!this.isSupported()) {
      console.warn('Push notifications are not supported');
      return null;
    }

    // Если разрешение не получено, запросить
    if (this.permission !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('Notification permission not granted');
        return null;
      }
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/icons/favicon.ico',
        tag: options.tag,
        requireInteraction: options.requireInteraction ?? true, // По умолчанию не исчезает
        data: options.data,
      });

      // Обработка клика по уведомлению
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();

        // Если есть URL в data, перейти на него
        if (options.data?.url) {
          window.location.href = options.data.url;
        }

        notification.close();
      };

      return notification;
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }

  // Уведомление о завершении заявки (для жителя)
  async notifyRequestCompleted(requestNumber: string | number, executorName: string, requestId: string): Promise<void> {
    await this.show({
      title: '✅ Работа завершена!',
      body: `Заявка ${requestNumber}: ${executorName} завершил работу. Пожалуйста, подтвердите выполнение и оцените работу.`,
      tag: `request-completed-${requestId}`,
      requireInteraction: true, // Важно - не исчезает пока не кликнут
      data: {
        requestId,
        url: '/', // Перейдет на главную (dashboard)
      },
    });
  }

  // Срочное объявление от УК
  async notifyUrgentAnnouncement(title: string, message: string, announcementId: string): Promise<void> {
    await this.show({
      title: `🚨 ${title}`,
      body: message,
      tag: `announcement-${announcementId}`,
      requireInteraction: true,
      data: {
        announcementId,
        url: '/',
      },
    });
  }

  // Собрание жильцов
  async notifyMeeting(title: string, date: string, time: string, announcementId: string): Promise<void> {
    await this.show({
      title: `📢 Собрание жильцов`,
      body: `${title}\n${date} в ${time}`,
      tag: `meeting-${announcementId}`,
      requireInteraction: true,
      data: {
        announcementId,
        url: '/meetings',
      },
    });
  }

  // Новое собрание объявлено
  async notifyNewMeeting(meetingId: string, buildingAddress: string): Promise<void> {
    await this.show({
      title: '📢 Новое собрание объявлено',
      body: `Назначено собрание жильцов дома ${buildingAddress}. Примите участие в выборе даты!`,
      tag: `new-meeting-${meetingId}`,
      requireInteraction: true,
      data: {
        url: '/meetings',
      },
    });
  }

  // Голосование открыто
  async notifyVotingOpen(meetingId: string, buildingAddress: string): Promise<void> {
    await this.show({
      title: '🗳️ Голосование открыто!',
      body: `Голосование на собрании жильцов дома ${buildingAddress} началось. Примите участие!`,
      tag: `voting-open-${meetingId}`,
      requireInteraction: true,
      data: {
        url: '/meetings',
      },
    });
  }

  // Напоминание о голосовании
  async notifyVotingReminder(meetingId: string, hoursLeft: number): Promise<void> {
    await this.show({
      title: '⏰ Голосование скоро завершится',
      body: `Осталось ${hoursLeft} часов до окончания голосования. Не забудьте проголосовать!`,
      tag: `voting-reminder-${meetingId}`,
      requireInteraction: true,
      data: {
        url: '/meetings',
      },
    });
  }

  // Протокол готов
  async notifyProtocolReady(meetingId: string, buildingAddress: string): Promise<void> {
    await this.show({
      title: '📄 Протокол собрания готов',
      body: `Протокол собрания жильцов дома ${buildingAddress} опубликован.`,
      tag: `protocol-ready-${meetingId}`,
      requireInteraction: false,
      data: {
        url: '/meetings',
      },
    });
  }

  // Новое объявление
  async notifyAnnouncement(title: string, content: string, announcementId: string, priority: 'low' | 'normal' | 'urgent' = 'normal'): Promise<void> {
    const icon = priority === 'urgent' ? '🚨' : '📢';
    await this.show({
      title: `${icon} ${title}`,
      body: content.length > 200 ? content.substring(0, 200) + '...' : content,
      tag: `announcement-${announcementId}`,
      requireInteraction: priority === 'urgent',
      data: {
        announcementId,
        priority,
        url: '/announcements',
        type: 'announcement'
      },
    });
  }

  // Уведомление о назначении заявки (для исполнителя)
  async notifyRequestAssigned(requestNumber: string | number, title: string, requestId: string): Promise<void> {
    await this.show({
      title: '📋 Новая заявка назначена',
      body: `Заявка ${requestNumber}: ${title}`,
      tag: `request-assigned-${requestId}`,
      requireInteraction: true,
      data: {
        requestId,
        url: '/',
      },
    });
  }

  // Уведомление о начале работы (для жителя)
  async notifyRequestStarted(requestNumber: string | number, executorName: string, requestId: string): Promise<void> {
    await this.show({
      title: '🔧 Работа началась',
      body: `Заявка ${requestNumber}: ${executorName} начал работу`,
      tag: `request-started-${requestId}`,
      requireInteraction: false, // Это менее срочно
      data: {
        requestId,
        url: '/',
      },
    });
  }
}

// Singleton instance
export const pushNotifications = new PushNotificationService();
