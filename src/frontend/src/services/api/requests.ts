// Requests API, Reschedule API, Ratings API, UK Ratings API, Categories API, Stats API, Work Orders API

import { apiRequest, cachedGet, invalidateCache, CACHE_TTL } from './client';
import type { ExecutorSpecialization, RequestPriority, RequestStatus } from '../../types/common';
import type {
  RescheduleInitiator,
  RescheduleReason,
  RescheduleRequestStatus,
} from '../../types/reschedule';

export interface RequestApiRecord {
  id?: string;
  request_number?: string | number;
  number?: string | number;
  title?: string;
  description?: string;
  category_id?: ExecutorSpecialization;
  status?: RequestStatus;
  priority?: RequestPriority;
  resident_id?: string;
  resident_name?: string;
  resident_phone?: string;
  address?: string;
  apartment?: string;
  executor_id?: string;
  executor_name?: string;
  executor_phone?: string;
  access_info?: string;
  scheduled_at?: string;
  created_at?: string;
  assigned_at?: string;
  accepted_at?: string;
  started_at?: string;
  completed_at?: string;
  updated_at?: string;
  approved_at?: string;
  rating?: number;
  feedback?: string;
  work_duration?: number;
  building_id?: string;
  building_name?: string;
  photos?: unknown;
  completion_photos?: unknown;
  is_paused?: number | boolean;
  paused_at?: string;
  pause_reason?: string;
  total_paused_time?: number;
}

export interface CreatedRequestApiRecord extends RequestApiRecord {
  id: string;
  title: string;
  description: string;
  category_id: ExecutorSpecialization;
  status: RequestStatus;
  resident_id: string;
  resident_name: string;
  resident_phone: string;
  address: string;
  apartment: string;
  created_at: string;
}

export interface RescheduleApiRecord {
  id: string;
  request_id: string;
  request_number?: string | number;
  request_title?: string;
  initiator: RescheduleInitiator;
  initiator_id: string;
  initiator_name: string;
  recipient_id: string;
  recipient_name: string;
  recipient_role: 'resident' | 'executor';
  current_date?: string;
  current_time?: string;
  proposed_date: string;
  proposed_time: string;
  reason: RescheduleReason;
  reason_text?: string;
  status: RescheduleRequestStatus;
  response_note?: string;
  created_at: string;
  responded_at?: string;
  expires_at: string;
}

export interface WorkOrderApiRecord extends Record<string, unknown> {
  id: string;
  number: string;
  title: string;
  description?: string;
  type: 'planned' | 'preventive' | 'emergency' | 'seasonal';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  building_id?: string;
  buildingId?: string;
  apartment_id?: string;
  apartmentId?: string;
  assigned_to?: string;
  assignedTo?: string;
  scheduled_date?: string;
  scheduledDate?: string;
  scheduled_time?: string;
  scheduledTime?: string;
  started_at?: string;
  startedAt?: string;
  completed_at?: string;
  completedAt?: string;
  estimated_duration?: number;
  estimatedDuration?: number;
  actual_duration?: number;
  actualDuration?: number;
  materials?: string | Array<{ name: string; quantity: number; unit?: string }>;
  checklist?: string | Array<{ item: string; completed: boolean }>;
  notes?: string;
  request_id?: string;
  requestId?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

// Requests API
export const requestsApi = {
  getAll: async (status?: string, category?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    const queryString = params.toString();
    // Use cached GET with short TTL (10s) - requests change frequently
    return cachedGet<{ requests: RequestApiRecord[] }>(`/api/requests${queryString ? '?' + queryString : ''}`, CACHE_TTL.SHORT);
  },

  create: async (request: {
    category_id: string;
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    access_info?: string;
    scheduled_at?: string;
    // For manual creation by managers/admins - specify resident
    resident_id?: string;
    photos?: string[];
  }) => {
    const result = await apiRequest<{ request: CreatedRequestApiRecord }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    invalidateCache('/api/requests');
    return result;
  },

  update: async (requestId: string, updates: {
    status?: string;
    executor_id?: string;
    rating?: number;
    feedback?: string;
  }) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    invalidateCache('/api/requests');
    return result;
  },

  assign: async (requestId: string, executorId: string) => {
    const result = await apiRequest<{ request: Record<string, unknown> }>(`/api/requests/${requestId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ executor_id: executorId }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  accept: async (requestId: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/accept`, {
      method: 'POST',
    });
    invalidateCache('/api/requests');
    return result;
  },

  start: async (requestId: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/start`, {
      method: 'POST',
    });
    invalidateCache('/api/requests');
    return result;
  },

  complete: async (requestId: string, completionPhotos?: string[]) => {
    invalidateCache('/api/requests');
    return apiRequest<{ success: boolean }>(`/api/requests/${requestId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ completion_photos: completionPhotos ?? [] }),
    });
  },

  pause: async (requestId: string, reason?: string) => {
    const result = await apiRequest<{ success: boolean; request: Record<string, unknown> }>(`/api/requests/${requestId}/pause`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  resume: async (requestId: string) => {
    const result = await apiRequest<{ success: boolean; request: Record<string, unknown>; totalPausedTime: number }>(`/api/requests/${requestId}/resume`, {
      method: 'POST',
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Resident approves completed work
  approve: async (requestId: string, rating?: number, feedback?: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Resident rejects work (sends back to executor)
  reject: async (requestId: string, reason: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Legacy rate endpoint (for backward compatibility)
  rate: async (requestId: string, rating: number, feedback?: string) => {
    return apiRequest<{ success: boolean }>(`/api/requests/${requestId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  },

  // Cancel request
  cancel: async (requestId: string, reason: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Decline/Release request (executor releases the request back to queue)
  decline: async (requestId: string, reason: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/requests/${requestId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    invalidateCache('/api/requests');
    return result;
  },

  // Reschedule requests
  createReschedule: async (requestId: string, data: {
    proposed_date: string;
    proposed_time: string;
    reason: string;
    reason_text?: string;
  }) => {
    return apiRequest<{ reschedule: RescheduleApiRecord }>(`/api/requests/${requestId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getReschedules: async (requestId: string) => {
    return apiRequest<{ reschedules: RescheduleApiRecord[] }>(`/api/requests/${requestId}/reschedule`);
  },
};

// Per-request chat (resident <-> assigned executor)
export interface RequestMessageRecord {
  id: string;
  sender_id: string;
  sender_role?: string;
  sender_name?: string;
  body: string;
  created_at: string;
}

export const requestMessagesApi = {
  list: (requestId: string) =>
    apiRequest<{ messages: RequestMessageRecord[]; writable: boolean; status: string }>(
      `/api/requests/${requestId}/messages`,
      { cache: 'no-store' },
    ),
  send: (requestId: string, body: string) =>
    apiRequest<{ message: RequestMessageRecord }>(`/api/requests/${requestId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
};

// Reschedule API (for pending reschedules)
export const rescheduleApi = {
  // Get pending reschedules for current user
  getPending: async () => {
    return apiRequest<{ reschedules: RescheduleApiRecord[] }>('/api/reschedule-requests');
  },

  // Respond to reschedule request.
  // Invalidates both the reschedule list and the requests cache because
  // accepted reschedules mutate the request's scheduled_at — leaving the
  // requests cache stale would show the old time for up to ~10s after
  // the resident accepts/rejects (audit P0 fix).
  respond: async (rescheduleId: string, accepted: boolean, responseNote?: string) => {
    const result = await apiRequest<{ reschedule: RescheduleApiRecord }>(`/api/reschedule-requests/${rescheduleId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accepted, response_note: responseNote }),
    });
    invalidateCache('/api/reschedule-requests');
    invalidateCache('/api/requests');
    return result;
  },
};

// UK Satisfaction Ratings API
export const ukRatingsApi = {
  submitRating: async (data: {
    overall: number;
    cleanliness?: number;
    responsiveness?: number;
    communication?: number;
    comment?: string;
  }) => {
    return apiRequest<{ success: boolean; period: string }>('/api/uk-ratings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMyRating: async () => {
    return apiRequest<{ rating: Record<string, unknown> | null; period: string }>('/api/uk-ratings/my');
  },

  getSummary: async (months = 6) => {
    return apiRequest<{
      monthly: Record<string, unknown>[];
      current: Record<string, unknown>;
      previous: Record<string, unknown>;
      trend: number;
      recentComments: Record<string, unknown>[];
      currentPeriod: string;
    }>(`/api/uk-ratings/summary?months=${months}`);
  },
};

// Categories API
export const categoriesApi = {
  getAll: async () => {
    return apiRequest<{ categories: Record<string, unknown>[] }>('/api/categories');
  },
};

// Stats API
export const statsApi = {
  getDashboard: async () => {
    return apiRequest<Record<string, unknown>>('/api/stats/dashboard');
  },
};

// Work Orders API
export const workOrdersApi = {
  getAll: async (filters?: { status?: string; type?: string; priority?: string; buildingId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.buildingId) params.append('building_id', filters.buildingId);
    const queryString = params.toString();
    return cachedGet<{ workOrders: WorkOrderApiRecord[] }>(`/api/work-orders${queryString ? '?' + queryString : ''}`, CACHE_TTL.SHORT);
  },

  create: async (data: {
    title: string;
    description?: string;
    type: 'planned' | 'preventive' | 'emergency' | 'seasonal';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    building_id?: string;
    apartment_id?: string;
    assigned_to?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    estimated_duration?: number;
    materials?: Record<string, unknown>[];
    checklist?: Record<string, unknown>[];
    notes?: string;
    request_id?: string;
  }) => {
    const result = await apiRequest<{ workOrder: Record<string, unknown> }>('/api/work-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    invalidateCache('/api/work-orders');
    return result;
  },

  update: async (id: string, data: Record<string, unknown>) => {
    const result = await apiRequest<{ workOrder: Record<string, unknown> }>(`/api/work-orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    invalidateCache('/api/work-orders');
    return result;
  },

  updateStatus: async (id: string, status: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/work-orders/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    invalidateCache('/api/work-orders');
    return result;
  },

  delete: async (id: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/work-orders/${id}`, {
      method: 'DELETE',
    });
    invalidateCache('/api/work-orders');
    return result;
  },
};
