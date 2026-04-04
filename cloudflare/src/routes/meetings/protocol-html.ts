// GET /api/meetings/:meetingId/protocol/html — protocol as HTML for PDF

import { route, getTenantId, requireFeature, getCurrentCorsOrigin, error } from './helpers';

export function registerProtocolHtmlRoutes() {

route('GET', '/api/meetings/:meetingId/protocol/html', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  const protocol = meeting.protocol_id ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any : null;
  const { results: agendaItems } = await env.DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order').bind(params.meetingId).all();
  const { results: voteRecords } = await env.DB.prepare(`SELECT voter_id, voter_name, apartment_number, MAX(vote_weight) as vote_weight, MIN(voted_at) as voted_at FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id ORDER BY voter_name`).bind(params.meetingId).all();

  const thresholdLabels: Record<string, string> = { simple_majority: 'Простое большинство (>50%)', qualified_majority: 'Квалифицированное большинство (2/3)', two_thirds: '2/3 голосов', three_quarters: '3/4 голосов', unanimous: 'Единогласно' };

  let html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Протокол собрания №${meeting.number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;padding:20mm;max-width:210mm}h1{text-align:center;font-size:16pt;margin-bottom:10px}h2{font-size:14pt;margin:20px 0 10px;border-bottom:1px solid #333;padding-bottom:5px}h3{font-size:12pt;margin:15px 0 8px}p{margin:5px 0}.header{text-align:center;margin-bottom:30px}.quorum{background:#f5f5f5;padding:10px;border-radius:5px;margin:10px 0}.quorum.reached{background:#e8f5e9;border-left:4px solid #4caf50}.quorum.not-reached{background:#ffebee;border-left:4px solid #f44336}.agenda-item{margin:15px 0;padding:10px;background:#fafafa;border-radius:5px}.votes{display:flex;gap:20px;margin:10px 0}.vote-block{flex:1}.decision{font-weight:bold;font-size:14pt;margin:10px 0;padding:8px;text-align:center}.decision.approved{background:#e8f5e9;color:#2e7d32}.decision.rejected{background:#ffebee;color:#c62828}.comments{margin:10px 0;padding:10px;background:#fff8e1;border-left:3px solid #ffc107}.comment{margin:8px 0;font-style:italic}.comment-author{font-size:10pt;color:#666}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:10pt}th,td{border:1px solid #333;padding:5px 8px;text-align:left}th{background:#f0f0f0}.signatures{margin-top:40px}.signature-line{margin:20px 0;display:flex;justify-content:space-between}.signature-line span{border-bottom:1px solid #333;min-width:200px;display:inline-block}.footer{margin-top:30px;font-size:10pt;color:#666;text-align:center;border-top:1px solid #ccc;padding-top:10px}@media print{body{padding:15mm}.no-print{display:none}}</style></head><body>
<div class="header"><h1>ПРОТОКОЛ №${meeting.number}</h1><p><strong>Общего собрания собственников помещений</strong></p><p>многоквартирного дома по адресу:</p><p><strong>${meeting.building_address || 'Адрес не указан'}</strong></p></div>
<div class="section"><p><strong>Дата проведения:</strong> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p><p><strong>Форма проведения:</strong> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p><p><strong>Инициатор собрания:</strong> ${meeting.organizer_name || 'Управляющая компания'}</p></div>
<h2>СВЕДЕНИЯ О КВОРУМЕ</h2><div class="quorum ${meeting.quorum_reached ? 'reached' : 'not-reached'}"><p><strong>Общая площадь помещений дома:</strong> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p><p><strong>Площадь проголосовавших:</strong> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p><p><strong>Количество правомочных голосующих:</strong> ${meeting.total_eligible_count || 0}</p><p><strong>Приняло участие:</strong> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p><p><strong>Кворум:</strong> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p></div>
<h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>`;

  for (const item of agendaItems) {
    const i = item as any;
    const [vF, vA, vAb, comments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all()
    ]) as any[];
    const fW = vF?.weight || 0, aW = vA?.weight || 0, abW = vAb?.weight || 0, tW = fW + aW + abW;
    const pF = tW > 0 ? (fW / tW) * 100 : 0, pA = tW > 0 ? (aW / tW) * 100 : 0, pAb = tW > 0 ? (abW / tW) * 100 : 0;

    html += `<div class="agenda-item"><h3>${i.item_order}. ${i.title}</h3>${i.description ? `<p>${i.description}</p>` : ''}<p><em>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</em></p><div class="votes"><div class="vote-block"><strong>ЗА:</strong> ${vF?.count || 0} голосов (${fW.toFixed(2)} кв.м) — ${pF.toFixed(1)}%</div><div class="vote-block"><strong>ПРОТИВ:</strong> ${vA?.count || 0} голосов (${aW.toFixed(2)} кв.м) — ${pA.toFixed(1)}%</div><div class="vote-block"><strong>ВОЗДЕРЖАЛИСЬ:</strong> ${vAb?.count || 0} голосов (${abW.toFixed(2)} кв.м) — ${pAb.toFixed(1)}%</div></div>`;

    if (comments.results?.length > 0) {
      html += `<div class="comments"><p><strong>Доводы участников:</strong></p>`;
      for (const c of comments.results as any[]) html += `<div class="comment">"${c.content}"<div class="comment-author">— ${c.resident_name}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}</div></div>`;
      html += `</div>`;
    }
    html += `<div class="decision ${i.is_approved ? 'approved' : 'rejected'}">РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}</div></div>`;
  }

  html += `<h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2><table><thead><tr><th>№</th><th>ФИО</th><th>Квартира</th><th>Площадь (кв.м)</th><th>Время голосования</th></tr></thead><tbody>`;
  for (let idx = 0; idx < voteRecords.length; idx++) { const v = voteRecords[idx] as any; html += `<tr><td>${idx + 1}</td><td>${v.voter_name}</td><td>${v.apartment_number || '-'}</td><td>${v.vote_weight || '-'}</td><td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td></tr>`; }
  html += `</tbody></table><div class="signatures"><h2>ПОДПИСИ</h2><div class="signature-line"><span>Председатель собрания:</span><span>____________________</span><span>____________________</span></div><div class="signature-line"><span>Секретарь:</span><span>____________________</span><span>____________________</span></div><div class="signature-line"><span>Члены счётной комиссии:</span><span>____________________</span><span>____________________</span></div></div><div class="footer"><p>Протокол сформирован автоматически системой УК</p><p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}</div></body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': getCurrentCorsOrigin() } });
});

} // end registerProtocolHtmlRoutes
