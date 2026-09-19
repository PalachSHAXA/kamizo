import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ShieldCheck, Clock, Home, User as UserIcon, AlertCircle } from 'lucide-react';
import { useGuestAccessStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';

// Read-only список пропусков для охранника (на КПП): все активные + сегодняшние
// коды тенанта. Управленческие операции (create/edit/revoke) — на
// ManagerGuestAccessPage у админов. Backend GET /api/guest-codes пропускает
// executor/security как management и отдаёт все коды тенанта (см.
// cloudflare/src/routes/rentals/guests.ts:20).

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateShort(iso: string, language: 'ru' | 'uz'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = pad(d.getDate());
  const monthsRu = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const monthsUz = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
  const months = language === 'ru' ? monthsRu : monthsUz;
  return `${day} ${months[d.getMonth()]}`;
}

const VISITOR_LABEL: Record<string, { ru: string; uz: string }> = {
  guest: { ru: 'Гость', uz: 'Mehmon' },
  courier: { ru: 'Курьер', uz: 'Kuryer' },
  taxi: { ru: 'Такси', uz: 'Taksi' },
  other: { ru: 'Другое', uz: 'Boshqa' },
};

export function GuardGuestAccessPage() {
  const navigate = useNavigate();
  const language = useLanguageStore(s => s.language);
  const fetchGuestCodes = useGuestAccessStore(s => s.fetchGuestCodes);
  const getAllGuestAccessCodes = useGuestAccessStore(s => s.getAllGuestAccessCodes);
  const isLoading = useGuestAccessStore(s => s.isLoadingGuestCodes);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchGuestCodes();
  }, [fetchGuestCodes]);

  const allCodes = getAllGuestAccessCodes();

  // Актуально сегодня: (a) активные, у которых valid_from ≤ конец-дня и
  // valid_until ≥ начало-дня — то есть окно действия пересекается с
  // сегодняшним днём. Показываем также expired СЕГОДНЯ (уже прошёл, но
  // сегодня истёк — охраннику иногда полезно видеть недавно закончившиеся).
  const todaysCodes = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;
    return allCodes
      .filter(c => c.status === 'active' || c.status === 'expired')
      .filter(c => {
        const from = new Date(c.validFrom).getTime();
        const until = new Date(c.validUntil).getTime();
        if (Number.isNaN(from) || Number.isNaN(until)) return false;
        return from < todayEnd && until >= todayStart;
      })
      .sort((a, b) => {
        // Active first, then by validUntil desc (свежайшие сверху)
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return new Date(b.validUntil).getTime() - new Date(a.validUntil).getTime();
      });
  }, [allCodes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return todaysCodes;
    return todaysCodes.filter(c =>
      (c.residentName || '').toLowerCase().includes(q)
      || (c.visitorName || '').toLowerCase().includes(q)
      || (c.residentApartment || '').toLowerCase().includes(q)
      || (c.residentAddress || '').toLowerCase().includes(q)
    );
  }, [todaysCodes, query]);

  const activeCount = todaysCodes.filter(c => c.status === 'active').length;

  return (
    <div
      className="admin-form-controls w-full max-w-full min-w-0 fixed left-0 right-0 bottom-0 flex flex-col md:static md:h-auto md:block"
      style={{
        top: 0,
        minHeight: 0,
        marginTop: 0,
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      {/* Pinned chrome — тот же паттерн, что StaffProfilePage / SettingsPage:
          красит safe-area zone под notch, "← Назад + иконка + Пропуска". */}
      <div style={{
        flex: '0 0 auto',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 12,
        background: 'var(--themed-strip-bg, rgba(244,240,232,0.92))',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border-c, #E6DFD2)',
      }}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            aria-label={language === 'ru' ? 'Назад' : 'Ortga'}
            className="staff-primary-control min-h-[44px] min-w-[44px] rounded-full grid place-items-center text-gray-500 hover:text-gray-900 hover:bg-black/[0.04] transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">{language === 'ru' ? 'Пропуска' : 'Ruxsatnomalar'}</h1>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {language === 'ru'
                ? `Активных сегодня: ${activeCount}`
                : `Bugungi faol: ${activeCount}`}
            </p>
          </div>
        </div>
      </div>

      {/* Inner scroller */}
      <div className="settings-scroll" style={{
        flex: '1 1 0',
        minHeight: 0,
        minWidth: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'contain',
        paddingLeft: 12, paddingRight: 12, paddingTop: 12,
        paddingBottom: 'calc(var(--bottom-bar-h, 96px) + 32px)',
      }}>
        {/* Search */}
        <div className="mb-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={language === 'ru' ? 'Поиск по имени, квартире, адресу' : 'Ism, xonadon, manzil bo\'yicha qidirish'}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {/* Список */}
        {isLoading && todaysCodes.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-8">
            {language === 'ru' ? 'Загрузка…' : 'Yuklanmoqda…'}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 px-4">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-500">
              {language === 'ru'
                ? (todaysCodes.length === 0 ? 'На сегодня пропусков нет' : 'Ничего не найдено')
                : (todaysCodes.length === 0 ? 'Bugun ruxsatnomalar yo\'q' : 'Hech narsa topilmadi')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {language === 'ru'
                ? 'Резиденты пока не создали активных пропусков на сегодня.'
                : 'Aholi bugun uchun faol ruxsatnomalar yaratmagan.'}
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          {filtered.map(code => {
            const isActive = code.status === 'active';
            const visitorLabel = VISITOR_LABEL[code.visitorType]?.[language === 'ru' ? 'ru' : 'uz'] || code.visitorType;
            return (
              <div
                key={code.id}
                className="bg-white rounded-[14px] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-3 border border-gray-100"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-gray-900 min-w-0 truncate">
                        {code.visitorName || visitorLabel}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isActive
                          ? (language === 'ru' ? 'Активен' : 'Faol')
                          : (language === 'ru' ? 'Истёк' : 'Muddati o\'tgan')}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 shrink-0">
                        {visitorLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {language === 'ru' ? 'от' : ''} {code.residentName || '—'}
                    </p>
                    <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-gray-600">
                      {(code.residentApartment || code.residentAddress) && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <Home className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">
                            {code.residentApartment
                              ? `${language === 'ru' ? 'кв.' : 'xon.'} ${code.residentApartment}`
                              : code.residentAddress}
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="whitespace-nowrap">
                          {formatDateShort(code.validFrom, language === 'ru' ? 'ru' : 'uz')}, {formatTime(code.validFrom)}–{formatTime(code.validUntil)}
                        </span>
                      </span>
                    </div>
                    {code.visitorVehiclePlate && (
                      <p className="text-xs text-gray-500 mt-1">
                        {language === 'ru' ? 'Авто: ' : 'Avto: '}<span className="font-mono font-semibold text-gray-700">{code.visitorVehiclePlate}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
