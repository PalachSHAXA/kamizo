// Protocol generation, approval, signing, and data endpoints

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, generateId, isManagement,
  generateVoteHash, createRequestLogger
} from './helpers';

export function registerProtocolRoutes() {

// Generate protocol
route('POST', '/api/meetings/:id/generate-protocol', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const log = createRequestLogger(request);

  try {
    const authUser = await getUser(request, env);
    if (!authUser) return error('Unauthorized', 401);
    if (!['admin', 'director', 'manager'].includes(authUser.role)) return error('Forbidden', 403);
    const tenantId = getTenantId(request);

    const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
    if (!meeting) return error('Meeting not found', 404);

    if (meeting.protocol_id) await env.DB.prepare('DELETE FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).run();

    const protocolId = generateId();
    const protocolNumber = `${meeting.number}/${new Date().getFullYear()}`;
    const { results: protocolAgendaItems } = await env.DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order').bind(params.id).all();

    let content = `# ПРОТОКОЛ №${meeting.number}\n## Общего собрания собственников помещений\n### ${meeting.building_address}\n\n`;
    content += `**Дата проведения:** ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU') : 'Не указана'}\n\n`;
    content += `**Формат:** ${meeting.format === 'online' ? 'Онлайн' : meeting.format === 'offline' ? 'Очное' : 'Смешанное'}\n\n`;
    content += `**Организатор:** ${meeting.organizer_name}\n\n---\n\n## КВОРУМ\n\n`;
    content += `- Общая площадь дома: ${meeting.total_area?.toFixed(2) || 0} кв.м\n- Площадь проголосовавших: ${meeting.voted_area?.toFixed(2) || 0} кв.м\n`;
    content += `- Количество проголосовавших: ${meeting.participated_count || 0} чел.\n- Процент участия (по площади): ${meeting.participation_percent?.toFixed(1) || 0}%\n`;
    content += `- Кворум ${meeting.quorum_reached ? '**ДОСТИГНУТ**' : '**НЕ ДОСТИГНУТ**'}\n\n---\n\n## ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ\n\n`;

    const thresholdLabels: Record<string, string> = { simple_majority: 'Простое большинство (>50%)', qualified_majority: 'Квалифицированное большинство (>60%)', two_thirds: '2/3 голосов (>66.67%)', three_quarters: '3/4 голосов (>75%)', unanimous: 'Единогласно (100%)' };

    for (const item of protocolAgendaItems) {
      const i = item as any;
      const [votesFor, votesAgainst, votesAbstain, comments] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0`).bind(i.id).first(),
        env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0`).bind(i.id).first(),
        env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0`).bind(i.id).first(),
        env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all()
      ]) as any[];

      const forWeight = votesFor?.weight || 0, againstWeight = votesAgainst?.weight || 0, abstainWeight = votesAbstain?.weight || 0;
      const totalWeight = forWeight + againstWeight + abstainWeight;
      const pFor = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
      const pAgainst = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
      const pAbstain = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

      content += `### ${i.item_order}. ${i.title}\n\n`;
      if (i.description) content += `${i.description}\n\n`;
      content += `**Порог принятия:** ${thresholdLabels[i.threshold] || 'Простое большинство'}\n\n**Результаты голосования:**\n`;
      content += `- За: ${votesFor?.count || 0} голосов (${forWeight.toFixed(2)} кв.м, ${pFor.toFixed(1)}%)\n`;
      content += `- Против: ${votesAgainst?.count || 0} голосов (${againstWeight.toFixed(2)} кв.м, ${pAgainst.toFixed(1)}%)\n`;
      content += `- Воздержались: ${votesAbstain?.count || 0} голосов (${abstainWeight.toFixed(2)} кв.м, ${pAbstain.toFixed(1)}%)\n\n`;

      if (comments.results && comments.results.length > 0) {
        const objections = (comments.results as any[]).filter(c => c.comment_type === 'objection');
        const regularComments = (comments.results as any[]).filter(c => c.comment_type !== 'objection');
        if (objections.length > 0) {
          content += `**Возражения участников (голосовали ПРОТИВ):**\n\n`;
          for (const c of objections) { content += `> ⚠️ "${c.content}"\n> — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}\n\n`; if (c.counter_proposal) content += `> 💡 **Альтернативное предложение:** ${c.counter_proposal}\n\n`; }
        }
        if (regularComments.length > 0) {
          content += `**Комментарии участников:**\n\n`;
          for (const c of regularComments) content += `> "${c.content}"\n> — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}\n\n`;
        }
      }
      content += `**РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}**\n\n`;
    }

    const { results: voteRecords } = await env.DB.prepare(`SELECT DISTINCT v.voter_id, v.voter_name, v.apartment_number, COALESCE(u.total_area, v.vote_weight) as vote_weight, MIN(v.voted_at) as voted_at FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.meeting_id = ? AND v.is_revote = 0 GROUP BY v.voter_id ORDER BY v.voter_name`).bind(params.id).all();

    content += `---\n\n## ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ\n\n| № | ФИО | Квартира | Площадь (кв.м) | Время голоса |\n|---|-----|----------|----------------|---------------|\n`;
    for (let idx = 0; idx < voteRecords.length; idx++) { const v = voteRecords[idx] as any; content += `| ${idx + 1} | ${v.voter_name} | ${v.apartment_number || '-'} | ${v.vote_weight || '-'} | ${new Date(v.voted_at).toLocaleString('ru-RU')} |\n`; }
    content += `\n---\n\n## ПОДПИСИ\n\nПротокол сформирован автоматически системой УК\nДата формирования: ${new Date().toLocaleString('ru-RU')}\n\n_Председатель собрания: ____________________\n\n_Секретарь: ____________________\n\n_Члены счётной комиссии: ____________________\n`;

    const protocolHash = generateVoteHash({ meetingId: params.id, generatedAt: new Date().toISOString() });
    await env.DB.prepare(`INSERT INTO meeting_protocols (id, meeting_id, protocol_number, content, protocol_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`).bind(protocolId, params.id, protocolNumber, content, protocolHash, getTenantId(request)).run();
    await env.DB.prepare(`UPDATE meetings SET status = 'protocol_generated', protocol_id = ?, protocol_generated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).bind(protocolId, params.id).run();

    invalidateCache('meetings:');
    const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(protocolId).first();
    return json({ protocol }, 201);
  } catch (err: any) { log.error('Generate protocol error', err); return error(`Protocol generation failed: ${err?.message}`, 500); }
});

// Approve protocol
route('POST', '/api/meetings/:id/approve-protocol', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting?.protocol_id) return error('Protocol not found', 404);

  const signatureHash = generateVoteHash({ userId: authUser.id, signedAt: new Date().toISOString() });
  await env.DB.prepare(`UPDATE meeting_protocols SET signed_by_uk_user_id = ?, signed_by_uk_name = ?, signed_by_uk_role = ?, signed_by_uk_at = datetime('now'), uk_signature_hash = ? WHERE id = ?`).bind(authUser.id, authUser.name, authUser.role, signatureHash, meeting.protocol_id).run();
  await env.DB.prepare(`UPDATE meetings SET status = 'protocol_approved', protocol_approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Get protocol
route('GET', '/api/meetings/:meetingId/protocol', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting?.protocol_id) return error('Protocol not found', 404);

  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Get protocol data as JSON for frontend DOCX generation
route('GET', '/api/meetings/:meetingId/protocol/data', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  const protocol = meeting.protocol_id ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any : null;
  const { results: agendaItems } = await env.DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order').bind(params.meetingId).all();

  const { results: voteRecords } = await env.DB.prepare(`SELECT v.voter_id, v.voter_name, v.apartment_number, COALESCE(u.total_area, v.vote_weight) as vote_weight, MIN(v.voted_at) as voted_at FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.meeting_id = ? AND (v.is_revote = 0 OR v.is_revote IS NULL) GROUP BY v.voter_id ORDER BY v.voter_name`).bind(params.meetingId).all();

  const votesByItem: Record<string, any[]> = {};
  for (const item of agendaItems) {
    const { results: itemVotes } = await env.DB.prepare(`SELECT v.voter_id, v.voter_name, v.apartment_number, COALESCE(u.total_area, v.vote_weight) as vote_weight, v.choice, v.voted_at, c.comment as comment FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id LEFT JOIN meeting_agenda_comments c ON c.agenda_item_id = v.agenda_item_id AND c.user_id = v.voter_id WHERE v.agenda_item_id = ? AND (v.is_revote = 0 OR v.is_revote IS NULL) ORDER BY v.voter_name`).bind((item as any).id).all();
    votesByItem[(item as any).id] = itemVotes;
  }

  const actualVotedArea = voteRecords.reduce((sum: number, r: any) => sum + (Number(r.vote_weight) || 0), 0);
  const totalArea = Number(meeting.total_area) || 1;

  return json({ meeting: { ...meeting, voted_area: actualVotedArea, participated_count: voteRecords.length, participation_percent: Math.min((actualVotedArea / totalArea) * 100, 100) }, agendaItems, voteRecords, votesByItem, protocolHash: protocol?.protocol_hash });
});

} // end registerProtocolRoutes
