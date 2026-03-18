import { create } from 'zustand';
import type { Executor } from '../types';
import { executorsApi, authApi, usersApi } from '../services/api';

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
        const mappedExecutors: Executor[] = response.executors.map((e: Record<string, unknown>) => ({
          id: e.id,
          name: e.name,
          phone: e.phone,
          login: e.login,
          specialization: e.specialization,
          status: e.status || 'offline',
          rating: e.rating || 5.0,
          completedCount: e.completed_count || 0,
          activeRequests: e.active_requests || 0,
          totalEarnings: e.total_earnings || 0,
          avgCompletionTime: e.avg_completion_time || 0,
          createdAt: e.created_at,
        }));
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
            specialization: response.user.specialization || executorData.specialization,
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
