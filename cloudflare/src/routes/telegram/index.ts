// Telegram-роуты:
//   link.ts           — личная привязка аккаунта жителя (Этап 3 ТЗ)
//   groups.ts         — подключение домовых групп админом УК (Этап 1)
//   login-approval.ts — подтверждение входа через Telegram (Этап 4, §17)
//   webhook.ts        — приёмник апдейтов Bot API
//
// announcements.ts роутов не регистрирует: это сервис фан-аута,
// который зовут из routes/misc/announcements-mutations.ts.

import { registerTelegramLinkRoutes } from './link';
import { registerTelegramGroupRoutes } from './groups';
import { registerLoginApprovalRoutes } from './login-approval';
import { registerTelegramSuperAdminRoutes } from './super-admin';
import { registerDispatcherRoutes } from './dispatcher';
import { registerTelegramWebhookRoutes } from './webhook';

export function registerTelegramRoutes() {
  registerTelegramLinkRoutes();
  registerTelegramGroupRoutes();
  registerLoginApprovalRoutes();
  registerTelegramSuperAdminRoutes();
  registerDispatcherRoutes();
  registerTelegramWebhookRoutes();
}
