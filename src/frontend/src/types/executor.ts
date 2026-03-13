import type { ExecutorSpecialization } from './common';

export interface Executor {
  id: string;
  name: string;
  phone: string;
  login: string;
  password?: string;
  specialization: ExecutorSpecialization;
  status: 'available' | 'busy' | 'offline';
  rating: number;
  completedCount: number;
  activeRequests: number;
  totalEarnings: number;
  avgCompletionTime: number;
  createdAt: string;
}
