// Phase 2 / commit 1 — extracted from ChatView.tsx. Renders a single
// centered date-pill row above a message that starts a new day's run.
// Matches the previous inline markup byte-for-byte; the v2 design's
// date separator pattern (centered pill with surface-sunken bg) lives
// in docs/design-bundle-admin-chat/v2/kamizo-admin-dialog.jsx L213-217
// for the future visual swap — kept neutral here so commit 1 is a
// pure refactor with zero visible delta.

import { formatDateSeparator } from './chatUtils';

export function DateSeparator({
  dateStr,
  language,
}: {
  dateStr: string;
  language: 'ru' | 'uz';
}) {
  return (
    <div className="flex items-center justify-center py-3">
      <span className="px-3 py-1 bg-black/[0.04] rounded-[10px] text-[11px] text-gray-500 font-medium">
        {formatDateSeparator(dateStr, language)}
      </span>
    </div>
  );
}
