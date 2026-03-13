// Barrel re-export from split stores for backward compatibility.
// All business logic has been moved to focused store files.
// Existing code that imports `useDataStore` continues to work unchanged.

import { useRequestStore } from './requestStore';
import { useExecutorStore } from './executorStore';
import { useVehicleStore } from './vehicleStore';
import { useGuestAccessStore } from './guestAccessStore';
import { useAnnouncementStore } from './announcementStore';
import { useRentalStore } from './rentalStore';
import { useNotificationStore } from './notificationStore';
import { useActivityStore } from './activityStore';
import { useSettingsStore } from './settingsStore';

// Re-export individual stores for new code that wants to use focused stores
export { useRequestStore } from './requestStore';
export { useExecutorStore } from './executorStore';
export { useVehicleStore } from './vehicleStore';
export { useGuestAccessStore } from './guestAccessStore';
export { useAnnouncementStore } from './announcementStore';
export { useRentalStore } from './rentalStore';
export { useNotificationStore } from './notificationStore';
export { useActivityStore } from './activityStore';
export { useSettingsStore } from './settingsStore';

/**
 * Combined store hook for backward compatibility.
 * Returns a merged object from all sub-stores so existing destructuring
 * like `const { requests, executors, addRequest, fetchVehicles } = useDataStore()`
 * continues to work without any changes.
 *
 * NOTE: This hook subscribes to ALL sub-stores. For better performance in new code,
 * prefer importing the focused store directly (e.g., `useRequestStore`).
 */
export function useDataStore() {
  const requestState = useRequestStore();
  const executorState = useExecutorStore();
  const vehicleState = useVehicleStore();
  const guestAccessState = useGuestAccessStore();
  const announcementState = useAnnouncementStore();
  const rentalState = useRentalStore();
  const notificationState = useNotificationStore();
  const activityState = useActivityStore();
  const settingsState = useSettingsStore();

  return {
    // Request state & actions
    requests: requestState.requests,
    isLoadingRequests: requestState.isLoadingRequests,
    rescheduleRequests: requestState.rescheduleRequests,
    fetchRequests: requestState.fetchRequests,
    addRequest: requestState.addRequest,
    assignRequest: requestState.assignRequest,
    acceptRequest: requestState.acceptRequest,
    startWork: requestState.startWork,
    pauseWork: requestState.pauseWork,
    resumeWork: requestState.resumeWork,
    completeWork: requestState.completeWork,
    approveRequest: requestState.approveRequest,
    rejectRequest: requestState.rejectRequest,
    cancelRequest: requestState.cancelRequest,
    declineRequest: requestState.declineRequest,
    getRequestsByResident: requestState.getRequestsByResident,
    getRequestsByExecutor: requestState.getRequestsByExecutor,
    getExecutorStats: requestState.getExecutorStats,
    getStats: requestState.getStats,
    getChartData: requestState.getChartData,
    fetchPendingReschedules: requestState.fetchPendingReschedules,
    createRescheduleRequest: requestState.createRescheduleRequest,
    respondToRescheduleRequest: requestState.respondToRescheduleRequest,
    getRescheduleRequestsByRequest: requestState.getRescheduleRequestsByRequest,
    getPendingRescheduleForUser: requestState.getPendingRescheduleForUser,
    getActiveRescheduleForRequest: requestState.getActiveRescheduleForRequest,
    getConfirmedRescheduleForRequest: requestState.getConfirmedRescheduleForRequest,

    // Executor state & actions
    executors: executorState.executors,
    isLoadingExecutors: executorState.isLoadingExecutors,
    executorsError: executorState.executorsError,
    fetchExecutors: executorState.fetchExecutors,
    addExecutor: executorState.addExecutor,
    updateExecutor: executorState.updateExecutor,
    deleteExecutor: executorState.deleteExecutor,

    // Vehicle state & actions
    vehicles: vehicleState.vehicles,
    isLoadingVehicles: vehicleState.isLoadingVehicles,
    fetchVehicles: vehicleState.fetchVehicles,
    addVehicle: vehicleState.addVehicle,
    updateVehicle: vehicleState.updateVehicle,
    deleteVehicle: vehicleState.deleteVehicle,
    getVehiclesByOwner: vehicleState.getVehiclesByOwner,
    searchVehicleByPlate: vehicleState.searchVehicleByPlate,
    searchVehiclesByPlate: vehicleState.searchVehiclesByPlate,

    // Guest access state & actions
    guestAccessCodes: guestAccessState.guestAccessCodes,
    guestAccessLogs: guestAccessState.guestAccessLogs,
    isLoadingGuestCodes: guestAccessState.isLoadingGuestCodes,
    fetchGuestCodes: guestAccessState.fetchGuestCodes,
    createGuestAccessCode: guestAccessState.createGuestAccessCode,
    revokeGuestAccessCode: guestAccessState.revokeGuestAccessCode,
    useGuestAccessCode: guestAccessState.useGuestAccessCode,
    validateGuestAccessCode: guestAccessState.validateGuestAccessCode,
    getGuestAccessCodesByResident: guestAccessState.getGuestAccessCodesByResident,
    getAllGuestAccessCodes: guestAccessState.getAllGuestAccessCodes,
    addGuestAccessLog: guestAccessState.addGuestAccessLog,
    getGuestAccessLogs: guestAccessState.getGuestAccessLogs,
    getGuestAccessStats: guestAccessState.getGuestAccessStats,

    // Announcement state & actions
    announcements: announcementState.announcements,
    addAnnouncement: announcementState.addAnnouncement,
    updateAnnouncement: announcementState.updateAnnouncement,
    deleteAnnouncement: announcementState.deleteAnnouncement,
    markAnnouncementAsViewed: announcementState.markAnnouncementAsViewed,
    getAnnouncementsForResidents: announcementState.getAnnouncementsForResidents,
    getAnnouncementsForEmployees: announcementState.getAnnouncementsForEmployees,
    getAnnouncementsByAuthor: announcementState.getAnnouncementsByAuthor,
    fetchAnnouncements: announcementState.fetchAnnouncements,

    // Rental state & actions
    rentalApartments: rentalState.rentalApartments,
    rentalRecords: rentalState.rentalRecords,
    fetchRentals: rentalState.fetchRentals,
    fetchMyRentals: rentalState.fetchMyRentals,
    addRentalApartment: rentalState.addRentalApartment,
    updateRentalApartment: rentalState.updateRentalApartment,
    deleteRentalApartment: rentalState.deleteRentalApartment,
    getRentalApartmentsByOwner: rentalState.getRentalApartmentsByOwner,
    addRentalRecord: rentalState.addRentalRecord,
    updateRentalRecord: rentalState.updateRentalRecord,
    deleteRentalRecord: rentalState.deleteRentalRecord,
    getRentalRecordsByApartment: rentalState.getRentalRecordsByApartment,

    // Notification state & actions
    notifications: notificationState.notifications,
    fetchNotificationsFromAPI: notificationState.fetchNotificationsFromAPI,
    addNotification: notificationState.addNotification,
    markNotificationAsRead: notificationState.markNotificationAsRead,
    markAllNotificationsAsRead: notificationState.markAllNotificationsAsRead,
    getUnreadCount: notificationState.getUnreadCount,

    // Activity state & actions
    activityLogs: activityState.activityLogs,
    addActivityLog: activityState.addActivityLog,

    // Settings state & actions
    settings: settingsState.settings,
    fetchSettings: settingsState.fetchSettings,
    updateSettings: settingsState.updateSettings,
  };
}

// Cross-tab synchronization for localStorage changes
// This ensures QR code status updates are synced between guard and resident
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'uk-data-storage' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed.state?.guestAccessCodes) {
          // Update guestAccessCodes from another tab
          useGuestAccessStore.setState({ guestAccessCodes: parsed.state.guestAccessCodes });
        }
      } catch (e) {
        console.error('Failed to sync storage:', e);
      }
    }
  });
}
