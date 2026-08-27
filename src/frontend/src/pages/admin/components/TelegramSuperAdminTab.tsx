// Суперадмин: раздел Telegram (§18 ТЗ).
//
// Показывает состояние интеграции, счётчики и позволяет включить фичу
// тенанту или погасить проблемную группу.
//
// Чего здесь НЕТ и не будет: чтения сообщений домовых групп. §18 прямо
// говорит, что такой интерфейс суперадминистратору не нужен, а
// техническая возможность, однажды появившись, обязательно будет
// использована.

import { useState, useEffect, useCallback } from 'react';
import { Send, Loader2, AlertTriangle, RefreshCw, Power } from 'lucide-react';
import { apiRequest } from '../../../services/api';

interface Overview {
  botUsername: string | null;
  configured: boolean;
  webhook: {
    url: string | null;
    pendingUpdateCount: number | null;
    lastErrorMessage: string | null;
    lastErrorDate: number | null;
  } | null;
  groups: { total: number; active: number; kicked: number; tenants: number };
  deliveries: { sent: number; failed: number; blocked: number };
  linkedUsers: number;
  tenants: { id: string; name: string; slug: string; telegramEnabled: boolean }[];
}

interface SaGroup {
  id: string;
  tenant_name: string | null;
  telegram_chat_title: string | null;
  telegram_chat_id: string;
  building_address: string | null;
  entrance: string | null;
  bot_status: string;
  announcements_enabled: number;
  listener_enabled: number;
  disabled_at: string | null;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' | 'warn' }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="p-3 md:p-4 bg-white/40 rounded-xl">
      <div className={`text-xl md:text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

export function TelegramSuperAdminTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [groups, setGroups] = useState<SaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, g] = await Promise.all([
        apiRequest<Overview>('/api/super-admin/telegram/overview'),
        apiRequest<{ groups: SaGroup[] }>('/api/super-admin/telegram/groups'),
      ]);
      setOverview(o);
      setGroups(g.groups || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleTenant = async (id: string, enabled: boolean) => {
    setBusy(id);
    try {
      await apiRequest(`/api/super-admin/telegram/tenants/${id}/feature`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const disableGroup = async (id: string) => {
    if (!window.confirm('Отключить группу? Объявления в неё приходить перестанут.')) return;
    setBusy(id);
    try {
      await apiRequest(`/api/super-admin/telegram/groups/${id}/disable`, { method: 'POST' });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Send className="w-5 h-5 text-primary-600 flex-shrink-0" />
            <h2 className="text-base md:text-lg font-semibold truncate">
              Telegram{overview?.botUsername ? ` — @${overview.botUsername}` : ''}
            </h2>
          </div>
          <button onClick={() => void load()} aria-label="Обновить" className="p-2 text-gray-500 hover:text-primary-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {/* Состояние вебхука — то, из-за чего бот молча умирает целиком.
            last_error_message «липкий»: Telegram хранит последнюю ошибку
            и не стирает её после успеха, поэтому показываем как
            предупреждение, а не как аварию. */}
        {!overview?.configured ? (
          <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm mb-4">
            Бот не настроен: в <code>.env</code> нет TELEGRAM_BOT_TOKEN.
          </div>
        ) : !overview.webhook ? (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">
            Telegram не ответил на getWebhookInfo — проверьте доступность API.
          </div>
        ) : (
          <div className="p-3 bg-white/40 rounded-lg text-xs md:text-sm mb-4 space-y-1">
            <div className="break-all">
              <span className="text-gray-500">Webhook: </span>
              {overview.webhook.url || <span className="text-red-600">не установлен</span>}
            </div>
            <div>
              <span className="text-gray-500">В очереди: </span>
              {overview.webhook.pendingUpdateCount ?? '—'}
            </div>
            {overview.webhook.lastErrorMessage && (
              <div className="text-amber-700 break-words">
                Последняя ошибка: {overview.webhook.lastErrorMessage}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <Stat label="Активных групп" value={overview?.groups.active ?? 0} />
          <Stat label="Тенантов с группами" value={overview?.groups.tenants ?? 0} />
          <Stat label="Бот выгнан" value={overview?.groups.kicked ?? 0} tone={overview?.groups.kicked ? 'warn' : undefined} />
          <Stat label="Привязано пользователей" value={overview?.linkedUsers ?? 0} />
          <Stat label="Доставлено" value={overview?.deliveries.sent ?? 0} />
          <Stat label="Ошибок доставки" value={overview?.deliveries.failed ?? 0} tone={overview?.deliveries.failed ? 'bad' : undefined} />
          <Stat label="Заблокировано" value={overview?.deliveries.blocked ?? 0} tone={overview?.deliveries.blocked ? 'warn' : undefined} />
          <Stat label="Всего групп" value={overview?.groups.total ?? 0} />
        </div>
      </div>

      {/* Включение интеграции тенанту (§5). */}
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <h3 className="text-sm md:text-base font-semibold mb-3">Доступ тенантов</h3>
        <div className="space-y-2">
          {(overview?.tenants || []).map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 p-3 bg-white/30 rounded-xl">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{t.name}</div>
                <div className="text-xs text-gray-500 truncate">{t.slug}</div>
              </div>
              <button
                onClick={() => void toggleTenant(t.id, !t.telegramEnabled)}
                disabled={busy === t.id}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium flex-shrink-0 disabled:opacity-50 ${
                  t.telegramEnabled ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-600'
                }`}
              >
                {t.telegramEnabled ? 'Включено' : 'Выключено'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Все группы всех тенантов — единственное место, где кросс-тенантный
          список законен, и потому оно под ролью суперадмина. */}
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <h3 className="text-sm md:text-base font-semibold mb-3">Подключённые группы</h3>
        {groups.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">Групп пока нет.</div>
        ) : (
          <div className="space-y-2">
            {groups.map(g => (
              <div key={g.id} className={`p-3 bg-white/30 rounded-xl ${g.disabled_at ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {g.telegram_chat_title || g.telegram_chat_id}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {g.tenant_name || '—'} · {g.building_address || '—'}
                      {g.entrance ? `, подъезд ${g.entrance}` : ''}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {g.disabled_at
                        ? 'отключена'
                        : `${g.bot_status}${g.announcements_enabled ? ' · объявления' : ''}${g.listener_enabled ? ' · диспетчер' : ''}`}
                    </div>
                  </div>
                  {!g.disabled_at && (
                    <button
                      onClick={() => void disableGroup(g.id)}
                      disabled={busy === g.id}
                      aria-label="Отключить группу"
                      className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50 flex-shrink-0"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
