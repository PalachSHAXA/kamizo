// Phase 2 / commit 3 — Resident-context overlay triggered by the
// info-button in DialogHeader. Shows the resident's profile (avatar +
// name + house+apt + role badge), tap-to-call phone, list of linked
// requests (when the channel API exposes them), and the action rows
// at the bottom.
//
// Action-row history (admin-chat-actions sprint, commits 1-3):
//   • Профиль жителя        → stub (commit 3 kept it disabled — the
//                              app router is flat with no :id routes,
//                              so deep-link to a single resident isn't
//                              wirable today; see
//                              docs/known-issues/resident-deep-link.md)
//   • Назначить сотрудника  → live (commit 2 — AssignStaffModal +
//                              PATCH /api/admin/chat/channels/:id/assign)
//   • Пометить решённым    → live (commit 2 — ConfirmDialog +
//                              PATCH /resolve or /unresolve, label
//                              flips on channel.resolved_at)
//   • Закрыть обращение     → REMOVED (commit 3 — duplicate of the
//                              resolve action, same backend semantics)
//
// Backend reality: ChatChannel currently exposes name, apartment,
// branch, building. Phone / linked-requests / personal_account are
// NOT on the channel today — they're read defensively from optional
// fields. The component degrades gracefully: any field that's absent
// just doesn't render its row, so the overlay shrinks to fit
// whatever data is available.
//
// Behaviour: rendered as an absolute-positioned popover anchored top-
// right of the info-button (matches the existing inline-dropdown
// position so the swap is visually continuous). Outside click closes
// via the backdrop. Escape closes via the keyboard handler in
// DialogHeader (Phase 3 will wire it up; for now click outside is the
// only close path).

import { useEffect, useRef } from 'react';
import { Phone, User, Users, Check, ChevronRight, MapPin, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { type ChatChannel, getAvatarColor, getInitials } from './chatUtils';

export interface LinkedRequest {
  id: string;
  title: string;
  status: string;
  state?: 'open' | 'closed' | string;
}

export interface InfoDropdownProps {
  channel?: ChatChannel & {
    /** Phone number — when the API exposes it on the channel response */
    phone?: string;
    /** Resident's full address as a single line, e.g. "ул. Навои 25, кв. 12" */
    address_full?: string;
    /** Resident's personal account number (used for payments / utilities) */
    personal_account?: string;
    /** Linked support / repair requests — chat-spec.md §4.5 */
    requests?: LinkedRequest[];
  };
  language: 'ru' | 'uz';
  onClose: () => void;
  // v120 commit 2 — wire the two admin actions. Parent (ChatView)
  // owns the modal + confirm dialog state so the "Назначен:" line in
  // DialogHeader can also trigger the assign modal. InfoDropdown stays
  // a thin overlay; it just dispatches.
  onAssignClick?: () => void;
  onResolveClick?: () => void;
}

export function InfoDropdown({ channel, language, onClose, onAssignClick, onResolveClick }: InfoDropdownProps) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click via the absolute-positioned backdrop below.
  // The dropdown content stops propagation so internal clicks don't
  // close it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = channel?.name || '';
  const apt = channel?.resident_apartment;
  const building = channel?.resident_building_name;
  const branch = channel?.resident_branch_name;
  const phone = channel?.phone;
  const requests = channel?.requests || [];

  const subtitleParts: string[] = [];
  if (building) subtitleParts.push(building);
  if (apt) subtitleParts.push(language === 'ru' ? `кв. ${apt}` : `${apt}-xona`);
  const subtitle = subtitleParts.join(' · ');

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-50"
      role="presentation"
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 right-3 w-[min(20rem,90vw)] bg-white rounded-[16px] shadow-xl border border-gray-100 overflow-hidden"
        role="dialog"
        aria-label={language === 'ru' ? 'Информация о жителе' : 'Aholi haqida'}
      >
        {/* Resident header */}
        <div className="p-4 flex items-center gap-3 border-b border-gray-100">
          <div
            className={`w-11 h-11 rounded-full bg-gradient-to-br ${getAvatarColor(
              name,
            )} flex items-center justify-center text-white font-semibold text-[13px] shadow-sm flex-shrink-0`}
          >
            {getInitials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold text-gray-900 truncate">{name}</div>
            {subtitle && (
              <div className="text-[12px] text-gray-500 font-semibold mt-0.5 truncate">
                {subtitle}
              </div>
            )}
            {branch && (
              <div className="text-[11px] text-gray-400 font-medium mt-1 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{branch}</span>
              </div>
            )}
          </div>
        </div>

        {/* Phone — tap to call */}
        {phone && (
          <a
            href={`tel:${phone.replace(/\s/g, '')}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-50 touch-manipulation"
          >
            <Phone className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="text-[13.5px] font-semibold text-gray-900 truncate">{phone}</span>
          </a>
        )}

        {/* Linked requests */}
        {requests.length > 0 && (
          <div className="px-4 py-2.5 border-b border-gray-50">
            <div className="text-[10.5px] font-bold tracking-wider uppercase text-gray-400 mb-1.5">
              {language === 'ru' ? 'Заявки жителя' : 'Aholi arizalari'}
            </div>
            {requests.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/admin/requests/${r.id}`)}
                className="w-full flex items-center gap-2 p-2 mb-1 last:mb-0 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-[10px] text-left touch-manipulation"
              >
                <span
                  className={`w-6 h-6 rounded-md grid place-items-center flex-shrink-0 ${
                    r.state === 'closed'
                      ? 'bg-gray-200 text-gray-500'
                      : 'bg-orange-100 text-orange-600'
                  }`}
                >
                  {r.state === 'closed' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Home className="w-3 h-3" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-bold text-gray-900 truncate">
                    {r.title}
                  </span>
                  <span className="block text-[11px] text-gray-500 font-semibold truncate">
                    {r.id} · {r.status}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Actions — all stubs in Phase 2 / commit 3. Profile navigates,
            the rest are placeholders we'll wire in a follow-up. */}
        <div className="py-1">
          {/* TODO(resident-deep-link): wire to resident profile once the
              router gains :id-parameterised routes OR the
              `/residents?focus=:id` convention is approved. Today the
              app router is flat (no :param routes anywhere in
              Layout.tsx) and resident detail is reached only via the
              stateful ResidentCardModal inside the /residents list,
              with no URL surface. Keeping this row visible but
              disabled documents the intent for v120 dispatcher users
              without shipping a half-wired navigation that lands them
              on a generic list (UX gap). See
              docs/known-issues/resident-deep-link.md for the full
              decision log + workaround. */}
          <ActionRow
            icon={<User className="w-4 h-4" />}
            tone="text-gray-700"
            label={language === 'ru' ? 'Профиль жителя' : 'Aholi profili'}
            onClick={() => {
              // Deep-link route does not exist yet — log the intent so
              // the gap surfaces in devtools/Sentry instead of being a
              // silent no-op. Real wiring lands when routing strategy
              // is decided across the app (see known-issue doc).
              if (typeof console !== 'undefined' && console.warn) {
                console.warn('Профиль жителя: deep-link route pending — see docs/known-issues/resident-deep-link.md');
              }
              // Suppress unused-import warning until the route lands.
              void navigate;
              onClose();
            }}
            disabled
          />
          {/* v120 commit 2 — Assign action wired. Disabled only if the
              parent didn't pass a handler (e.g. the resident view, where
              this row should never render in practice). */}
          <ActionRow
            icon={<Users className="w-4 h-4" />}
            tone="text-blue-600"
            label={language === 'ru' ? 'Назначить сотрудника' : "Xodim tayinlash"}
            onClick={() => {
              onClose();
              onAssignClick?.();
            }}
            disabled={!onAssignClick}
          />
          {/* v120 commit 2 — Resolve / Unresolve. Label flips on the
              channel's resolved_at so a single row covers both
              directions. Parent handles the confirm dialog. */}
          <ActionRow
            icon={<Check className="w-4 h-4" />}
            tone="text-emerald-600"
            label={
              channel?.resolved_at
                ? language === 'ru'
                  ? 'Снять отметку решённого'
                  : "Hal qilingan belgisini olib tashlash"
                : language === 'ru'
                ? 'Пометить решённым'
                : 'Hal qilingan deb belgilash'
            }
            onClick={() => {
              onClose();
              onResolveClick?.();
            }}
            disabled={!onResolveClick}
          />
          {/* v121 commit 3 — removed "Закрыть обращение" row.
              It was a stubbed duplicate of "Пометить решённым": both
              mapped to the same PATCH /resolve endpoint in commit 2,
              with no distinct backend semantics. Keeping a single
              action row (label flips on resolved_at) is the cleaner
              UX. Removing it here also drops the only consumer of
              the lucide `X` icon in this file, so the import was
              tightened too. */}
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  tone,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <span className={tone}>{icon}</span>
      <span className={`flex-1 text-left text-[13.5px] font-semibold ${tone}`}>{label}</span>
      {!disabled && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
    </button>
  );
}
