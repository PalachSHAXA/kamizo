import { create } from 'zustand';
import { registerSessionStore } from './sessionRegistry';
import type { Executor, ExecutorSpecialization } from '../types';
import type { ExecutorDto } from '../services/api/executors';
import { executorsApi, authApi, usersApi } from '../services/api';

const executorSpecializations = new Set<string>([
  'plumber', 'electrician', 'elevator', 'intercom', 'cleaning', 'security',
  'trash', 'boiler', 'ac', 'courier', 'gardener', 'other',
]);

const isExecutorSpecialization = (value: string | undefined): value is ExecutorSpecialization =>
  value !== undefined && executorSpecializations.has(value);

const isExecutorStatus = (value: string | null | undefined): value is Executor['status'] =>
  value === 'available' || value === 'busy' || value === 'offline';

const mapExecutor = (executor: ExecutorDto): Executor => ({
  id: executor.id,
  name: executor.name,
  phone: executor.phone,
  login: executor.login,
  specialization: isExecutorSpecialization(executor.specialization) ? executor.specialization : 'other',
  status: isExecutorStatus(executor.status) ? executor.status : 'offline',
  rating: executor.rating || 5.0,
  completedCount: executor.completed_count || 0,
  activeRequests: executor.active_requests || 0,
  totalEarnings: executor.total_earnings || 0,
  avgCompletionTime: executor.avg_completion_time || 0,
  createdAt: executor.created_at || '',
});

interface ExecutorState {
  executors: Executor[];
  isLoadingExecutors: boolean;
  executorsError: string | null;

  fetchExecutors: (showAll?: boolean) => Promise<void>;
  addExecutor: (executor: Omit<Executor, 'id' | 'createdAt' | 'rating' | 'completedCount' | 'activeRequests' | 'status' | 'totalEarnings' | 'avgCompletionTime'> & { password: string; role?: string }) => Promise<Executor | null>;
  updateExecutor: (id: string, data: Partial<Executor>) => void;
  deleteExecutor: (id: string) => Promise<void>;
}

export const useExecutorStore = create<ExecutorState>()(
  (set, get) => ({
    executors: [],
    isLoadingExecutors: false,
    executorsError: null,

    fetchExecutors: async (showAll = false) => {
      set({ isLoadingExecutors: true, executorsError: null });
      try {
        const response = await executorsApi.getAll(showAll);
        const mappedExecutors = response.executors.map(mapExecutor);
        set({ executors: mappedExecutors, isLoadingExecutors: false, executorsError: null });
      } catch (err: unknown) {
        console.error('Failed to fetch executors:', err);
        set({ isLoadingExecutors: false, executorsError: err instanceof Error ? err.message : 'Failed to load executors' });
      }
    },

    addExecutor: async (executorData) => {
      try {
        // Call real API to register user
        const response = await authApi.register({
          login: executorData.login,
          password: executorData.password,
          name: executorData.name,
          role: executorData.role || 'executor',
          phone: executorData.phone,
          specialization: executorData.specialization,
        });

        if (response.user) {
          const newExecutor: Executor = {
            id: response.user.id,
            name: response.user.name,
            phone: response.user.phone || executorData.phone,
            login: response.user.login,
            specialization: isExecutorSpecialization(response.user.specialization)
              ? response.user.specialization
              : executorData.specialization,
            createdAt: new Date().toISOString(),
            rating: 5.0,
            completedCount: 0,
            activeRequests: 0,
            totalEarnings: 0,
            avgCompletionTime: 0,
            status: 'offline',
          };

          // Add locally first for immediate UI update
          set((state) => ({ executors: [...state.executors, newExecutor] }));

          // Then refetch from server to ensure sync
          get().fetchExecutors();

          return newExecutor;
        }
        return null;
      } catch (err: unknown) {
        console.error('Failed to add executor:', err);
        throw err; // Re-throw so UI can show error message
      }
    },

    updateExecutor: (id, data) => {
      set((state) => ({
        executors: state.executors.map((e) =>
          e.id === id ? { ...e, ...data } : e
        ),
      }));
    },

    deleteExecutor: async (id) => {
      try {
        await usersApi.delete(id);
        set((state) => ({
          executors: state.executors.filter((e) => e.id !== id),
        }));
      } catch (error) {
        console.error('Failed to delete executor:', error);
        throw error;
      }
    },
  })
);

registerSessionStore(useExecutorStore);
