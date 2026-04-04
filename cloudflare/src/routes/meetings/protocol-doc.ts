// GET /api/meetings/:meetingId/protocol/doc — protocol as Word document

import { route, getTenantId, requireFeature, getCurrentCorsOrigin, error } from './helpers';

export function registerProtocolDocRoutes() {

route('GET', '/api/meetings/:meetingId/protocol/doc', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  const protocol = meeting.protocol_id ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any : null;
  const { results: agendaItems } = await env.DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order').bind(params.meetingId).all();
  const { results: voteRecords } = await env.DB.prepare(`SELECT voter_id, voter_name, apartment_number, MAX(vote_weight) as vote_weight, MIN(voted_at) as voted_at FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id ORDER BY voter_name`).bind(params.meetingId).all();

  const thresholdLabels: Record<string, string> = { simple_majority: 'Простое большинство (>50%)', qualified_majority: 'Квалифицированное большинство (2/3)', two_thirds: '2/3 голосов', three_quarters: '3/4 голосов', unanimous: 'Единогласно' };

  let doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>@page{size:A4;margin:2cm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5}h1{text-align:center;font-size:16pt;margin-bottom:10pt}h2{font-size:14pt;margin-top:20pt;margin-bottom:10pt;border-bottom:1pt solid #333;padding-bottom:5pt}h3{font-size:12pt;margin-top:15pt;margin-bottom:8pt}p{margin:5pt 0}.header{text-align:center;margin-bottom:30pt}.quorum{background-color:#f5f5f5;padding:10pt;margin:10pt 0;border-left:4pt solid #4caf50}.agenda-item{margin:15pt 0;padding:10pt;background-color:#fafafa}.decision{font-weight:bold;font-size:14pt;margin:10pt 0;padding:8pt;text-align:center}.decision-approved{background-color:#e8f5e9;color:#2e7d32}.decision-rejected{background-color:#ffebee;color:#c62828}table{width:100%;border-collapse:collapse;margin:10pt 0;font-size:10pt}th,td{border:1pt solid #333;padding:5pt 8pt;text-align:left}th{background-color:#f0f0f0}.signatures{margin-top:40pt}.signature-line{margin:30pt 0}.footer{margin-top:30pt;font-size:10pt;color:#666;text-align:center;border-top:1pt solid #ccc;padding-top:10pt}</style></head><body>
<div class="header"><h1>ПРОТОКОЛ №${meeting.number}</h1><p><b>Общего собрания собственников помещений</b></p><p>многоквартирного дома по адресу:</p><p><b>${meeting.building_address || 'Адрес не указан'}</b></p></div>
<div class="section"><p><b>Дата проведения:</b> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p><p><b>Форма проведения:</b> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p><p><b>Инициатор собрания:</b> ${meeting.organizer_name || 'Управляющая компания'}</p></div>
<h2>СВЕДЕНИЯ О КВОРУМЕ</h2><div class="quorum"><p><b>Общая площадь помещений дома:</b> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p><p><b>Площадь проголосовавших:</b> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p><p><b>Количество правомочных голосующих:</b> ${meeting.total_eligible_count || 0}</p><p><b>Приняло участие:</b> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p><p><b>Кворум:</b> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p></div>
<h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>`;

  for (const item of agendaItems) {
    const i = item as any;
    const [vF, vA, vAb, docComments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all(),
    ]) as any[];
    const fW = vF?.weight || 0, aW = vA?.weight || 0, abW = vAb?.weight || 0, tW = fW + aW + abW;
    const pF = tW > 0 ? (fW / tW) * 100 : 0, pA = tW > 0 ? (aW / tW) * 100 : 0, pAb = tW > 0 ? (abW / tW) * 100 : 0;

    const objections = (docComments?.results || []).filter((c: any) => c.comment_type === 'objection');
    const regularComments = (docComments?.results || []).filter((c: any) => c.comment_type !== 'objection');
    let objHtml = '';
    if (objections.length > 0) { objHtml += `<p><b>Возражения участников (голосовали ПРОТИВ):</b></p>`; for (const c of objections as any[]) { objHtml += `<blockquote>⚠️ "${c.content}" — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}`; if (c.counter_proposal) objHtml += `<br/>💡 <b>Альтернативное предложение:</b> ${c.counter_proposal}`; objHtml += `</blockquote>`; } }
    if (regularComments.length > 0) { objHtml += `<p><b>Комментарии участников:</b></p>`; for (const c of regularComments as any[]) objHtml += `<blockquote>"${c.content}" — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}</blockquote>`; }

    doc += `<div class="agenda-item"><h3>${i.item_order}. ${i.title}</h3>${i.description ? `<p>${i.description}</p>` : ''}<p><i>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</i></p><table><tr><th>ЗА</th><th>ПРОТИВ</th><th>ВОЗДЕРЖАЛИСЬ</th></tr><tr><td>${vF?.count || 0} голосов (${fW.toFixed(2)} кв.м) — ${pF.toFixed(1)}%</td><td>${vA?.count || 0} голосов (${aW.toFixed(2)} кв.м) — ${pA.toFixed(1)}%</td><td>${vAb?.count || 0} голосов (${abW.toFixed(2)} кв.м) — ${pAb.toFixed(1)}%</td></tr></table>${objHtml}<div class="decision ${i.is_approved ? 'decision-approved' : 'decision-rejected'}">РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}</div></div>`;
  }

  doc += `<h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2><table><tr><th>№</th><th>ФИО</th><th>Квартира</th><th>Площадь (кв.м)</th><th>Время голосования</th></tr>`;
  for (let idx = 0; idx < voteRecords.length; idx++) { const v = voteRecords[idx] as any; doc += `<tr><td>${idx + 1}</td><td>${v.voter_name}</td><td>${v.apartment_number || '-'}</td><td>${v.vote_weight || '-'}</td><td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td></tr>`; }
  doc += `</table><div class="signatures"><h2>ПОДПИСИ</h2><div class="signature-line"><p>Председатель собрания: ______________________ / ______________________ /</p></div><div class="signature-line"><p>Секретарь: ______________________ / ______________________ /</p></div><div class="signature-line"><p>Члены счётной комиссии: ______________________ / ______________________ /</p></div></div><div class="footer"><p>Протокол сформирован автоматически системой УК</p><p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}</div></body></html>`;

  const filename = `protocol_${meeting.number}_${new Date().toISOString().split('T')[0]}.doc`;
  return new Response(doc, { headers: { 'Content-Type': 'application/msword', 'Content-Disposition': `attachment; filename="${filename}"`, 'Access-Control-Allow-Origin': getCurrentCorsOrigin() } });
});

} // end registerProtocolDocRoutes
