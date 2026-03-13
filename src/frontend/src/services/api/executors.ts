// Executors API

import { apiRequest } from './client';

export const executorsApi = {
  getAll: async (showAll = false) => {
    const url = showAll ? '/api/executors?all=true' : '/api/executors';
    // No caching for executors - always fetch fresh data for accurate assignment
    return apiRequest<{ executors: any[] }>(url, { cache: 'no-store' });
  },

  // Get single executor by ID (for live data refresh with password)
  getById: async (executorId: string) => {
    // Always fetch fresh data, no caching
    return apiRequest<{ executor: any }>(`/api/executors/${executorId}`, { cache: 'no-store' });
  },

  updateStatus: async (executorId: string, status: 'available' | 'busy' | 'offline') => {
    return apiRequest<{ executor: any }>(`/api/executors/${executorId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Get executor stats (rating, completed count, weekly, avg time)
  getStats: async (executorId: string) => {
    return apiRequest<{
      stats: {
        totalCompleted: number;
        thisWeek: number;
        thisMonth: number;
        rating: number;
        avgCompletionTime: number;
        statusBreakdown: Array<{ status: string; count: number }>;
      }
    }>(`/api/executors/${executorId}/stats`);
  },
};
