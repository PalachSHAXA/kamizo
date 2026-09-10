// PR-8 (feat/smeta-approval-workflow): футер «Утверждение общим собранием»
// для PDF-сметы. Источник данных — approval_meeting_id + approval_protocol_number
// + approval_vote_result + approval_signed_at (миграция 086) плюс уже
// существующие approved_at/approved_by_name (миграция 065).
//
// Инвариант baseline: если approval_status !== 'approved' ИЛИ отсутствуют
// все approval_meeting_* поля — helper возвращает '' → секция не рендерится
// → SHA256 baseline PDF (0bb1d311…) сохраняется. Утверждённые сметы с
// заполненным протоколом получают дополнительный блок «Утверждено решением
// ОС от …, протокол №…, п. …. Итоги: …. Подписан: ….».

export interface ApprovalFields {
  approval_status?: string | null;
  approved_at?: string | null;
  approved_by_name?: string | null;
  approval_meeting_id?: string | null;
  approval_meeting_number?: number | string | null;
  approval_meeting_confirmed_at?: string | null;
  approval_protocol_number?: string | null;
  approval_agenda_item_id?: string | null;
  approval_vote_result?: string | null;
  approval_signed_at?: string | null;
  approval_notes?: string | null;
}

function hasAny(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

/** Возвращает HTML-блок «Утверждение» или '' если рендерить нечего. */
export function renderApprovalFooterHtml(
  e: ApprovalFields | null | undefined,
  lang: 'ru' | 'uz',
  escape: (s: string) => string,
): string {
  if (!e) return '';
  if (e.approval_status !== 'approved') return '';

  // Требуется хотя бы одно из approval_meeting_* полей — иначе секция
  // ничем не отличается от места подписи и baseline не должен ломаться.
  const anyMeetingField =
    hasAny(e.approval_meeting_id) ||
    hasAny(e.approval_meeting_number) ||
    hasAny(e.approval_protocol_number) ||
    hasAny(e.approval_vote_result) ||
    hasAny(e.approval_signed_at) ||
    hasAny(e.approval_meeting_confirmed_at) ||
    hasAny(e.approval_notes);
  if (!anyMeetingField) return '';

  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const meetingDate = e.approval_meeting_confirmed_at || e.approval_signed_at || e.approved_at;
  const parts: string[] = [];

  const introDate = meetingDate ? ` ${t('от', '')} ${escape(String(meetingDate).slice(0, 10))}` : '';
  const protoNum = hasAny(e.approval_protocol_number) ? `, ${t('протокол', 'protokol')} ${escape(String(e.approval_protocol_number))}` : '';
  const meetingNum = hasAny(e.approval_meeting_number) ? ` (${t('собрание', 'yig‘ilish')} №${escape(String(e.approval_meeting_number))})` : '';
  parts.push(`<b>${t('Утверждено решением общего собрания собственников', 'Egalar umumiy yig‘ilishi qarori bilan tasdiqlangan')}</b>${introDate}${protoNum}${meetingNum}.`);

  if (hasAny(e.approval_vote_result)) {
    parts.push(`${t('Итоги голосования', 'Ovoz berish natijalari')}: ${escape(String(e.approval_vote_result))}.`);
  }
  if (hasAny(e.approval_signed_at)) {
    parts.push(`${t('Протокол подписан', 'Protokol imzolangan')}: ${escape(String(e.approval_signed_at).slice(0, 10))}.`);
  }
  if (hasAny(e.approved_by_name)) {
    parts.push(`${t('Отметку об утверждении внёс', 'Tasdiq belgisini qo‘ydi')}: ${escape(String(e.approved_by_name))}.`);
  }
  if (hasAny(e.approval_notes)) {
    parts.push(`${t('Примечания', 'Izohlar')}: ${escape(String(e.approval_notes))}`);
  }

  return `
    <div class="footer-approval" style="margin-top:6mm; padding:3mm 4mm; border:1px solid #444; background:#f8f8f0; font-size:9pt; line-height:1.5;">
      <div style="font-weight:700; margin-bottom:1mm;">${t('Утверждение', 'Tasdiqlash')}</div>
      ${parts.map((p) => `<div>${p}</div>`).join('\n      ')}
    </div>`;
}
