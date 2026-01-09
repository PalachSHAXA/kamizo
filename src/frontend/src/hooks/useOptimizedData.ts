import { useMemo } from 'react';
import type { Request, Executor, RequestStatus, ExecutorSpecialization } from '../types';

/**
 * Хук для мемоизации тяжелых вычислений над данными
 * Пересчитывает только при изменении зависимостей
 */

/**
 * Группировка requests по статусу (мемоизировано)
 */
export function useRequestsByStatus(requests: Request[]) {
  return useMemo(() => {
    const grouped: Record<string, Request[]> = {
      new: [],
      assigned: [],
      accepted: [],
      in_progress: [],
      completed: [],
      pending_approval: [],
      cancelled: [],
    };

    requests.forEach(req => {
      if (!grouped[req.status]) {
        grouped[req.status] = [];
      }
      grouped[req.status].push(req);
    });

    return grouped;
  }, [requests]);
}

/**
 * Фильтрация requests по нескольким критериям (мемоизировано)
 */
export function useFilteredRequests(
  requests: Request[],
  filters: {
    status?: RequestStatus;
    category?: string;
    search?: string;
    executorId?: string;
    residentId?: string;
  }
) {
  return useMemo(() => {
    let filtered = requests;

    if (filters.status) {
      filtered = filtered.filter(r => r.status === filters.status);
    }

    if (filters.category) {
      filtered = filtered.filter(r => r.category === filters.category);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(r =>
        r.title.toLowerCase().includes(search) ||
        r.description?.toLowerCase().includes(search) ||
        r.residentName.toLowerCase().includes(search) ||
        r.apartment?.toLowerCase().includes(search)
      );
    }

    if (filters.executorId) {
      filtered = filtered.filter(r => r.executorId === filters.executorId);
    }

    if (filters.residentId) {
      filtered = filtered.filter(r => r.residentId === filters.residentId);
    }

    return filtered;
  }, [requests, filters.status, filters.category, filters.search, filters.executorId, filters.residentId]);
}

/**
 * Сортировка requests (мемоизировано)
 */
export function useSortedRequests(
  requests: Request[],
  sortBy: 'date' | 'priority' | 'status' = 'date',
  sortOrder: 'asc' | 'desc' = 'desc'
) {
  return useMemo(() => {
    const sorted = [...requests];

    sorted.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'date') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'priority') {
        const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        comparison = (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0);
      } else if (sortBy === 'status') {
        comparison = a.status.localeCompare(b.status);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [requests, sortBy, sortOrder]);
}

/**
 * Подсчет статистики по requests (мемоизировано)
 */
export function useRequestsStats(requests: Request[]) {
  return useMemo(() => {
    const total = requests.length;
    const byStatus = requests.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byCategory = requests.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byPriority = requests.reduce((acc, r) => {
      acc[r.priority] = (acc[r.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Средняя длительность выполнения
    const completedRequests = requests.filter(r => r.completedAt && r.createdAt);
    const avgDuration = completedRequests.length > 0
      ? completedRequests.reduce((sum, r) => {
          const start = new Date(r.createdAt).getTime();
          const end = new Date(r.completedAt!).getTime();
          return sum + (end - start);
        }, 0) / completedRequests.length / (1000 * 60 * 60) // в часах
      : 0;

    return {
      total,
      byStatus,
      byCategory,
      byPriority,
      avgDuration: Math.round(avgDuration * 10) / 10, // округление до 1 знака
      completed: byStatus.completed || 0,
      inProgress: byStatus.in_progress || 0,
      pending: byStatus.new || 0,
    };
  }, [requests]);
}

/**
 * Группировка executors по специализации (мемоизировано)
 */
export function useExecutorsBySpecialization(executors: Executor[]) {
  return useMemo(() => {
    const grouped: Record<string, Executor[]> = {
      plumber: [],
      electrician: [],
      elevator: [],
      intercom: [],
      cleaning: [],
      security: [],
      carpenter: [],
      boiler: [],
      ac: [],
      other: [],
    };

    executors.forEach(exec => {
      if (exec.specialization) {
        if (!grouped[exec.specialization]) {
          grouped[exec.specialization] = [];
        }
        grouped[exec.specialization].push(exec);
      }
    });

    return grouped;
  }, [executors]);
}

/**
 * Доступные executors для назначения (мемоизировано)
 */
export function useAvailableExecutors(
  executors: Executor[],
  specialization?: ExecutorSpecialization
) {
  return useMemo(() => {
    let available = executors.filter(e => e.status === 'available' || e.status === 'busy');

    if (specialization) {
      available = available.filter(e => e.specialization === specialization);
    }

    // Сортируем: сначала available, потом busy
    available.sort((a, b) => {
      if (a.status === 'available' && b.status !== 'available') return -1;
      if (a.status !== 'available' && b.status === 'available') return 1;
      return 0;
    });

    return available;
  }, [executors, specialization]);
}

/**
 * Подсчет статистики по executors (мемоизировано)
 */
export function useExecutorsStats(executors: Executor[]) {
  return useMemo(() => {
    const total = executors.length;
    const available = executors.filter(e => e.status === 'available').length;
    const busy = executors.filter(e => e.status === 'busy').length;
    const offline = executors.filter(e => e.status === 'offline').length;

    const avgRating = executors.length > 0
      ? executors.reduce((sum, e) => sum + (e.rating || 0), 0) / executors.length
      : 0;

    const totalCompleted = executors.reduce((sum, e) => sum + (e.completedCount || 0), 0);

    return {
      total,
      available,
      busy,
      offline,
      avgRating: Math.round(avgRating * 10) / 10,
      totalCompleted,
    };
  }, [executors]);
}

/**
 * Данные для графиков (мемоизировано)
 */
export function useChartData(requests: Request[]) {
  return useMemo(() => {
    // Группировка по дням (последние 7 дней)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      date.setHours(0, 0, 0, 0);
      return date;
    });

    const dailyData = last7Days.map(date => {
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayRequests = requests.filter(r => {
        const createdDate = new Date(r.createdAt);
        return createdDate >= date && createdDate < nextDate;
      });

      return {
        date: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        new: dayRequests.filter(r => r.status === 'new').length,
        completed: dayRequests.filter(r => r.status === 'completed').length,
        total: dayRequests.length,
      };
    });

    // Данные для pie chart (по категориям)
    const categoryData = Object.entries(
      requests.reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      daily: dailyData,
      category: categoryData,
    };
  }, [requests]);
}
