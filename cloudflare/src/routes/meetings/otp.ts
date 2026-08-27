// OTP request and verify routes

import {
  route, getUser, getTenantId, requireFeature,
  json, error, generateId, generateOTPCode, createRequestLogger
} from './helpers';
import { sendTelegramToUser } from '../../utils/telegram';

export function registerOTPRoutes() {

// OTP: Request
//
// Sprint 79 P0/F3: ignore body.phone — always use authUser.phone. Was
// letting any authed caller issue an OTP to an arbitrary phone tied to
// their own user_id.
route('POST', '/api/meetings/otp/request', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!authUser.phone) return error('User has no phone on file', 400);

  const body = await request.json() as any;

  // meeting_id обязателен.
  //
  // Так объявлена колонка в проде (NOT NULL), и это правильно по сути:
  // код подтверждения, не привязанный ни к какому собранию, — слабое
  // доказательство для протокола. Прежний код передавал сюда null и
  // падал бы на вставке.
  //
  // Проверка принадлежности тенанту — не формальность: раньше в
  // meeting_id принималась ЛЮБАЯ строка от клиента и уходила в запись,
  // которая потом фигурирует как доказательство. Теперь чужое или
  // выдуманное собрание отсекается.
  const meetingId = body.meeting_id || body.meetingId;
  if (!meetingId) return error('meeting_id is required', 400);

  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(
    `SELECT id FROM meetings WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(meetingId, ...(tenantId ? [tenantId] : [])).first();
  if (!meeting) return error('Meeting not found', 404);

  const code = generateOTPCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  const id = generateId();
  // Колонка с кодом в проде называется otp_code, а не code — см.
  // миграцию 075. Переименовывать её ради совпадения с прежним текстом
  // запроса значило бы пересобирать таблицу ради косметики.
  await env.DB.prepare(`
    INSERT INTO meeting_otp_records
      (id, user_id, phone, otp_code, purpose, meeting_id, agenda_item_id, expires_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, authUser.id, authUser.phone, code,
    body.purpose || 'agenda_vote', meetingId,
    body.agenda_item_id || body.agendaItemId || null,
    expiresAt.toISOString(), tenantId
  ).run();

  // Доставка кода.
  //
  // До этого места код никуда не отправлялся: строка в БД создавалась,
  // а наружу уходил только otpId — SMS-шлюз в проекте так и не появился.
  // Telegram Bot API бесплатен, поэтому канал включается первым.
  //
  // Отправка ждётся (await), в отличие от уведомлений: пользователь
  // прямо сейчас смотрит на форму ввода кода, и ему нужно знать, дошёл
  // код или нет. Ошибка при этом НЕ роняет запрос — запись OTP уже
  // создана и остаётся валидной, канал доставки можно добавить позже.
  //
  // channel в ответе говорит фронту, что показывать: 'telegram' — «код
  // отправлен в Telegram», 'none' — у пользователя канал не привязан,
  // и получить код ему сейчас неоткуда. Молча возвращать успех в
  // последнем случае нельзя: человек будет ждать SMS, которой не будет.
  let channel: 'telegram' | 'none' = 'none';
  const delivery = await sendTelegramToUser(
    env,
    authUser.id,
    `\u{1F510} Код подтверждения Kamizo: <b>${code}</b>\n\nДействует 5 минут. Никому его не сообщайте.`,
    // Код запрошен явным действием пользователя, а не рассылкой.
    // Тумблер «уведомления» его не блокирует: иначе человек с
    // выключенными уведомлениями не смог бы проголосовать.
    { requireNotifications: false }
  );
  if (delivery.ok) channel = 'telegram';
  else if (delivery.reason !== 'telegram not linked') {
    createRequestLogger(request).warn('otp_telegram_delivery_failed', { reason: delivery.reason });
  }

  // Канал фиксируется в самой записи, а не только в ответе. Протоколу
  // собрания важно, ЧЕМ подтверждён голос: SMS на номер и сообщение в
  // мессенджере — юридически разные вещи, и восстановить это задним
  // числом по логам невозможно.
  await env.DB.prepare(
    'UPDATE meeting_otp_records SET delivery_channel = ? WHERE id = ?'
  ).bind(channel, id).run();

  return json({ otpId: id, expiresAt: expiresAt.toISOString(), channel });
});

// OTP: Verify
//
// Sprint 79 P0/F3: was unauthenticated — anyone with an otp_id (UUID
// guessable via timing/leakage) could brute-force the 6-digit code.
// Now: require auth + tenant filter + user_id binding. The OTP must
// belong to the caller.
route('POST', '/api/meetings/otp/verify', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const otpId = body.otp_id || body.otpId;
  const code = body.code;
  if (!otpId || !code) return error('otp_id and code are required', 400);

  const tenantId = getTenantId(request);
  const otp = await env.DB.prepare(
    `SELECT * FROM meeting_otp_records WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(otpId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!otp) return json({ verified: false, error: 'OTP not found' });
  if (otp.is_used) return json({ verified: false, error: 'OTP already used' });
  if (new Date(otp.expires_at) < new Date()) return json({ verified: false, error: 'OTP expired' });
  // До миграции 075 колонок attempts/max_attempts в проде не было, и
  // это сравнение шло с undefined — то есть ограничение перебора
  // шестизначного кода не работало НИКОГДА, хотя выглядело написанным.
  // Значения по умолчанию (0 и 5) заданы в миграции; COALESCE здесь на
  // случай строк, созданных до неё.
  const attempts = otp.attempts ?? 0;
  const maxAttempts = otp.max_attempts ?? 5;
  if (attempts >= maxAttempts) return json({ verified: false, error: 'Max attempts exceeded' });

  // Колонка называется otp_code (прод-схема), а не code. Прежнее
  // otp.code давало undefined, и сравнение с введённым кодом всегда
  // было ложным — verify не подтвердил бы ни один правильный код.
  if (otp.otp_code === code) {
    await env.DB.prepare(`UPDATE meeting_otp_records SET is_used = 1, verified_at = datetime('now') WHERE id = ?`).bind(otpId).run();
    return json({ verified: true });
  } else {
    await env.DB.prepare(`UPDATE meeting_otp_records SET attempts = attempts + 1 WHERE id = ?`).bind(otpId).run();
    return json({ verified: false, error: 'Invalid code' });
  }
});

} // end registerOTPRoutes
