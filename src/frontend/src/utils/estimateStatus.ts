/**
 * Статусы согласования сметы и права на них — единый источник для
 * EstimatesPage и мастера v2, чтобы бейджи и кнопки не разъезжались.
 *
 * Зеркалит бэкенд: cloudflare/src/utils/helpers.ts (ESTIMATE_EDIT_ROLES,
 * ESTIMATE_APPROVE_ROLES) и migrations/065_finance_estimate_approval.sql.
 * Здесь это только для UI — доступ всё равно проверяется на сервере.
 */

// Кто вводит и правит смету.
export const ESTIMATE_EDIT_ROLES = [
  'super_admin', 'admin', 'director', 'manager', 'department_head',
];

// Кто утверждает и возвращает на доработку.
export const ESTIMATE_APPROVE_ROLES = ['admin', 'director'];

export function canEditEstimate(role?: string | null): boolean {
  return !!role && ESTIMATE_EDIT_ROLES.includes(role.trim().toLowerCase());
}

export function canApproveEstimate(role?: string | null): boolean {
  return !!role && ESTIMATE_APPROVE_ROLES.includes(role.trim().toLowerCase());
}

/**
 * Одна витринная стадия из двух серверных осей (status + approval_status).
 * Архив показываем как архив независимо от согласования.
 */
export type EstimateStage = 'draft' | 'pending' | 'rejected' | 'approved' | 'archived';

export function estimateStage(est: Record<string, unknown> | null | undefined): EstimateStage {
  if (!est) return 'draft';
  const status = String(est.status || 'draft');
  if (status === 'archived') return 'archived';
  if (status === 'active') return 'approved';
  // status === 'draft' — стадию задаёт ось согласования.
  const approval = String(est.approval_status || 'draft');
  if (approval === 'pending') return 'pending';
  if (approval === 'rejected') return 'rejected';
  if (approval === 'approved') return 'approved';
  return 'draft';
}

export const ESTIMATE_STAGE_STYLES: Record<EstimateStage, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-700',
  approved: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-600',
};

const STAGE_LABELS: Record<EstimateStage, [string, string]> = {
  draft: ['Черновик', 'Qoralama'],
  pending: ['На рассмотрении', "Ko'rib chiqilmoqda"],
  rejected: ['Возвращена на доработку', 'Qayta ishlashga qaytarilgan'],
  approved: ['Утверждена', 'Tasdiqlangan'],
  archived: ['Архив', 'Arxiv'],
};

export function estimateStageLabel(stage: EstimateStage, isRu: boolean): string {
  return STAGE_LABELS[stage][isRu ? 0 : 1];
}

// Правки открыты в черновике и после возврата; на рассмотрении и после
// утверждения — закрыты (тот же инвариант, что и в estimateEditBlockedReason).
export function isEstimateEditable(stage: EstimateStage): boolean {
  return stage === 'draft' || stage === 'rejected';
}

/**
 * Черновик, ещё не привязанный ни к какому объекту (migration 066).
 * Утвердить его нельзя — сперва привязка к объекту. Бэкенд запрещает то же.
 */
export function isUnassignedEstimate(est: Record<string, unknown> | null | undefined): boolean {
  return String(est?.scope_level || '') === 'unassigned';
}

// Имя объекта для карточки: у непривязанного черновика объекта ещё нет.
export function estimateObjectName(
  est: Record<string, unknown> | null | undefined,
  buildingName: string,
  isRu: boolean,
): string {
  if (isUnassignedEstimate(est)) return isRu ? 'Без объекта' : 'Obyektsiz';
  return buildingName || (isRu ? 'Комплекс' : 'Kompleks');
}
