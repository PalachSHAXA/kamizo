// v120 — commit 2 of the admin-chat-actions sprint.
//
// Modal triggered from InfoDropdown's "Назначить сотрудника" row (and
// from the "Назначен:" line in DialogHeader when reassigning). Fetches
// /api/team on open, flattens the categorized response into a single
// rank-ordered list, lets the operator filter by name/role, and on
// row-tap calls PATCH /api/admin/chat/channels/:id/assign through the
// chatApi client.
//
// The component is presentational — all channel-state mutations go up
// via onAssigned(updatedChannel) so the parent (ChatView) can keep
// the selectedChannel in sync without a list refetch. Errors surface
// through useToastStore so a 400/403/404 doesn't break the dialog.

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, Loader2 } from 'lucide-react';
import { chatApi, teamApi } from '../../services/api';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { RoleBadge } from './RoleBadge';
import { getAvatarColor, getInitials, type ChatChannel } from './chatUtils';
import type { UserRole } from '../../types';

// The backend returns more role buckets than teamApi.getAll() currently
// types (it predates director / advertiser / security being exposed).
// Cast through a wider local shape so we can render every role without
// breaking the existing teamApi consumers.
interface RawTeamMember {
  id: string;
  name?: string | null;
  full_name?: string | null;
  login?: string | null;
  role: string;
  specialization?: string | null;
}
interface RawTeamResponse {
  directors?: RawTeamMember[];
  admins?: RawTeamMember[];
  managers?: RawTeamMember[];
  departmentHeads?: RawTeamMember[];
  dispatchers?: RawTeamMember[];
  executors?: RawTeamMember[];
  advertisers?: RawTeamMember[];
  security?: RawTeamMember[];
}

// Display order — same rank used by the backend GET /api/team SQL.
// Keep advertisers near the bottom (they can be assigned but rarely
// handle resident chats day-to-day). Security stays at the end —
// chats spec §2 lists them as "no chat access" but the backend GET
// /api/team includes them, so render them too for completeness.
const ROLE_RANK: Record<string, number> = {
  director: 0,
  admin: 1,
  manager: 2,
  department_head: 3,
  dispatcher: 4,
  executor: 5,
  advertiser: 6,
  security: 7,
};

interface FlatStaff {
  id: string;
  name: string;
  role: UserRole;
  initials: string;
}

function flatten(raw: RawTeamResponse | null): FlatStaff[] {
  if (!raw) return [];
  const all: RawTeamMember[] = [
    ...(raw.directors || []),
    ...(raw.admins || []),
    ...(raw.managers || []),
    ...(raw.departmentHeads || []),
    ...(raw.dispatchers || []),
    ...(raw.executors || []),
    ...(raw.advertisers || []),
    ...(raw.security || []),
  ];
  return all
    .filter((u) => !!u?.id && !!u?.role)
    .map((u) => ({
      id: u.id,
      name: (u.full_name || u.name || u.login || '—').trim(),
      role: u.role as UserRole,
      initials: getInitials((u.full_name || u.name || u.login || '?') as string),
    }))
    .sort((a, b) => {
      const ra = ROLE_RANK[a.role] ?? 99;
      const rb = ROLE_RANK[b.role] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, 'ru');
    });
}

const ROLE_LABEL_RU: Record<string, string> = {
  director: 'Директор',
  admin: 'Админ',
  manager: 'Менеджер',
  department_head: 'Глава отдела',
  dispatcher: 'Диспетчер',
  executor: 'Исполнитель',
  advertiser: 'Рекламодатель',
  security: 'Охрана',
};

interface AssignStaffModalProps {
  channel: ChatChannel;
  isOpen: boolean;
  onClose: () => void;
  // Bubble the updated channel up so the parent can replace the row in
  // its local state. The backend PATCH response is the same shape as
  // GET /api/chat/channels/:id, so we cast through ChatChannel here.
  onAssigned: (updated: ChatChannel) => void;
}

export function AssignStaffModal({ channel, isOpen, onClose, onAssigned }: AssignStaffModalProps) {
  const { language } = useLanguageStore();
  const isRu = language === 'ru';
  const addToast = useToastStore((s) => s.addToast);

  const [isLoading, setIsLoading] = useState(false);
  const [staff, setStaff] = useState<FlatStaff[] | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setQuery('');
    (async () => {
      try {
        const raw = (await teamApi.getAll()) as unknown as RawTeamResponse;
        if (cancelled) return;
        setStaff(flatten(raw));
      } catch (e) {
        if (cancelled) return;
        setStaff([]);
        addToast('error', isRu ? 'Не удалось загрузить список сотрудников' : "Xodimlar ro'yxati yuklanmadi");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, addToast, isRu]);

  const filtered = useMemo(() => {
    if (!staff) return [];
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => {
      const roleLabel = (ROLE_LABEL_RU[s.role] || s.role).toLowerCase();
      return s.name.toLowerCase().includes(q) || roleLabel.includes(q);
    });
  }, [staff, query]);

  const currentAssigneeId = channel.assigned_to || null;

  const handleAssign = async (userId: string | null) => {
    if (busyId) return; // guard against double-tap
    setBusyId(userId || '__unassign__');
    try {
      const updated = (await chatApi.assignChannel(channel.id, userId)) as unknown as ChatChannel;
      onAssigned(updated);
      addToast(
        'success',
        userId
          ? isRu
            ? 'Сотрудник назначен'
            : 'Xodim tayinlandi'
          : isRu
          ? 'Назначение снято'
          : 'Tayinlash bekor qilindi',
      );
      onClose();
    } catch (e) {
      addToast('error', isRu ? 'Не удалось назначить, попробуйте позже' : "Tayinlab bo'lmadi, keyinroq urinib ko'ring");
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center sm:p-4 anim-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-staff-modal-title"
      onClick={onClose}
    >
      <div
        // Full-bleed bottom sheet on mobile, centered 480 card on desktop.
        // max-h-[85dvh] keeps the body scrollable without running under
        // the iOS home indicator.
        className="bg-white w-full sm:max-w-[480px] sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[85dvh] anim-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
          <h3 id="assign-staff-modal-title" className="flex-1 text-[15px] font-bold text-gray-900">
            {isRu ? 'Назначить сотрудника' : 'Xodim tayinlash'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={isRu ? 'Закрыть' : 'Yopish'}
            className="w-9 h-9 grid place-items-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRu ? 'Поиск по имени или роли…' : "Ism yoki rol bo'yicha qidirish…"}
              // 16px to dodge iOS auto-zoom on viewports >640px.
              style={{ fontSize: '16px' }}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-400 transition-all"
              aria-label={isRu ? 'Поиск сотрудника' : 'Xodimni qidirish'}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 flex flex-col items-center justify-center text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-[13px]">{isRu ? 'Загрузка…' : 'Yuklanmoqda…'}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-[13px]">
              {query
                ? isRu
                  ? 'Ничего не найдено'
                  : 'Hech narsa topilmadi'
                : isRu
                ? 'Список сотрудников пуст'
                : "Xodimlar ro'yxati bo'sh"}
            </div>
          ) : (
            <ul className="py-1">
              {filtered.map((s) => {
                const isAssigned = s.id === currentAssigneeId;
                const isBusy = busyId === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => handleAssign(s.id)}
                      disabled={!!busyId || isAssigned}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation ${
                        isAssigned ? 'bg-orange-50/40' : ''
                      } ${busyId && !isBusy ? 'opacity-60' : ''}`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(
                          s.name,
                        )} flex items-center justify-center text-white font-semibold text-[13px] shadow-sm flex-shrink-0`}
                      >
                        {s.initials}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-[14px] font-semibold text-gray-900 truncate">{s.name}</div>
                        <div className="mt-0.5">
                          <RoleBadge role={s.role} language={isRu ? 'ru' : 'uz'} />
                        </div>
                      </div>
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 text-orange-500 animate-spin flex-shrink-0" />
                      ) : isAssigned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-semibold flex-shrink-0">
                          <Check className="w-3 h-3" />
                          {isRu ? 'Назначен' : 'Tayinlangan'}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer — unassign action, only visible if someone is currently assigned. */}
        {currentAssigneeId && (
          <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleAssign(null)}
              disabled={!!busyId}
              className="w-full py-2.5 rounded-[12px] bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-[13.5px] font-semibold text-gray-700 transition-colors touch-manipulation disabled:opacity-60"
            >
              {busyId === '__unassign__' ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isRu ? 'Снятие…' : 'Bekor qilinmoqda…'}
                </span>
              ) : isRu ? (
                'Снять назначение'
              ) : (
                'Tayinlashni bekor qilish'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
