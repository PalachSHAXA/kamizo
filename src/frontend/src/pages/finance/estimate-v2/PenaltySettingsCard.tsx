// Sprint 7: настройка пеней за просрочку для тенанта.
// Встроенный блок в /finance/settings — только для admin/director.

import { useEffect, useState } from 'react';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { penaltyApi, type PenaltySettings } from '../../../services/api/finance-v2';
import { useLanguageStore } from '../../../stores/languageStore';
import { useAuthStore } from '../../../stores/authStore';

export function PenaltySettingsCard() {
  const { language } = useLanguageStore();
  const isRu = language === 'ru';
  const user = useAuthStore(s => s.user);
  const canEdit = user && ['admin', 'director'].includes(user.role);

  const [state, setState] = useState<PenaltySettings>({
    enabled: false, daily_rate: 0.001, grace_days: 30, max_multiplier: 1.0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    penaltyApi.getSettings()
      .then(s => { if (!cancelled) setState(s); })
      .catch(() => { /* дефолты */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await penaltyApi.updateSettings(state);
      setState({
        enabled: res.enabled,
        daily_rate: res.daily_rate,
        grace_days: res.grace_days,
        max_multiplier: res.max_multiplier,
      });
      setMsg({ kind: 'ok', text: isRu ? 'Сохранено' : 'Saqlandi' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || (isRu ? 'Ошибка' : 'Xato') });
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin" />
        {isRu ? 'Загрузка настроек пеней…' : 'Peni sozlamalari yuklanmoqda…'}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {isRu ? 'Пени за просрочку' : 'Kechikish uchun peni'}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {isRu
              ? 'ПКМ №930. По решению собрания жильцов. Начисляются daily-cron\'ом на квартиры с просрочкой > grace_days.'
              : 'VMQ-930. Yig\'ilish qaroriga muvofiq. Daily-cron tomonidan grace_days\'dan keyingi qarzdorlarga hisoblanadi.'}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.enabled}
            disabled={!canEdit}
            onChange={e => setState(s => ({ ...s, enabled: e.target.checked }))}
            className="w-4 h-4 accent-orange-500"
          />
          <span className={state.enabled ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
            {state.enabled
              ? (isRu ? 'Включены' : 'Yoqilgan')
              : (isRu ? 'Отключены' : 'O\'chirilgan')}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">
            {isRu ? 'Ставка в день (%)' : 'Kunlik stavka (%)'}
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            max={10}
            value={(state.daily_rate * 100).toFixed(2)}
            disabled={!canEdit || !state.enabled}
            onChange={e => setState(s => ({ ...s, daily_rate: (Number(e.target.value) || 0) / 100 }))}
            className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white disabled:bg-gray-50 disabled:text-gray-400"
          />
          <span className="text-[10px] text-gray-400 mt-1 block">
            {isRu ? 'Типично 0.1% в день' : 'Odatda 0.1%'}
          </span>
        </label>

        <label className="text-sm">
          <span className="block text-gray-600 mb-1">
            {isRu ? 'Grace-период (дни)' : 'Grace davri (kun)'}
          </span>
          <input
            type="number"
            min={0}
            max={365}
            value={state.grace_days}
            disabled={!canEdit || !state.enabled}
            onChange={e => setState(s => ({ ...s, grace_days: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
            className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white disabled:bg-gray-50 disabled:text-gray-400"
          />
          <span className="text-[10px] text-gray-400 mt-1 block">
            {isRu ? 'По ПКМ №930 — 30' : 'VMQ-930 — 30'}
          </span>
        </label>

        <label className="text-sm">
          <span className="block text-gray-600 mb-1">
            {isRu ? 'Потолок (× долга)' : 'Cheklov (× qarz)'}
          </span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={10}
            value={state.max_multiplier}
            disabled={!canEdit || !state.enabled}
            onChange={e => setState(s => ({ ...s, max_multiplier: Math.max(0, Number(e.target.value) || 0) }))}
            className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white disabled:bg-gray-50 disabled:text-gray-400"
          />
          <span className="text-[10px] text-gray-400 mt-1 block">
            {isRu ? 'ГК РУз — не > 100% долга (1.0)' : 'FK — qarzdan oshmasin (1.0)'}
          </span>
        </label>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="text-xs">
            {msg && (
              <span className={msg.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}>
                {msg.text}
              </span>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isRu ? 'Сохранить' : 'Saqlash'}
          </button>
        </div>
      )}

      {!canEdit && (
        <div className="text-xs text-gray-400 flex items-center gap-1 pt-2 border-t border-gray-100">
          <AlertCircle size={12} />
          {isRu ? 'Изменение — только admin/director' : 'O\'zgartirish faqat admin/director'}
        </div>
      )}
    </div>
  );
}
