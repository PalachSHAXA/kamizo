// Requests API, Reschedule API, Ratings API, UK Ratings API, Categories API, Stats API, Work Orders API

import { apiRequest, cachedGet, invalidateCache, CACHE_TTL } from './client';

// Requests API
export const requestsApi = {
  getAll: async (status?: string, category?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    const queryString = params.toString();
    // Use cached GET with short TTL (10s) - requests change frequently
    return cachedGet<{ requests: Record<string, unknown>[] }>(`/api/requests${queryString ? '?' + queryString : ''}`, CACHE_TTL.SHORT);
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
  }) => {
    const result = await apiRequest<{ request: Record<string, unknown> }>('/api/requests', {
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

  complete: async (requestId: string) => {
    invalidateCache('/api/requests');
    return apiRequest<{ success: boolean }>(`/api/requests/${requestId}/complete`, {
      method: 'POST',
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
    return apiRequest<{ reschedule: Record<string, unknown> }>(`/api/requests/${requestId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getReschedules: async (requestId: string) => {
    return apiRequest<{ reschedules: Record<string, unknown>[] }>(`/api/requests/${requestId}/reschedule`);
  },
};

// Reschedule API (for pending reschedules)
export const rescheduleApi = {
  // Get pending reschedules for current user
  getPending: async () => {
    return apiRequest<{ reschedules: Record<string, unknown>[] }>('/api/reschedule-requests');
  },

  // Respond to reschedule request.
  // Invalidates both the reschedule list and the requests cache because
  // accepted reschedules mutate the request's scheduled_at — leaving the
  // requests cache stale would show the old time for up to ~10s after
  // the resident accepts/rejects (audit P0 fix).
  respond: async (rescheduleId: string, accepted: boolean, responseNote?: string) => {
    const result = await apiRequest<{ reschedule: Record<string, unknown> }>(`/api/reschedule-requests/${rescheduleId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accepted, response_note: responseNote }),
    });
    invalidateCache('/api/reschedule-requests');
    invalidateCache('/api/requests');
    return result;
  },
};

// Ratings API
export const ratingsApi = {
  getForExecutor: async (executorId: string) => {
    return apiRequest<{ ratings: Record<string, unknown>[]; average: Record<string, unknown> }>(`/api/ratings?executor_id=${executorId}`);
  },

  create: async (rating: {
    executor_id: string;
    quality: number;
    speed: number;
    politeness: number;
    comment?: string;
  }) => {
    return apiRequest<{ rating: Record<string, unknown> }>('/api/ratings', {
      method: 'POST',
      body: JSON.stringify(rating),
    });
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
    return cachedGet<{ workOrders: Record<string, unknown>[] }>(`/api/work-orders${queryString ? '?' + queryString : ''}`, CACHE_TTL.SHORT);
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
