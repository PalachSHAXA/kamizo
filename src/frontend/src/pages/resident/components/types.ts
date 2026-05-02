import type { Request, ExecutorSpecialization, RequestPriority, RescheduleRequest } from '../../../types';

export type { Request, ExecutorSpecialization, RequestPriority, RescheduleRequest };

export type ActiveTab = 'home' | 'requests';
export type RequestsSubTab = 'active' | 'pending_tab' | 'history_tab';

export interface HomeTabProps {
  language: string;
  user: Record<string, unknown> | null;
  activeRequests: Request[];
  latestAnnouncements: Record<string, unknown>[];
  activeMeetings: Record<string, unknown>[];
  financeBalance: Record<string, unknown> | null;
  tenantName: string;
  switchTab: (tab: ActiveTab) => void;
  setSelectedRequest: (request: Request) => void;
  setShowAllServices: (show: boolean) => void;
  generateReconciliation: (params: { apartment_id: string; period_from: string; period_to: string }) => Promise<unknown>;
}

export interface RequestsTabProps {
  language: string;
  activeRequests: Request[];
  pendingApproval: Request[];
  historyRequests: Request[];
  requestsSubTab: RequestsSubTab;
  setRequestsSubTab: (tab: RequestsSubTab) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  filterCategory: string;
  setFilterCategory: (category: string) => void;
  filterPriority: string;
  setFilterPriority: (priority: string) => void;
  isLoadingRequests: boolean;
  requestsCount: number;
  switchTab: (tab: ActiveTab) => void;
  setSelectedRequest: (request: Request) => void;
  handleApproveClick: (request: Request) => void;
  // Opens the service picker directly so the CTA on the requests tab can
  // create a new request without bouncing through the home tab.
  openNewRequest?: () => void;
}

export interface ServiceBottomSheetProps {
  language: string;
  serviceSearch: string;
  setServiceSearch: (v: string) => void;
  serviceCatFilter: string;
  setServiceCatFilter: (v: string) => void;
  selectedServiceId: string | null;
  setSelectedServiceId: (v: string | null) => void;
  onClose: () => void;
  onSubmit: (id: string) => void;
}

export interface NewRequestModalProps {
  category: ExecutorSpecialization;
  user: Record<string, unknown> | null;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    category: ExecutorSpecialization;
    priority: RequestPriority;
    scheduledDate?: string;
    scheduledTime?: string;
  }) => void;
}

export interface ApproveModalProps {
  request: Request;
  onClose: () => void;
  onApprove: (rating: number, feedback?: string) => void;
  onReject: (reason: string) => void;
}

export interface RequestDetailsModalProps {
  request: Request;
  onClose: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  hasActiveReschedule: boolean;
}

export interface HistoryRequestCardProps {
  request: Request;
  onClick: () => void;
}

export interface PendingApprovalCardProps {
  request: Request;
  onApprove: () => void;
}
