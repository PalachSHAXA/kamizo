// Sprint 25: extracted from requestStore.ts. Pure stat / chart
// helpers that work on the requests + executors arrays. The store
// methods getStats / getExecutorStats / getChartData are now thin
// wrappers around these so the store file stays focused on actions.

import type { Request, ChartData } from '../types';

export interface ExecutorStats {
  totalRequests: number;
  completedRequests: number;
  avgRating: number;
  avgTime: number;
  thisWeek: number;
  thisMonth: number;
}

export function computeExecutorStats(requests: Request[], executorId: string): ExecutorStats {
  const executorRequests = requests.filter((r) => r.executorId === executorId);
  const completed = executorRequests.filter((r) => r.status === 'completed');
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const thisWeek = completed.filter((r) => r.approvedAt && new Date(r.approvedAt) >= weekAgo).length;
  const thisMonth = completed.filter((r) => r.approvedAt && new Date(r.approvedAt) >= monthAgo).length;

  const ratings = completed.filter((r) => r.rating).map((r) => r.rating!);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 5;

  const times = completed.filter((r) => r.workDuration).map((r) => r.workDuration!);
  const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : 0;

  return {
    totalRequests: executorRequests.length,
    completedRequests: completed.length,
    avgRating: Math.round(avgRating * 10) / 10,
    avgTime,
    thisWeek,
    thisMonth,
  };
}

export interface OverallStats {
  totalRequests: number;
  newRequests: number;
  inProgress: number;
  pendingApproval: number;
  completedToday: number;
  completedWeek: number;
  avgCompletionTime: number;
  executorsOnline: number;
  executorsTotal: number;
}

export function computeOverallStats(
  requests: Request[],
  executors: Array<{ status?: string }>,
): OverallStats {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const completedRequests = requests.filter((r) => r.status === 'completed' && r.approvedAt);
  const completedToday = completedRequests.filter((r) => new Date(r.approvedAt!) >= today).length;
  const completedWeek = completedRequests.filter((r) => new Date(r.approvedAt!) >= weekAgo).length;

  let totalTime = 0;
  let count = 0;
  completedRequests.forEach((r) => {
    if (r.workDuration) {
      totalTime += r.workDuration;
      count++;
    }
  });
  const avgCompletionTime = count > 0 ? Math.round(totalTime / count / 60) : 0;

  return {
    totalRequests: requests.length,
    newRequests: requests.filter((r) => r.status === 'new').length,
    inProgress: requests.filter((r) => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length,
    pendingApproval: requests.filter((r) => r.status === 'pending_approval').length,
    completedToday,
    completedWeek,
    avgCompletionTime,
    executorsOnline: executors.filter((e) => e.status !== 'offline').length,
    executorsTotal: executors.length,
  };
}

export function computeChartData(requests: Request[]): ChartData[] {
  const now = new Date();
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const chartData: ChartData[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const created = requests.filter((r) => {
      const createdAt = new Date(r.createdAt);
      return createdAt >= dayStart && createdAt < dayEnd;
    }).length;

    const completed = requests.filter((r) => {
      if (!r.approvedAt) return false;
      const approvedAt = new Date(r.approvedAt);
      return approvedAt >= dayStart && approvedAt < dayEnd;
    }).length;

    chartData.push({
      date: dayStart.toISOString(),
      name: days[date.getDay() === 0 ? 6 : date.getDay() - 1],
      created,
      completed,
    });
  }

  return chartData;
}
