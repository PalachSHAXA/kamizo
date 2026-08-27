// Личная привязка Telegram к аккаунту Kamizo (§16 ТЗ).
//
// Здесь только состояние и действия — без вёрстки. Причина: привязка
// нужна минимум в трёх местах (профиль жителя, профиль сотрудника,
// настройки админа), а у каждой из этих страниц свой набор
// компонентов и своя визуальная система. Отрисовать один общий блок
// так, чтобы он не выглядел чужеродным во всех трёх, нельзя — а вот
// логику дублировать незачем.
//
// Как устроен флоу и почему именно так:
//   1. Бот НЕ МОЖЕТ написать пользователю первым — Telegram этого не
//      позволяет, пока человек сам не нажал /start у бота.
//   2. Поэтому сервер выдаёт одноразовый токен, а мы открываем
//      https://t.me/<bot>?start=<token>.
//   3. Пользователь жмёт «Запустить», бот получает апдейт и связывает
//      chat_id с его аккаунтом.
//   4. Браузер об этом ничего не узнает — привязка происходит целиком
//      на стороне Telegram и сервера. Поэтому после открытия ссылки мы
//      опрашиваем /status, иначе интерфейс так и будет показывать
//      «не привязан», пока страницу не перезагрузят руками.

import { useState, useEffect, useCallback, useRef } from 'react';
import { telegramApi } from '../services/api';

// Опрос после открытия ссылки. Пользователь успевает переключиться в
// Telegram, нажать кнопку и вернуться — это единицы секунд, но бывает
// и дольше, если бота ещё нет в списке чатов. 20 попыток по 3 секунды
// дают минуту, дальше прекращаем: бесконечный поллинг фонового таба
// греет батарею и шлёт запросы, которых никто не ждёт.
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 20;

export interface TelegramLinkState {
  loading: boolean;
  linked: boolean;
  username: string | null;
  // §16 шаг 8 — два раздельных согласия. notifications: рассылки;
  // security: подтверждение входа (§17). Второе по умолчанию выключено:
  // сделать Telegram вторым фактором — осознанное действие, а не
  // побочный эффект привязки.
  notificationsEnabled: boolean;
  securityEnabled: boolean;
  // true, пока идёт опрос после открытия ссылки — интерфейс должен
  // показывать «ожидание», а не «не привязан».
  awaiting: boolean;
  error: string | null;
  // Ссылка t.me, если её уже запросили. Нужна, чтобы показать её
  // текстом там, где всплывающее окно заблокировано браузером.
  link: string | null;
}

export function useTelegramLink() {
  const [state, setState] = useState<TelegramLinkState>({
    loading: true, linked: false, username: null,
    notificationsEnabled: true, securityEnabled: false,
    awaiting: false, error: null, link: null,
  });

  // Таймер опроса живёт вне рендера: его надо гасить при размонтировании,
  // иначе setState прилетит в снятый компонент.
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await telegramApi.status();
      if (!mountedRef.current) return res.linked;
      setState(s => ({
        ...s, loading: false, linked: res.linked, username: res.username,
        notificationsEnabled: res.notificationsEnabled,
        securityEnabled: res.securityEnabled,
        error: null,
      }));
      return res.linked;
    } catch (e: unknown) {
      if (!mountedRef.current) return false;
      setState(s => ({
        ...s, loading: false,
        error: e instanceof Error ? e.message : 'Error',
      }));
      return false;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const poll = useCallback((attempt: number) => {
    if (!mountedRef.current) return;
    if (attempt >= POLL_ATTEMPTS) {
      setState(s => ({ ...s, awaiting: false }));
      return;
    }
    pollRef.current = setTimeout(async () => {
      const linked = await refresh();
      if (linked) {
        setState(s => ({ ...s, awaiting: false, link: null }));
      } else {
        poll(attempt + 1);
      }
    }, POLL_INTERVAL_MS);
  }, [refresh]);

  const link = useCallback(async () => {
    setState(s => ({ ...s, error: null }));
    try {
      const res = await telegramApi.createLinkToken();
      if (!mountedRef.current) return;
      setState(s => ({ ...s, link: res.url, awaiting: true }));
      // Открываем в новой вкладке. Если браузер заблокирует всплывающее
      // окно, ссылка всё равно лежит в state.link и её показывают
      // текстом — молча ничего не произойти не должно.
      window.open(res.url, '_blank', 'noopener,noreferrer');
      poll(0);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setState(s => ({
        ...s, awaiting: false,
        error: e instanceof Error ? e.message : 'Error',
      }));
    }
  }, [poll]);

  const unlink = useCallback(async () => {
    setState(s => ({ ...s, error: null }));
    try {
      await telegramApi.unlink();
      if (!mountedRef.current) return;
      if (pollRef.current) clearTimeout(pollRef.current);
      setState(s => ({ ...s, linked: false, username: null, awaiting: false, link: null }));
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Error' }));
    }
  }, []);

  // Переключение согласий (§16 шаг 8).
  //
  // Оптимистично перерисовываем и откатываем при ошибке: переключатель,
  // который «думает» полсекунды, читается как сломанный.
  const setPreference = useCallback(async (
    key: 'notifications' | 'security',
    value: boolean
  ) => {
    const field = key === 'notifications' ? 'notificationsEnabled' : 'securityEnabled';
    setState(s => ({ ...s, [field]: value }));
    try {
      await telegramApi.setPreferences(
        key === 'notifications'
          ? { notifications_enabled: value }
          : { security_enabled: value }
      );
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setState(s => ({
        ...s, [field]: !value,
        error: e instanceof Error ? e.message : 'Error',
      }));
    }
  }, []);

  return { ...state, link, unlink, refresh, setPreference };
}
