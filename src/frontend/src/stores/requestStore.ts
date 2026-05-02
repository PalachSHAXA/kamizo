import { create } from 'zustand';
import type { Request, ChartData, CancelledBy, RescheduleRequest, RescheduleReason, RescheduleInitiator } from '../types';
import { useAuthStore } from './authStore';
import { useNotificationStore } from './notificationStore';
import { useActivityStore } from './activityStore';
import { useExecutorStore } from './executorStore';
import { requestsApi } from '../services/api';
import { useToastStore } from './toastStore';
import { pushNotifications } from '../services/pushNotifications';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface RequestState {
  requests: Request[];
  rescheduleRequests: RescheduleRequest[];
  isLoadingRequests: boolean;

  // API fetch
  fetchRequests: (status?: string, category?: string) => Promise<void>;

  // Request actions (API-backed)
  addRequest: (request: Omit<Request, 'id' | 'number' | 'createdAt' | 'status'>) => Promise<Request | null>;
  assignRequest: (requestId: string, executorId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  startWork: (requestId: string) => Promise<void>;
  pauseWork: (requestId: string, reason?: string) => Promise<void>;
  resumeWork: (requestId: string) => Promise<void>;
  completeWork: (requestId: string, workDuration: number) => Promise<void>;
  approveRequest: (requestId: string, rating: number, feedback?: string) => Promise<void>;
  rejectRequest: (requestId: string, reason: string) => Promise<void>;
  cancelRequest: (requestId: string, cancelledBy: CancelledBy, reason: string) => Promise<void>;
  declineRequest: (requestId: string, reason: string) => Promise<void>;
  getRequestsByResident: (residentId: string) => Request[];
  getRequestsByExecutor: (executorId: string) => Request[];

  // Stats
  getExecutorStats: (executorId: string) => {
    totalRequests: number;
    completedRequests: number;
    avgRating: number;
    avgTime: number;
    thisWeek: number;
    thisMonth: number;
  };
  getStats: () => {
    totalRequests: number;
    newRequests: number;
    inProgress: number;
    pendingApproval: number;
    completedToday: number;
    completedWeek: number;
    avgCompletionTime: number;
    executorsOnline: number;
    executorsTotal: number;
  };
  getChartData: () => ChartData[];

  // Reschedule actions
  fetchPendingReschedules: () => Promise<void>;
  createRescheduleRequest: (data: {
    requestId: string;
    proposedDate: string;
    proposedTime: string;
    reason: RescheduleReason;
    reasonText?: string;
  }) => Promise<RescheduleRequest | null>;
  respondToRescheduleRequest: (rescheduleId: string, accepted: boolean, responseNote?: string) => Promise<void>;
  getRescheduleRequestsByRequest: (requestId: string) => RescheduleRequest[];
  getPendingRescheduleForUser: (userId: string) => RescheduleRequest[];
  getActiveRescheduleForRequest: (requestId: string) => RescheduleRequest | undefined;
  getConfirmedRescheduleForRequest: (requestId: string) => RescheduleRequest | undefined;
}

export const useRequestStore = create<RequestState>()(
  (set, get) => ({
    requests: [],
    rescheduleRequests: [],
    isLoadingRequests: false,

    fetchRequests: async (status?: string, category?: string) => {
      set({ isLoadingRequests: true });
      try {
        const response = await requestsApi.getAll(status, category);
        // Map API response to Request type
        const requests = response.requests || [];
        const mappedRequests: Request[] = requests.map((r: Record<string, unknown>) => ({
          id: r.id,
          // Use prefixed request_number first, then number, then generate from id
          number: r.request_number || r.number || `#${r.id?.substring(0, 6).toUpperCase() || '000000'}`,
          title: r.title,
          description: r.description || '',
          category: r.category_id,
          status: r.status,
          priority: r.priority || 'medium',
          residentId: r.resident_id,
          residentName: r.resident_name || 'Неизвестный',
          residentPhone: r.resident_phone || '',
          address: r.address || '',
          apartment: r.apartment || '',
          executorId: r.executor_id,
          executorName: r.executor_name,
          executorPhone: r.executor_phone,
          accessInfo: r.access_info,
          scheduledDate: r.scheduled_at ? r.scheduled_at.split('T')[0] : undefined,
          scheduledTime: r.scheduled_at ? r.scheduled_at.split('T')[1]?.substring(0, 5) : undefined,
          createdAt: r.created_at,
          assignedAt: r.assigned_at,
          acceptedAt: r.accepted_at,
          startedAt: r.started_at,
          completedAt: r.completed_at,
          approvedAt: r.approved_at,
          rating: r.rating,
          feedback: r.feedback,
          workDuration: r.work_duration,
          buildingId: r.building_id,
          buildingName: r.building_name,
          photos: (() => {
            // photos column is TEXT (JSON-encoded array of data-URLs).
            // Tolerate both string and already-parsed array.
            if (!r.photos) return undefined;
            if (Array.isArray(r.photos)) return r.photos;
            try { return JSON.parse(r.photos); } catch { return undefined; }
          })(),
          // Pause fields from DB
          isPaused: r.is_paused === 1 || r.is_paused === true,
          pausedAt: r.paused_at,
          pauseReason: r.pause_reason,
          totalPausedTime: r.total_paused_time || 0,
        } as Request));

        // Keep pending/optimistic requests (temp-*) that are still being created
        // but only if they're less than 60 seconds old (prevents memory leak from stuck temps)
        set((state) => {
          const now = Date.now();
          const pendingRequests = state.requests.filter(r => {
            if (!r.id.startsWith('temp-')) return false;
            // Clean up temp requests older than 60s
            const createdTime = new Date(r.createdAt).getTime();
            return (now - createdTime) < 60000;
          });
          const pendingIds = new Set(pendingRequests.map(p => p.id));
          const mergedRequests = [
            ...pendingRequests,
            ...mappedRequests.filter(apiReq => !pendingIds.has(apiReq.id))
          ];
          return { requests: mergedRequests, isLoadingRequests: false };
        });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        set({ isLoadingRequests: false });
      }
    },

    addRequest: async (requestData) => {
      // Generate temp ID and number for optimistic update
      const tempId = `temp-${generateId()}`;
      const tempNumber = `#${tempId.substring(5, 11).toUpperCase()}`;
      const now = new Date().toISOString();

      // Create optimistic request immediately
      const optimisticRequest: Request = {
        id: tempId,
        number: tempNumber,
        title: requestData.title,
        description: requestData.description || '',
        category: requestData.category,
        status: 'new',
        priority: requestData.priority || 'medium',
        residentId: requestData.residentId,
        residentName: requestData.residentName,
        residentPhone: requestData.residentPhone,
        address: requestData.address,
        apartment: requestData.apartment,
        accessInfo: requestData.accessInfo,
        scheduledDate: requestData.scheduledDate,
        scheduledTime: requestData.scheduledTime,
        photos: requestData.photos,
        createdAt: now,
      };

      // Add to UI immediately (optimistic)
      set((state) => ({ requests: [optimisticRequest, ...state.requests] }));

      // Add notification for managers immediately
      useNotificationStore.getState().addNotification({
        userId: 'manager',
        type: 'request_created',
        title: 'Новая заявка',
        message: `Заявка ${tempNumber}: ${requestData.title}`,
        requestId: tempId,
      });

      try {
        // Call API in background
        const response = await requestsApi.create({
          category_id: requestData.category,
          title: requestData.title,
          description: requestData.description,
          priority: requestData.priority,
          access_info: requestData.accessInfo,
          scheduled_at: requestData.scheduledDate && requestData.scheduledTime
            ? `${requestData.scheduledDate}T${requestData.scheduledTime}:00`
            : undefined,
          // For manual creation by managers - pass the resident_id
          resident_id: requestData.residentId,
          photos: requestData.photos,
        });

        // Replace temp with real data
        const apiRequest = response.request;
        if (!apiRequest) {
          // API succeeded but returned no data — keep the optimistic request
          return null;
        }
        const realRequest: Request = {
          id: apiRequest.id,
          number: apiRequest.request_number || apiRequest.number,
          title: apiRequest.title,
          description: apiRequest.description,
          category: apiRequest.category_id,
          status: apiRequest.status,
          priority: apiRequest.priority || 'medium',
          residentId: apiRequest.resident_id,
          residentName: apiRequest.resident_name,
          residentPhone: apiRequest.resident_phone,
          address: apiRequest.address,
          apartment: apiRequest.apartment,
          createdAt: apiRequest.created_at,
        };

        // Replace optimistic with real
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === tempId ? realRequest : r
          ),
        }));

        // Add activity log
        useActivityStore.getState().addActivityLog({
          userId: requestData.residentId,
          userName: requestData.residentName,
          userRole: 'resident',
          action: 'Создал заявку',
          details: `Заявка #${realRequest.number}: ${realRequest.title}`,
          requestId: realRequest.id,
        });

        return realRequest;
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        // Rollback on error
        set((state) => ({
          requests: state.requests.filter((r) => r.id !== tempId),
        }));
        return null;
      }
    },

    assignRequest: async (requestId, executorId) => {
      const state = get();
      const executorState = useExecutorStore.getState();
      const executor = executorState.executors.find(e => e.id === executorId);
      const request = state.requests.find(r => r.id === requestId);

      if (!request) {
        useToastStore.getState().addToast('error', 'Заявка не найдена');
        return;
      }

      const { user } = useAuthStore.getState();
      const isSelfAssign = user?.role === 'executor' && user?.id === executorId;
      const executorName = executor?.name || 'Исполнитель';
      const executorPhone = executor?.phone || '';

      // Save original state for rollback
      const originalRequest = { ...request };
      const originalExecutor = executor ? { ...executor } : null;

      // OPTIMISTIC UPDATE - immediately update UI
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: 'assigned' as const,
                executorId,
                executorName,
                executorPhone,
                executorRating: executor?.rating || 5.0,
                assignedAt: new Date().toISOString(),
              }
            : r
        ),
      }));

      // Update executor state
      useExecutorStore.setState((state) => ({
        executors: state.executors.map((e) =>
          e.id === executorId
            ? { ...e, status: 'busy' as const, activeRequests: (e.activeRequests || 0) + 1 }
            : e
        ),
      }));

      // Send notifications immediately
      if (isSelfAssign) {
        // Management notification is handled server-side via WebSocket broadcast
        useActivityStore.getState().addActivityLog({
          userId: executorId,
          userName: executorName,
          userRole: 'executor',
          action: 'Взял заявку',
          details: `Заявка #${request.number}: ${request.title}`,
          requestId,
        });
      } else {
        useNotificationStore.getState().addNotification({
          userId: executorId,
          type: 'request_assigned',
          title: 'Новая заявка назначена',
          message: `Вам назначена заявка #${request.number}: ${request.title}`,
          requestId,
        });
        useActivityStore.getState().addActivityLog({
          userId: user?.id || 'system',
          userName: user?.name || 'Система',
          userRole: user?.role || 'manager',
          action: 'Назначил исполнителя',
          details: `Заявка #${request.number} назначена ${executorName}`,
          requestId,
        });
      }

      try {
        // Call API in background
        await requestsApi.assign(requestId, executorId);
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        // Rollback on error
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId ? originalRequest : r
          ),
        }));
        if (originalExecutor) {
          useExecutorStore.setState((state) => ({
            executors: state.executors.map((e) =>
              e.id === executorId ? originalExecutor : e
            ),
          }));
        }
      }
    },

    acceptRequest: async (requestId) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request) return;

      // Save original for rollback
      const originalRequest = { ...request };

      // OPTIMISTIC UPDATE - immediately update UI
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId
            ? { ...r, status: 'accepted' as const, acceptedAt: new Date().toISOString() }
            : r
        ),
      }));

      // Send notifications immediately
      useNotificationStore.getState().addNotification({
        userId: request.residentId,
        type: 'request_accepted',
        title: 'Заявка принята',
        message: `Исполнитель ${request.executorName} принял вашу заявку #${request.number}`,
        requestId,
      });
      useNotificationStore.getState().addNotification({
        userId: 'manager',
        type: 'request_accepted',
        title: 'Заявка принята исполнителем',
        message: `${request.executorName} принял заявку #${request.number}`,
        requestId,
      });
      useActivityStore.getState().addActivityLog({
        userId: request.executorId!,
        userName: request.executorName!,
        userRole: 'executor',
        action: 'Принял заявку',
        details: `Заявка #${request.number}`,
        requestId,
      });

      try {
        // Call API in background
        await requestsApi.accept(requestId);
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        // Rollback on error
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId ? originalRequest : r
          ),
        }));
      }
    },

    startWork: async (requestId) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request) return;

      // Check if executor already has a task in progress
      const executorId = request.executorId;
      if (executorId) {
        const hasActiveWork = state.requests.some(
          r => r.executorId === executorId && r.status === 'in_progress' && r.id !== requestId
        );
        if (hasActiveWork) {
          useToastStore.getState().addToast('warning', 'У исполнителя уже есть задача в работе');
          return;
        }
      }

      // Save original for rollback
      const originalRequest = { ...request };

      // OPTIMISTIC UPDATE - immediately update UI
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId
            ? { ...r, status: 'in_progress' as const, startedAt: new Date().toISOString() }
            : r
        ),
      }));

      // Send notifications immediately
      useNotificationStore.getState().addNotification({
        userId: request.residentId,
        type: 'request_started',
        title: 'Работа начата',
        message: `Исполнитель ${request.executorName} начал работу по заявке #${request.number}`,
        requestId,
      });
      useActivityStore.getState().addActivityLog({
        userId: request.executorId!,
        userName: request.executorName!,
        userRole: 'executor',
        action: 'Начал работу',
        details: `Заявка #${request.number}`,
        requestId,
      });

      try {
        // Call API in background
        await requestsApi.start(requestId);
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        // Rollback on error
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId ? originalRequest : r
          ),
        }));
      }
    },

    pauseWork: async (requestId, reason?) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request || request.status !== 'in_progress' || request.isPaused) return;

      try {
        // Call API to pause work in D1 database
        await requestsApi.pause(requestId, reason);

        // Update local state
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? { ...r, isPaused: true, pausedAt: new Date().toISOString(), pauseReason: reason }
              : r
          ),
        }));

        // Activity log
        useActivityStore.getState().addActivityLog({
          userId: request.executorId!,
          userName: request.executorName!,
          userRole: 'executor',
          action: 'Приостановил работу',
          details: `Заявка #${request.number}`,
          requestId,
        });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    resumeWork: async (requestId) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request || request.status !== 'in_progress' || !request.isPaused) return;

      try {
        // Call API to resume work in D1 database
        const result = await requestsApi.resume(requestId);

        // Use totalPausedTime from server response for accuracy
        const totalPausedTime = result.totalPausedTime || (request.totalPausedTime || 0);

        // Update local state
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? { ...r, isPaused: false, pausedAt: undefined, totalPausedTime }
              : r
          ),
        }));

        // Activity log
        useActivityStore.getState().addActivityLog({
          userId: request.executorId!,
          userName: request.executorName!,
          userRole: 'executor',
          action: 'Возобновил работу',
          details: `Заявка #${request.number}`,
          requestId,
        });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    completeWork: async (requestId, workDuration) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request) return;

      const wasRejected = !!request.rejectionReason;

      try {
        // Call API to complete work in D1 database
        await requestsApi.complete(requestId);

        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'pending_approval' as const,
                  completedAt: new Date().toISOString(),
                  workDuration,
                  // Clear pause and rejection info when work is completed
                  isPaused: undefined,
                  pausedAt: undefined,
                  rejectedAt: undefined,
                  rejectionReason: undefined,
                }
              : r
          ),
        }));

        // Different message if this is a re-submission after rejection
        const notifyMessage = wasRejected
          ? `Исполнитель переделал работу по заявке #${request.number}. Пожалуйста, проверьте и подтвердите.`
          : `Исполнитель завершил работу по заявке #${request.number}. Пожалуйста, подтвердите выполнение.`;

        useNotificationStore.getState().addNotification({
          userId: request.residentId,
          type: 'request_completed',
          title: wasRejected ? 'Работа переделана' : 'Работа завершена',
          message: notifyMessage,
          requestId,
        });

        // Push-уведомление для жителя (важное - требует подтверждения)
        const { user } = useAuthStore.getState();
        if (user?.id === request.residentId) {
          // Если житель сейчас онлайн - показать push
          pushNotifications.notifyRequestCompleted(
            request.number,
            request.executorName || 'Исполнитель',
            requestId
          );
        }

        useNotificationStore.getState().addNotification({
          userId: 'manager',
          type: 'request_completed',
          title: 'Работа завершена',
          message: `${request.executorName} завершил заявку #${request.number}. Ожидается подтверждение жителя.`,
          requestId,
        });

        useActivityStore.getState().addActivityLog({
          userId: request.executorId!,
          userName: request.executorName!,
          userRole: 'executor',
          action: 'Завершил работу',
          details: `Заявка #${request.number}, время работы: ${Math.round(workDuration / 60)} мин`,
          requestId,
        });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    approveRequest: async (requestId, rating, feedback) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request) return;

      try {
        // Call API to approve request in D1 database
        await requestsApi.approve(requestId, rating, feedback);

        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'completed' as const,
                  approvedAt: new Date().toISOString(),
                  rating,
                  feedback,
                }
              : r
          ),
        }));

        // Update executor stats (local)
        if (request.executorId) {
          const executorState = useExecutorStore.getState();
          const executor = executorState.executors.find(e => e.id === request.executorId);
          if (executor) {
            const completedRequests = state.requests.filter(
              r => r.executorId === request.executorId && r.status === 'completed'
            );
            const ratings = [...completedRequests.map(r => r.rating || 5), rating];
            const newRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

            useExecutorStore.setState((state) => ({
              executors: state.executors.map((e) =>
                e.id === request.executorId
                  ? {
                      ...e,
                      completedCount: e.completedCount + 1,
                      rating: Math.round(newRating * 10) / 10,
                      totalEarnings: e.totalEarnings + 100000,
                    }
                  : e
              ),
            }));
          }
        }

        useNotificationStore.getState().addNotification({
          userId: request.executorId!,
          type: 'request_approved',
          title: 'Работа подтверждена',
          message: `Заявка #${request.number} подтверждена. Оценка: ${rating}/5`,
          requestId,
        });

        useActivityStore.getState().addActivityLog({
          userId: request.residentId,
          userName: request.residentName,
          userRole: 'resident',
          action: 'Подтвердил выполнение',
          details: `Заявка #${request.number}, оценка: ${rating}/5`,
          requestId,
        });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    rejectRequest: async (requestId, reason) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request) return;

      try {
        // Call API to reject request in D1 database
        await requestsApi.reject(requestId, reason);

        const newRejectionCount = (request.rejectionCount || 0) + 1;

        // Return to in_progress status but keep rejection info visible
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'in_progress' as const,
                  completedAt: undefined,
                  workDuration: undefined,
                  rejectedAt: new Date().toISOString(),
                  rejectionReason: reason,
                  rejectionCount: newRejectionCount,
                }
              : r
          ),
        }));

        // Activity log
        useActivityStore.getState().addActivityLog({
          userId: request.residentId,
          userName: request.residentName,
          userRole: 'resident',
          action: 'Отклонил выполнение',
          details: `Заявка #${request.number}, причина: ${reason}`,
          requestId,
        });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    cancelRequest: async (requestId, cancelledBy, reason) => {
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request) return;

      const { user } = useAuthStore.getState();
      const cancellerName = user?.name || 'Система';

      // Check if cancellation is allowed
      const canResidentCancel = ['new', 'assigned', 'accepted'].includes(request.status);
      const canManagerCancel = request.status !== 'completed';

      if (cancelledBy === 'resident' && !canResidentCancel) {
        useToastStore.getState().addToast('warning', 'Невозможно отменить заявку в этом статусе');
        return;
      }

      if ((cancelledBy === 'manager' || cancelledBy === 'admin') && !canManagerCancel) {
        useToastStore.getState().addToast('warning', 'Нельзя отменить завершённую заявку');
        return;
      }

      const previousExecutorId = request.executorId;

      // Call API to persist cancellation
      try {
        await requestsApi.cancel(requestId, reason);
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        // Continue with local update even if API fails
      }

      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: 'cancelled' as const,
                cancelledAt: new Date().toISOString(),
                cancelledBy,
                cancellationReason: reason,
              }
            : r
        ),
      }));

      // Update executor's active request count if there was one
      if (previousExecutorId) {
        const activeCount = state.requests.filter(
          r => r.executorId === previousExecutorId && ['assigned', 'accepted', 'in_progress'].includes(r.status) && r.id !== requestId
        ).length;

        useExecutorStore.setState((state) => ({
          executors: state.executors.map((e) =>
            e.id === previousExecutorId
              ? { ...e, activeRequests: activeCount, status: activeCount > 0 ? 'busy' : 'available' }
              : e
          ),
        }));
      }

      // Notifications based on who cancelled
      const cancellerLabels: Record<CancelledBy, string> = {
        resident: 'Житель',
        executor: 'Исполнитель',
        manager: 'Менеджер',
        admin: 'Администратор',
      };

      // Notify resident (if not cancelled by resident)
      if (cancelledBy !== 'resident') {
        useNotificationStore.getState().addNotification({
          userId: request.residentId,
          type: 'request_cancelled',
          title: 'Заявка отменена',
          message: `Заявка #${request.number} была отменена. Причина: ${reason}`,
          requestId,
        });
      }

      // Notify executor (if assigned and not cancelled by executor)
      if (previousExecutorId && cancelledBy !== 'executor') {
        useNotificationStore.getState().addNotification({
          userId: previousExecutorId,
          type: 'request_cancelled',
          title: 'Заявка отменена',
          message: `Заявка #${request.number} была отменена ${cancellerLabels[cancelledBy]}. Причина: ${reason}`,
          requestId,
        });
      }

      // Activity log
      useActivityStore.getState().addActivityLog({
        userId: user?.id || 'system',
        userName: cancellerName,
        userRole: cancelledBy,
        action: 'Отменил заявку',
        details: `Заявка #${request.number}: ${reason}`,
        requestId,
      });
    },

    declineRequest: async (requestId, reason) => {
      // Executor declines/releases an assigned request - returns it to 'new' status
      const state = get();
      const request = state.requests.find(r => r.id === requestId);
      if (!request) return;

      // Can decline if assigned, accepted, or in_progress (for illness, etc.)
      if (!['assigned', 'accepted', 'in_progress'].includes(request.status)) {
        useToastStore.getState().addToast('warning', 'Невозможно отклонить заявку в этом статусе');
        return;
      }

      const previousExecutorId = request.executorId;
      const executorName = request.executorName;

      // Save original state for rollback
      const originalRequest = { ...request };

      // OPTIMISTIC UPDATE - immediately update UI
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: 'new' as const,
                executorId: undefined,
                executorName: undefined,
                executorPhone: undefined,
                executorRating: undefined,
                assignedAt: undefined,
                acceptedAt: undefined,
                startedAt: undefined,
              }
            : r
        ),
      }));

      // Update executor's active request count
      if (previousExecutorId) {
        const activeCount = state.requests.filter(
          r => r.executorId === previousExecutorId && ['assigned', 'accepted', 'in_progress'].includes(r.status) && r.id !== requestId
        ).length;

        useExecutorStore.setState((state) => ({
          executors: state.executors.map((e) =>
            e.id === previousExecutorId
              ? { ...e, activeRequests: activeCount, status: activeCount > 0 ? 'busy' : 'available' }
              : e
          ),
        }));
      }

      // Notify resident (local notification)
      useNotificationStore.getState().addNotification({
        userId: request.residentId,
        type: 'request_declined',
        title: 'Исполнитель отказался',
        message: `Исполнитель ${executorName} отказался от заявки #${request.number}. Заявка возвращена в очередь.`,
        requestId,
      });

      // Activity log
      useActivityStore.getState().addActivityLog({
        userId: previousExecutorId || 'system',
        userName: executorName || 'Исполнитель',
        userRole: 'executor',
        action: 'Отказался от заявки',
        details: `Заявка #${request.number}: ${reason}`,
        requestId,
      });

      try {
        // Call API to persist the change
        await requestsApi.decline(requestId, reason);
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        // Rollback on error
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId ? originalRequest : r
          ),
        }));
        // Re-throw to notify caller
        throw error;
      }
    },

    getRequestsByResident: (residentId) => {
      return get().requests.filter(r => r.residentId === residentId);
    },

    getRequestsByExecutor: (executorId) => {
      return get().requests.filter(r => r.executorId === executorId);
    },

    getExecutorStats: (executorId) => {
      const { requests } = get();
      const executorRequests = requests.filter(r => r.executorId === executorId);
      const completed = executorRequests.filter(r => r.status === 'completed');
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const thisWeek = completed.filter(r => r.approvedAt && new Date(r.approvedAt) >= weekAgo).length;
      const thisMonth = completed.filter(r => r.approvedAt && new Date(r.approvedAt) >= monthAgo).length;

      const ratings = completed.filter(r => r.rating).map(r => r.rating!);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 5;

      const times = completed.filter(r => r.workDuration).map(r => r.workDuration!);
      const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : 0;

      return {
        totalRequests: executorRequests.length,
        completedRequests: completed.length,
        avgRating: Math.round(avgRating * 10) / 10,
        avgTime,
        thisWeek,
        thisMonth,
      };
    },

    getStats: () => {
      const { requests } = get();
      const executors = useExecutorStore.getState().executors;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const completedRequests = requests.filter(r => r.status === 'completed' && r.approvedAt);
      const completedToday = completedRequests.filter(r =>
        new Date(r.approvedAt!) >= today
      ).length;
      const completedWeek = completedRequests.filter(r =>
        new Date(r.approvedAt!) >= weekAgo
      ).length;

      let totalTime = 0;
      let count = 0;
      completedRequests.forEach(r => {
        if (r.workDuration) {
          totalTime += r.workDuration;
          count++;
        }
      });
      const avgCompletionTime = count > 0 ? Math.round(totalTime / count / 60) : 0;

      return {
        totalRequests: requests.length,
        newRequests: requests.filter(r => r.status === 'new').length,
        inProgress: requests.filter(r => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length,
        pendingApproval: requests.filter(r => r.status === 'pending_approval').length,
        completedToday,
        completedWeek,
        avgCompletionTime,
        executorsOnline: executors.filter(e => e.status !== 'offline').length,
        executorsTotal: executors.length,
      };
    },

    getChartData: () => {
      const { requests } = get();
      const now = new Date();
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const chartData: ChartData[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const created = requests.filter(r => {
          const createdAt = new Date(r.createdAt);
          return createdAt >= dayStart && createdAt < dayEnd;
        }).length;

        const completed = requests.filter(r => {
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
    },

    // Reschedule actions - using API for cross-user sync
    fetchPendingReschedules: async () => {
      try {
        const { rescheduleApi } = await import('../services/api');
        const response = await rescheduleApi.getPending();
        const reschedules = response.reschedules || [];

        // Map API response to RescheduleRequest type
        const mappedReschedules: RescheduleRequest[] = reschedules.map((r: Record<string, unknown>) => ({
          id: r.id,
          requestId: r.request_id,
          requestNumber: r.request_number || r.request_title || `#${r.request_id?.substring(0, 6)}`,
          initiator: r.initiator as RescheduleInitiator,
          initiatorId: r.initiator_id,
          initiatorName: r.initiator_name,
          recipientId: r.recipient_id,
          recipientName: r.recipient_name,
          recipientRole: r.recipient_role as 'resident' | 'executor',
          currentDate: r.current_date,
          currentTime: r.current_time,
          proposedDate: r.proposed_date,
          proposedTime: r.proposed_time,
          reason: r.reason as RescheduleReason,
          reasonText: r.reason_text,
          status: r.status as 'pending' | 'accepted' | 'rejected' | 'expired',
          responseNote: r.response_note,
          createdAt: r.created_at,
          respondedAt: r.responded_at,
          expiresAt: r.expires_at,
        } as RescheduleRequest));

        set({ rescheduleRequests: mappedReschedules });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    createRescheduleRequest: async (data) => {
      const state = get();
      const request = state.requests.find(r => r.id === data.requestId);
      if (!request) return null;

      const { user } = useAuthStore.getState();
      if (!user) return null;

      try {
        const { requestsApi } = await import('../services/api');
        const response = await requestsApi.createReschedule(data.requestId, {
          proposed_date: data.proposedDate,
          proposed_time: data.proposedTime,
          reason: data.reason,
          reason_text: data.reasonText,
        });

        if (response.reschedule) {
          const r = response.reschedule;
          const newReschedule: RescheduleRequest = {
            id: r.id,
            requestId: r.request_id,
            requestNumber: request.number,
            initiator: r.initiator as RescheduleInitiator,
            initiatorId: r.initiator_id,
            initiatorName: r.initiator_name,
            recipientId: r.recipient_id,
            recipientName: r.recipient_name,
            recipientRole: r.recipient_role as 'resident' | 'executor',
            currentDate: r.current_date,
            currentTime: r.current_time,
            proposedDate: r.proposed_date,
            proposedTime: r.proposed_time,
            reason: r.reason as RescheduleReason,
            reasonText: r.reason_text,
            status: 'pending',
            createdAt: r.created_at,
            expiresAt: r.expires_at,
          };

          set((state) => ({
            rescheduleRequests: [newReschedule, ...state.rescheduleRequests],
          }));

          return newReschedule;
        }
        return null;
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        return null;
      }
    },

    respondToRescheduleRequest: async (rescheduleId, accepted, responseNote) => {
      const state = get();
      const reschedule = state.rescheduleRequests.find(r => r.id === rescheduleId);
      if (!reschedule || reschedule.status !== 'pending') return;

      try {
        const { rescheduleApi } = await import('../services/api');
        const response = await rescheduleApi.respond(rescheduleId, accepted, responseNote);

        if (response.reschedule) {
          // Update local state
          set((state) => ({
            rescheduleRequests: state.rescheduleRequests.map((r) =>
              r.id === rescheduleId
                ? {
                    ...r,
                    status: accepted ? 'accepted' as const : 'rejected' as const,
                    respondedAt: new Date().toISOString(),
                    responseNote,
                  }
                : r
            ),
          }));

          // If accepted, update the request's scheduled date/time
          if (accepted) {
            set((state) => ({
              requests: state.requests.map((r) =>
                r.id === reschedule.requestId
                  ? {
                      ...r,
                      scheduledDate: reschedule.proposedDate,
                      scheduledTime: reschedule.proposedTime,
                    }
                  : r
              ),
            }));
          }

          // Refresh requests after EITHER accept or reject. Audit P2 fix:
          // previously we only re-fetched on accept; rejecting left the
          // resident's UI showing the original request state with a stale
          // pending-reschedule banner until the next manual sync.
          get().fetchRequests();
        }
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    getRescheduleRequestsByRequest: (requestId) => {
      return get().rescheduleRequests.filter(r => r.requestId === requestId);
    },

    getPendingRescheduleForUser: (userId) => {
      return get().rescheduleRequests.filter(
        r => r.recipientId === userId && r.status === 'pending'
      );
    },

    getActiveRescheduleForRequest: (requestId) => {
      return get().rescheduleRequests.find(
        r => r.requestId === requestId && r.status === 'pending'
      );
    },

    getConfirmedRescheduleForRequest: (requestId) => {
      // Find recently accepted reschedule (within last 24 hours)
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return get().rescheduleRequests.find(
        r => r.requestId === requestId &&
             r.status === 'accepted' &&
             r.respondedAt &&
             new Date(r.respondedAt).getTime() > oneDayAgo
      );
    },
  })
);
