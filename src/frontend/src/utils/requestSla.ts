// SLA / overdue detection for management views.
//
// Purely client-side: uses timestamps the request already carries. Flags a
// request as "overdue" when it has been sitting too long in a stage that the
// UK / executor is responsible for moving forward. Targets are priority-aware
// (an urgent leak must be assigned far faster than a low-priority request).
//
// Note on timestamps: the requests table has no dedicated assigned_at /
// accepted_at columns, so for the "assigned" and "accepted" stages we use
// updated_at (bumped on every status transition) as a close proxy for "entered
// this stage at". started_at is precise for the in_progress stage.

import type { Request, RequestPriority, RequestStatus } from '../types';

export type SlaStage = 'assign' | 'accept' | 'start' | 'work';

// Minutes allowed in each stage before it is considered overdue, per priority.
const TARGET_MIN: Record<SlaStage, Record<RequestPriority, number>> = {
  assign: { urgent: 15, high: 30, medium: 120, low: 240 },   // new → assigned
  accept: { urgent: 15, high: 30, medium: 60, low: 120 },    // assigned → accepted
  start:  { urgent: 30, high: 60, medium: 120, low: 240 },   // accepted → in_progress
  work:   { urgent: 120, high: 240, medium: 480, low: 1440 }, // in_progress → completed
};

const STAGE_FOR_STATUS: Partial<Record<RequestStatus, SlaStage>> = {
  new: 'assign',
  assigned: 'accept',
  accepted: 'start',
  in_progress: 'work',
};

export interface RequestSla {
  overdue: boolean;
  stage: SlaStage | null;
  elapsedMin: number; // time spent in the current actionable stage
  targetMin: number;  // allowed time for this stage/priority
}

const NO_SLA: RequestSla = { overdue: false, stage: null, elapsedMin: 0, targetMin: 0 };

// SQLite datetimes come back as "YYYY-MM-DD HH:MM:SS" in UTC without a zone
// marker — normalise to a real UTC instant.
function parseUtc(ts?: string): number | null {
  if (!ts) return null;
  const hasZone = ts.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(ts);
  const iso = hasZone ? ts : ts.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function getRequestSla(req: Request, now: number = Date.now()): RequestSla {
  // Paused work is stalled on purpose — never flag it as overdue.
  if (req.isPaused) return NO_SLA;
  const stage = STAGE_FOR_STATUS[req.status];
  if (!stage) return NO_SLA; // pending_approval waits on the resident; done/cancelled are terminal

  let since: number | null;
  let pausedMs = 0;
  switch (stage) {
    case 'assign': since = parseUtc(req.createdAt); break;
    case 'accept': since = parseUtc(req.updatedAt) ?? parseUtc(req.assignedAt) ?? parseUtc(req.createdAt); break;
    case 'start':  since = parseUtc(req.updatedAt) ?? parseUtc(req.acceptedAt) ?? parseUtc(req.createdAt); break;
    case 'work':   since = parseUtc(req.startedAt) ?? parseUtc(req.updatedAt); pausedMs = (req.totalPausedTime || 0) * 1000; break;
    default: since = null;
  }
  if (since === null) return NO_SLA;

  const elapsedMin = Math.max(0, Math.floor((now - since - pausedMs) / 60000));
  const targetMin = TARGET_MIN[stage][req.priority || 'medium'];
  return { overdue: elapsedMin > targetMin, stage, elapsedMin, targetMin };
}

// Compact human label for an overdue request, e.g. "Не назначена · 45 мин".
export function slaStageLabel(stage: SlaStage, language: 'ru' | 'uz'): string {
  const map: Record<SlaStage, { ru: string; uz: string }> = {
    assign: { ru: 'Не назначена', uz: 'Tayinlanmagan' },
    accept: { ru: 'Не принята', uz: 'Qabul qilinmagan' },
    start:  { ru: 'Не начата', uz: 'Boshlanmagan' },
    work:   { ru: 'Долго в работе', uz: 'Uzoq davom etmoqda' },
  };
  return language === 'ru' ? map[stage].ru : map[stage].uz;
}

// "1 ч 5 мин" / "45 мин"
export function formatElapsed(min: number, language: 'ru' | 'uz'): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hu = language === 'ru' ? 'ч' : 'soat';
  const mu = language === 'ru' ? 'мин' : 'daq';
  return h > 0 ? `${h} ${hu} ${m} ${mu}` : `${m} ${mu}`;
}
