// Sprint 21: shared types + label helpers for the guest-access page
// and its split-out child components. Extracted so each child file
// can import these without depending on the parent page.

import type { ReactNode } from 'react';
import type { StatusTone } from '../../theme';
import {
  VISITOR_TYPE_LABELS, ACCESS_TYPE_LABELS, GUEST_ACCESS_STATUS_LABELS,
  type VisitorType, type AccessType,
} from '../../types';
import { safeLabel } from '../../utils/safeLabel';

/** Server log shape from /api/guest-codes/scan-history. Same as the
 *  guard-scanner page uses, kept colocated to avoid cross-imports. */
export interface VisitLog {
  id: string;
  code_id: string;
  scanned_by_id: string;
  scanned_by_name: string;
  scanned_by_role: string;
  action: string;
  visitor_type: string;
  resident_name: string;
  resident_apartment: string;
  scanned_at: string;
}

export type QuickPreset = {
  visitor: VisitorType;
  access: AccessType;
  icon: ReactNode;
  bg: string;
  fg: string;
  titleRu: string;
  titleUz: string;
  subRu: string;
  subUz: string;
};

/** Map guest-access status to semantic StatusTone for StatusBadge. */
export function toneFor(status: string): StatusTone {
  if (status === 'active') return 'active';
  if (status === 'used') return 'info';
  if (status === 'revoked') return 'critical';
  return 'expired';
}

export const safeVisitorLabel = (t: unknown) => safeLabel(VISITOR_TYPE_LABELS, t, VISITOR_TYPE_LABELS.other);
export const safeAccessLabel  = (t: unknown) => safeLabel(ACCESS_TYPE_LABELS,  t, ACCESS_TYPE_LABELS.custom);
export const safeStatusLabel  = (s: unknown) => safeLabel(GUEST_ACCESS_STATUS_LABELS, s, GUEST_ACCESS_STATUS_LABELS.expired);
