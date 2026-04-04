import { create } from 'zustand';
import type { Announcement } from '../types';
import { useToastStore } from './toastStore';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface AnnouncementState {
  announcements: Announcement[];

  addAnnouncement: (announcement: Omit<Announcement, 'id' | 'createdAt' | 'isActive' | 'viewedBy'>) => Promise<Announcement | null>;
  updateAnnouncement: (id: string, data: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => Promise<void>;
  markAnnouncementAsViewed: (announcementId: string, userId: string) => void;
  getAnnouncementsForResidents: (userLogin: string, buildingId?: string, entrance?: string, floor?: string, branch?: string, apartment?: string) => Announcement[];
  getAnnouncementsForEmployees: () => Announcement[];
  getAnnouncementsByAuthor: (authorId: string) => Announcement[];
  fetchAnnouncements: () => Promise<void>;
}

export const useAnnouncementStore = create<AnnouncementState>()(
  (set, get) => ({
    announcements: [],

    addAnnouncement: async (announcementData) => {
      try {
        const { announcementsApi } = await import('../services/api');

        // Build target for API
        const target = announcementData.target;
        const apiData = {
          title: announcementData.title,
          content: announcementData.content,
          type: announcementData.type as 'residents' | 'employees' | 'all',
          priority: announcementData.priority,
          expires_at: announcementData.expiresAt,
          target_type: target?.type,
          target_branch: target?.branchId,
          target_building_id: target?.buildingId,
          target_entrance: target?.entrance,
          target_floor: target?.floor,
          target_logins: target?.customLogins?.join(','),
          attachments: announcementData.attachments,
          // Personalized data for debt-based announcements
          personalized_data: announcementData.personalizedData,
        };

        const result = await announcementsApi.create(apiData);

        // Refetch announcements from server to avoid duplicates
        await get().fetchAnnouncements();

        // Return the created announcement info
        const newAnnouncement: Announcement = {
          ...announcementData,
          id: (result as Record<string, unknown>).id as string || generateId(),
          createdAt: new Date().toISOString(),
          isActive: true,
          viewedBy: [],
        };

        return newAnnouncement;
      } catch (error) {
        console.error('[DataStore] Failed to create announcement via API:', error);
        // Fallback to local-only (for demo mode)
        const newAnnouncement: Announcement = {
          ...announcementData,
          id: generateId(),
          createdAt: new Date().toISOString(),
          isActive: true,
          viewedBy: [],
        };
        set((state) => ({ announcements: [newAnnouncement, ...state.announcements] }));
        return newAnnouncement;
      }
    },

    updateAnnouncement: async (id, data) => {
      // Update local state immediately
      set((state) => ({
        announcements: state.announcements.map((a) =>
          a.id === id ? { ...a, ...data } : a
        ),
      }));

      // Sync with API
      try {
        const { announcementsApi } = await import('../services/api');
        await announcementsApi.update(id, {
          title: data.title,
          content: data.content,
          type: data.type,
          priority: data.priority,
          target_type: data.target?.type,
          target_building_id: data.target?.buildingId,
          target_entrance: data.target?.entrance,
          target_floor: data.target?.floor,
          target_logins: data.target?.customLogins?.join(','),
          expires_at: data.expiresAt,
        });
      } catch (error) {
        console.error('[DataStore] Failed to update announcement via API:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Failed to update announcement');
      }
    },

    deleteAnnouncement: async (id) => {
      try {
        const { announcementsApi } = await import('../services/api');
        await announcementsApi.delete(id);
      } catch (error) {
        console.error('[DataStore] Failed to delete announcement via API:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Failed to delete announcement');
      }
      set((state) => ({
        announcements: state.announcements.filter((a) => a.id !== id),
      }));
    },

    markAnnouncementAsViewed: async (announcementId, userId) => {
      // Save to localStorage for persistence across page reloads (backup)
      const readAnnouncementsKey = `read_announcements_${userId}`;
      const readAnnouncements = JSON.parse(localStorage.getItem(readAnnouncementsKey) || '[]');
      if (!readAnnouncements.includes(announcementId)) {
        readAnnouncements.push(announcementId);
        localStorage.setItem(readAnnouncementsKey, JSON.stringify(readAnnouncements));
      }

      // Update local state immediately
      set((state) => ({
        announcements: state.announcements.map((a) =>
          a.id === announcementId && !a.viewedBy.includes(userId)
            ? { ...a, viewedBy: [...a.viewedBy, userId] }
            : a
        ),
      }));

      // Sync with API in background
      try {
        const { announcementsApi } = await import('../services/api');
        await announcementsApi.markAsViewed(announcementId);
      } catch (error) {
        console.error('[DataStore] Failed to sync announcement view:', error);
      }
    },

    getAnnouncementsForResidents: (userLogin: string, buildingId?: string, entrance?: string, floor?: string, branch?: string, apartment?: string) => {
      const now = new Date();
      return get().announcements.filter((a) => {
        // Basic filters - show 'residents' and 'all' types
        if ((a.type !== 'residents' && a.type !== 'all') || !a.isActive) return false;
        if (a.expiresAt && new Date(a.expiresAt) <= now) return false;

        // If no targeting, show to all
        if (!a.target || a.target.type === 'all') return true;

        // Check targeting
        switch (a.target.type) {
          case 'building':
            // Show if user's building matches
            return buildingId && a.target.buildingId === buildingId;

          case 'entrance':
            // Show if user's building AND entrance match
            return buildingId === a.target.buildingId && entrance === a.target.entrance;

          case 'floor':
            // Show if user's building, entrance AND floor match
            return buildingId === a.target.buildingId &&
                   entrance === a.target.entrance &&
                   floor === a.target.floor;

          case 'custom':
            // Check if user's login or apartment is in the custom list
            return a.target.customLogins?.includes(userLogin) || (apartment && a.target.customLogins?.includes(apartment)) || false;

          case 'branch':
            // Branch filtering is done on the server side
            // If we got this announcement from API, it means user is in the target branch
            // Only filter locally if branch is provided (for offline mode)
            return !branch || a.target.branchId === branch;

          default:
            return true;
        }
      });
    },

    getAnnouncementsForEmployees: () => {
      const now = new Date();
      return get().announcements.filter((a) =>
        (a.type === 'employees' || a.type === 'all') &&
        a.isActive &&
        (!a.expiresAt || new Date(a.expiresAt) > now)
      );
    },

    getAnnouncementsByAuthor: (authorId) => {
      return get().announcements.filter((a) => a.authorId === authorId);
    },

    fetchAnnouncements: async () => {
      try {
        const { announcementsApi } = await import('../services/api');
        const result = await announcementsApi.getAll();
        const authState = JSON.parse(localStorage.getItem('uk-auth-storage') || '{}');
        const userId = authState?.state?.user?.id;

        // Parse localStorage once outside the map loop for performance
        let localReadAnnouncements: string[] = [];
        if (userId) {
          try {
            localReadAnnouncements = JSON.parse(localStorage.getItem(`read_announcements_${userId}`) || '[]');
          } catch { localReadAnnouncements = []; }
        }

        const announcements: Announcement[] = (result.announcements || []).map((a: Record<string, unknown>) => {
          // Use API view_count and viewed_by_user if available
          const viewedByUser = a.viewed_by_user === true || a.viewed_by_user === 1;

          // Build viewedBy array - include current user if they viewed
          const viewedBy: string[] = [];
          if (viewedByUser && userId) {
            viewedBy.push(userId);
          }

          // Also check localStorage as fallback
          if (userId && localReadAnnouncements.includes(a.id) && !viewedBy.includes(userId)) {
            viewedBy.push(userId);
          }

          // Parse attachments from JSON string
          let attachments = undefined;
          if (a.attachments) {
            try {
              attachments = typeof a.attachments === 'string'
                ? JSON.parse(a.attachments)
                : a.attachments;
            } catch {
              attachments = undefined;
            }
          }

          // Parse personalized data
          let personalizedData = undefined;
          if (a.personalized_data) {
            try {
              personalizedData = typeof a.personalized_data === 'string'
                ? JSON.parse(a.personalized_data)
                : a.personalized_data;
            } catch {
              personalizedData = undefined;
            }
          }

          // Map 'staff' from API back to 'employees' for UI compatibility
          const typeForUI = a.type === 'staff' ? 'employees' : a.type;
          return {
            id: a.id,
            title: a.title,
            content: a.content,
            type: typeForUI as 'residents' | 'employees' | 'all',
            priority: a.priority || 'normal',
            authorId: a.created_by || '',
            authorName: a.author_name || 'Администрация',
            authorRole: 'manager' as const,
            createdAt: a.created_at,
            expiresAt: a.expires_at,
            isActive: a.is_active === 1,
            viewedBy,
            viewCount: a.view_count || 0, // Total view count from API
            attachments, // File attachments
            personalizedData,
            target: a.target_type ? {
              type: a.target_type,
              branchId: a.target_branch,
              buildingId: a.target_building_id,
              entrance: a.target_entrance,
              floor: a.target_floor,
              customLogins: a.target_logins?.split(',').map((l: string) => l.trim()).filter(Boolean),
            } : undefined,
          };
        });

        set({ announcements });
      } catch (error) {
        console.error('[DataStore] Failed to fetch announcements:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Failed to load announcements');
      }
    },
  })
);
