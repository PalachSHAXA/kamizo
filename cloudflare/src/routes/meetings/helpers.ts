// Shared helpers and re-exports for meeting routes

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { getCurrentCorsOrigin } from '../../middleware/cors';
import { getCached, setCache, invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import { createRequestLogger } from '../../utils/logger';

// Re-export everything for sub-modules
export {
  route, getUser, getTenantId, requireFeature, getCurrentCorsOrigin,
  getCached, setCache, invalidateCache,
  json, error, generateId, isManagement,
  sendPushNotification, createRequestLogger
};
export type { Env };

// Helper: Fetch meeting with agenda items and schedule options
export async function getMeetingWithDetails(env: Env, meetingId: string, tenantId?: string | null): Promise<any> {
  const meeting = await env.DB.prepare(
    `SELECT * FROM meetings WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return null;

  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY order_index ASC'
  ).bind(meetingId).all();

  // Load ALL votes for this meeting in one query, then group by agenda_item_id
  const { results: allVotes } = await env.DB.prepare(
    'SELECT * FROM meeting_vote_records WHERE meeting_id = ?'
  ).bind(meetingId).all();

  const votesByAgendaItem = new Map<string, any[]>();
  for (const vote of (allVotes || []) as any[]) {
    const key = vote.agenda_item_id as string;
    if (!votesByAgendaItem.has(key)) votesByAgendaItem.set(key, []);
    votesByAgendaItem.get(key)!.push(vote);
  }

  for (const item of (agendaItems || []) as any[]) {
    item.votes = votesByAgendaItem.get(item.id) || [];

    if (item.attachments && typeof item.attachments === 'string') {
      try { item.attachments = JSON.parse(item.attachments); } catch { item.attachments = []; }
    }
  }

  const { results: scheduleOptions } = await env.DB.prepare(
    'SELECT * FROM meeting_schedule_options WHERE meeting_id = ? ORDER BY proposed_date ASC'
  ).bind(meetingId).all();

  meeting.agenda_items = agendaItems || [];
  meeting.schedule_options = scheduleOptions || [];

  return meeting;
}

// Helper: Generate vote hash
export const generateVoteHash = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
};

// Helper: Generate OTP code
export const generateOTPCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
