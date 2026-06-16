// Phase 2 / commit 2 — NEW component. Inline "АКТИВНАЯ ЗАЯВКА · #UK-…"
// banner that sits BELOW the dialog header and ABOVE the message list
// when the channel has an active request linked to it.
//
// Backend contract per chat-spec.md §3.1:
//   chat_channels.active_request_id  uuid FK → requests (nullable)
//
// At the time of this commit the API doesn't populate active_request_id
// on ChatChannel rows — the field is read defensively from a channel
// extension type. The banner is hidden when no request is linked, so
// this component is a forward-compat surface: when the backend lands
// the field + the request data, the banner activates automatically
// without another frontend change. See docs/design-bundle-admin-chat/
// v2/kamizo-admin-dialog.jsx for the visual reference.
//
// Behaviour:
//   - tap → navigate to /admin/requests/:requestId (router decides what
//     loads — same component the requests list uses).
//   - Hidden entirely when activeRequestId is undefined/null.

import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface ActiveRequest {
  id: string;             // e.g. "UK-S-1001"
  description?: string;   // short title
  status?: string;        // "В работе" / "Принята" / etc.
}

export function ActiveRequestBanner({
  request,
  language,
}: {
  request: ActiveRequest | null | undefined;
  language: 'ru' | 'uz';
}) {
  const navigate = useNavigate();

  if (!request) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/admin/requests/${request.id}`)}
      className="w-full text-left bg-orange-50 hover:bg-orange-100 active:bg-orange-200 border-b border-orange-100 transition-colors touch-manipulation"
      aria-label={
        language === 'ru'
          ? `Перейти к заявке ${request.id}`
          : `${request.id} arizasiga o'tish`
      }
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.04em] uppercase text-orange-600 leading-tight">
            {language === 'ru' ? 'Активная заявка' : 'Faol ariza'}
          </div>
          <div className="text-[13px] font-semibold text-gray-900 truncate leading-tight mt-0.5">
            <span className="font-extrabold text-orange-700">#{request.id}</span>
            {request.description ? <span className="text-gray-700"> · {request.description}</span> : null}
            {request.status ? <span className="text-gray-500"> · {request.status}</span> : null}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-orange-400 flex-shrink-0" />
      </div>
    </button>
  );
}
