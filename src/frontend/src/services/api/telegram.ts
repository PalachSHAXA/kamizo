// Telegram API — домовые группы (Этап 1 ТЗ) и личная привязка (Этап 3).
//
// Соответствует routes/telegram/{groups,link}.ts на бэкенде. Сам бот с
// фронтом не общается: всё, что делает UI, — просит у сервера ссылку и
// показывает состояние того, что уже подключено.

import { apiRequest, invalidateCache } from './client';

export interface TelegramGroup {
  id: string;
  building_id: string;
  // Текстовая метка подъезда (не entrances.id). null = вся группа
  // обслуживает дом целиком.
  entrance: string | null;
  telegram_chat_id: string;
  telegram_chat_title: string | null;
  listener_enabled: number;
  announcements_enabled: number;
  // 'member' | 'administrator' | 'left' | 'kicked' | 'restricted'.
  // Приходит из апдейта my_chat_member: так видно, что бота выгнали.
  bot_status: string;
  connected_at: string;
  disabled_at: string | null;
  building_name: string | null;
  building_address: string | null;
}

export interface TelegramDelivery {
  id: string;
  telegram_group_id: string | null;
  telegram_chat_id: string;
  status: 'pending' | 'sent' | 'failed' | 'disabled' | 'blocked';
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  telegram_chat_title: string | null;
  building_id: string | null;
}

export const telegramApi = {
  // ── Домовые группы (кабинет УК) ─────────────────────────────────
  listGroups: () =>
    apiRequest<{ groups: TelegramGroup[] }>('/api/telegram/groups'),

  // Возвращает ссылку https://t.me/<bot>?startgroup=<token>.
  // Ссылка одноразовая и живёт 30 минут; каждый новый вызов гасит
  // предыдущие невыданные токены этого администратора.
  createConnectLink: (payload: {
    building_id: string;
    entrance?: string | null;
    announcements_enabled?: boolean;
    listener_enabled?: boolean;
  }) =>
    apiRequest<{ url: string; expiresAt: string }>(
      '/api/telegram/groups/connect-token',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  updateGroup: async (id: string, updates: {
    announcements_enabled?: boolean;
    listener_enabled?: boolean;
    entrance?: string | null;
  }) => {
    const res = await apiRequest<{ ok: true }>(`/api/telegram/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    invalidateCache('/api/telegram/groups');
    return res;
  },

  // Мягкое отключение: строка остаётся ради журнала доставок, чат
  // освобождается и может быть подключён заново.
  disableGroup: async (id: string) => {
    const res = await apiRequest<{ ok: true }>(`/api/telegram/groups/${id}`, {
      method: 'DELETE',
    });
    invalidateCache('/api/telegram/groups');
    return res;
  },

  // «Доставлено в 8 из 9 групп» для карточки объявления.
  announcementDeliveries: (announcementId: string) =>
    apiRequest<{
      deliveries: TelegramDelivery[];
      summary: { total: number; sent: number; failed: number; blocked: number };
    }>(`/api/telegram/announcements/${announcementId}/deliveries`),

  // ── Черновик заявки из домовой группы (Этап 2, §12–§13) ─────────
  //
  // Токен непрозрачный: все данные лежат на сервере, а он отдаёт их
  // только после проверки JWT, срока, совпадения тенанта и доступа к
  // дому. Ошибка здесь — нормальный исход (просрочен, чужой тенант,
  // открыт другим человеком), и вызывающий код её просто глотает.
  requestDraft: (token: string) =>
    apiRequest<{
      category: string | null;
      description: string | null;
      buildingId: string;
      buildingAddress: string | null;
      entrance: string | null;
    }>(`/api/telegram/draft/${encodeURIComponent(token)}`),

  // ── Личная привязка (Этап 3) ────────────────────────────────────
  status: () =>
    apiRequest<{
      linked: boolean;
      username: string | null;
      linkedAt: string | null;
      // §16 шаг 8: два раздельных согласия. notificationsEnabled — на
      // рассылки; securityEnabled — на подтверждение входа (§17).
      // Согласие на первое не означает согласия на второе.
      notificationsEnabled: boolean;
      securityEnabled: boolean;
      botUsername: string | null;
    }>('/api/telegram/status'),

  setPreferences: (prefs: {
    notifications_enabled?: boolean;
    security_enabled?: boolean;
  }) =>
    apiRequest<{ ok: true }>('/api/telegram/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),

  createLinkToken: () =>
    apiRequest<{ url: string; expiresAt: string }>('/api/telegram/link-token', {
      method: 'POST',
    }),

  unlink: () =>
    apiRequest<{ ok: true }>('/api/telegram/link', { method: 'DELETE' }),
};
