// Кабинет УК: домовые Telegram-группы (§6, §19 ТЗ).
//
// Живёт во вкладке «Настройки → Интеграции» вместо прежней заглушки
// «Telegram Bot — Скоро».
//
// Что здесь НЕ делается: чтение переписки групп. Панель показывает
// только то, что УК сама подключила, и результат доставки объявлений.

import { useState, useEffect, useCallback } from 'react';
import { Send, Plus, Trash2, Loader2, Copy, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { Modal } from '../../../components/common';
import { Switch } from '../../../components/ui';
import { telegramApi, buildingsApi, type TelegramGroup } from '../../../services/api';

interface BuildingOption {
  id: string;
  name?: string;
  address?: string;
}

export function TelegramIntegration() {
  const { language } = useLanguageStore();
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [connectOpen, setConnectOpen] = useState(false);
  const [buildingId, setBuildingId] = useState('');
  const [entrance, setEntrance] = useState('');
  const [withListener, setWithListener] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await telegramApi.listGroups();
      setGroups(res.groups || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Дома подгружаем только при открытии модалки: список кэшируется на
  // стороне API-клиента (CACHE_TTL.LONG), но тянуть его при каждом
  // заходе в настройки незачем.
  const openConnect = async () => {
    setConnectOpen(true);
    setLink(null);
    setCopied(false);
    if (buildings.length) return;
    try {
      const res = await buildingsApi.getAll<BuildingOption & Record<string, unknown>>();
      setBuildings((res.buildings || []) as unknown as BuildingOption[]);
    } catch {
      setBuildings([]);
    }
  };

  const createLink = async () => {
    if (!buildingId) return;
    setCreating(true);
    setError(null);
    try {
      const res = await telegramApi.createConnectLink({
        building_id: buildingId,
        entrance: entrance.trim() || null,
        announcements_enabled: true,
        listener_enabled: withListener,
      });
      setLink(res.url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* буфер обмена может быть недоступен в WebView */ }
  };

  const toggle = async (
    g: TelegramGroup,
    field: 'announcements_enabled' | 'listener_enabled',
    value: boolean
  ) => {
    // §15: перед включением анализа сообщений администратор обязан
    // увидеть, что именно бот начнёт получать. Спрашиваем ровно один
    // раз — при включении; выключение подтверждения не требует.
    if (field === 'listener_enabled' && value) {
      const ok = window.confirm(t(
        'Для анализа сообщений бот будет получать новые сообщения группы.\n\nСообщения используются только для определения проблем ЖКХ. История переписки не сохраняется.\n\nВключить?',
        'Xabarlarni tahlil qilish uchun bot guruhning yangi xabarlarini oladi.\n\nXabarlar faqat kommunal muammolarni aniqlash uchun ishlatiladi. Yozishmalar tarixi saqlanmaydi.\n\nYoqilsinmi?'
      ));
      if (!ok) return;
    }
    // Оптимистично перерисовываем: переключатель, который «думает»
    // полсекунды, читается как сломанный.
    setGroups(prev => prev.map(x => x.id === g.id ? { ...x, [field]: value ? 1 : 0 } : x));
    try {
      await telegramApi.updateGroup(g.id, { [field]: value });
    } catch {
      setGroups(prev => prev.map(x => x.id === g.id ? { ...x, [field]: value ? 0 : 1 } : x));
    }
  };

  const disable = async (g: TelegramGroup) => {
    const ok = window.confirm(t(
      `Отключить группу «${g.telegram_chat_title || g.telegram_chat_id}»?\n\nОбъявления в неё приходить перестанут. Бот останется в группе — удалите его вручную, если нужно.`,
      `«${g.telegram_chat_title || g.telegram_chat_id}» guruhi uzilsinmi?\n\nE"lonlar bu yerga kelmaydi. Bot guruhda qoladi — kerak bo"lsa, uni qo"lda o"chiring.`
    ));
    if (!ok) return;
    try {
      await telegramApi.disableGroup(g.id);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const statusBadge = (g: TelegramGroup) => {
    if (g.disabled_at) {
      return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs flex-shrink-0">{t('Отключена', 'Uzilgan')}</span>;
    }
    if (g.bot_status === 'left' || g.bot_status === 'kicked') {
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs flex-shrink-0">{t('Бот удалён', 'Bot o‘chirilgan')}</span>;
    }
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs flex-shrink-0">{t('Активна', 'Faol')}</span>;
  };

  return (
    <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
      <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Send className="w-5 h-5 text-primary-600 flex-shrink-0" />
          <h2 className="text-base md:text-lg font-semibold truncate">Telegram</h2>
        </div>
        <button
          onClick={openConnect}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('Подключить группу', 'Guruh ulash')}</span>
          <span className="sm:hidden">{t('Добавить', 'Qo‘shish')}</span>
        </button>
      </div>

      <p className="text-xs md:text-sm text-gray-500 mb-3">
        {t(
          'Объявления Kamizo дублируются в домовые Telegram-группы. Каждая группа привязана к дому — объявление уходит только в подходящие.',
          'Kamizo e‘lonlari uy Telegram guruhlariga nusxalanadi. Har bir guruh uyga bog‘langan — e‘lon faqat mos guruhlarga yuboriladi.'
        )}
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-500">
          {t('Ни одна группа пока не подключена.', 'Hali birorta guruh ulanmagan.')}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className={`p-3 md:p-4 bg-white/30 rounded-xl ${g.disabled_at ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm md:text-base truncate">
                    {g.telegram_chat_title || g.telegram_chat_id}
                  </div>
                  <div className="text-xs md:text-sm text-gray-500 mt-0.5 truncate">
                    {g.building_address || g.building_name || g.building_id}
                    {g.entrance ? `, ${t('подъезд', 'kirish')} ${g.entrance}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {statusBadge(g)}
                  {!g.disabled_at && (
                    <button
                      onClick={() => disable(g)}
                      aria-label={t('Отключить группу', 'Guruhni uzish')}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {!g.disabled_at && (
                <div className="space-y-2 pt-2 border-t border-white/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs md:text-sm">{t('Объявления', 'E‘lonlar')}</span>
                    <Switch
                      checked={g.announcements_enabled === 1}
                      onChange={(v: boolean) => toggle(g, 'announcements_enabled', v)}
                      ariaLabel={t('Объявления', 'E‘lonlar')}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs md:text-sm">
                      {t('Умный диспетчер', 'Aqlli dispetcher')}
                      <span className="ml-1 text-[10px] text-gray-400">{t('(скоро)', '(tez kunda)')}</span>
                    </span>
                    <Switch
                      checked={g.listener_enabled === 1}
                      onChange={(v: boolean) => toggle(g, 'listener_enabled', v)}
                      ariaLabel={t('Умный диспетчер', 'Aqlli dispetcher')}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={t('Подключить Telegram-группу', 'Telegram guruhini ulash')}
      >
        {!link ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('Дом', 'Uy')}</label>
              <select
                value={buildingId}
                onChange={e => setBuildingId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="">{t('Выберите дом', 'Uyni tanlang')}</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.address || b.name || b.id}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t('Подъезд', 'Kirish')}
                <span className="ml-1 font-normal text-gray-400 text-xs">
                  {t('— пусто, если группа на весь дом', '— bo‘sh bo‘lsa, butun uy uchun')}
                </span>
              </label>
              <input
                value={entrance}
                onChange={e => setEntrance(e.target.value)}
                placeholder={t('например 2', 'masalan 2')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{t('Включить умный диспетчер', 'Aqlli dispetcherni yoqish')}</span>
              <Switch
                checked={withListener}
                onChange={setWithListener}
                ariaLabel={t('Умный диспетчер', 'Aqlli dispetcher')}
              />
            </div>

            <button
              onClick={createLink}
              disabled={!buildingId || creating}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('Получить ссылку', 'Havola olish')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="text-sm space-y-1.5 list-decimal list-inside text-gray-700">
              <li>{t('Откройте ссылку ниже', 'Quyidagi havolani oching')}</li>
              <li>{t('Выберите группу дома', 'Uy guruhini tanlang')}</li>
              <li>{t('Бот подтвердит подключение сообщением в группе', 'Bot guruhda ulanishni tasdiqlaydi')}</li>
            </ol>

            <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
              <span className="flex-1 min-w-0 text-xs font-mono truncate">{link}</span>
              <button onClick={copyLink} aria-label={t('Скопировать', 'Nusxalash')} className="p-1.5 text-gray-500 hover:text-primary-600">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              {t('Открыть в Telegram', 'Telegramda ochish')}
            </a>

            <p className="text-xs text-gray-500">
              {t(
                'Ссылка действует 30 минут и срабатывает один раз. После подключения обновите страницу.',
                'Havola 30 daqiqa amal qiladi va bir marta ishlaydi. Ulangach sahifani yangilang.'
              )}
            </p>

            <button
              onClick={() => { setConnectOpen(false); void load(); }}
              className="w-full py-2 border border-gray-200 rounded-lg text-sm"
            >
              {t('Готово', 'Tayyor')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
