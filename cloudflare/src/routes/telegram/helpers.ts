// Общие импорты и утилиты Telegram-роутов.
// Тот же паттерн, что в routes/meetings/helpers.ts — один barrel на
// подпапку, чтобы сабмодули не тянули по десять относительных путей.

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';
import { sendTelegramMessage, escapeHtml } from '../../utils/telegram';

export {
  route, getUser, getTenantId, requireFeature,
  json, error, generateId, isManagement, createRequestLogger,
  sendTelegramMessage, escapeHtml
};
export type { Env };

// Срок жизни deep-link токена привязки.
//
// Ссылка вида https://t.me/<bot>?start=<token> оседает в истории
// браузера, в скриншотах и в пересланных сообщениях, а её предъявитель
// получает право привязать СВОЙ Telegram к чужому аккаунту Kamizo —
// то есть увести себе все уведомления жителя и его OTP для голосования.
// Десять минут — компромисс между этим риском и живым сценарием
// «открыл настройки, отвлёкся, вернулся».
export const LINK_TOKEN_TTL_MINUTES = 10;

// Криптостойкий токен привязки.
//
// Math.random() здесь недопустим: generateOTPCode() в meetings/helpers
// его использует, но там значение живёт 5 минут и защищено счётчиком
// попыток, а тут предъявление токена сразу даёт привязку без всякой
// второй проверки. 32 байта → 64 hex-символа, перебор нереален.
export function generateLinkToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Сравнение секретов за постоянное время.
//
// Наивное a === b выходит на первом различающемся символе, и разница во
// времени ответа утекает наружу — по ней секрет вебхука восстанавливается
// побайтово. Длину сравниваем отдельно и сразу: она и так видна в
// размере запроса, скрывать нечего.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
