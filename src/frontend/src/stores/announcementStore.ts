import { create } from 'zustand';
import { registerSessionStore } from './sessionRegistry';
import type { Announcement } from '../types';
import type { AnnouncementApiRecord } from '../services/api/announcements';
import { useToastStore } from './toastStore';

const generateId = () => Math.random().toString(36).substr(2, 9);

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const mapAttachments = (value: unknown): Announcement['attachments'] => {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return undefined;
  return parsed.filter((item): item is NonNullable<Announcement['attachments']>[number] => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return typeof record.name === 'string'
      && typeof record.url === 'string'
      && typeof record.type === 'string'
      && typeof record.size === 'number';
  });
};

const mapPersonalizedData = (value: unknown): Announcement['personalizedData'] => {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;

  const result: NonNullable<Announcement['personalizedData']> = {};
  for (const [login, item] of Object.entries(parsed)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.name === 'string' && typeof record.debt === 'number') {
      result[login] = { name: record.name, debt: record.debt };
    }
  }
  return result;
};

const mapAnnouncement = (
  record: AnnouncementApiRecord,
  userId: string | undefined,
  localReadAnnouncements: string[],
): Announcement => {
  const viewedByUser = record.viewed_by_user === true || record.viewed_by_user === 1;
  const viewedBy = userId && (viewedByUser || localReadAnnouncements.includes(record.id)) ? [userId] : [];

  return {
    id: record.id,
    title: record.title,
    content: record.content,
    type: record.type === 'staff' ? 'employees' : record.type,
    priority: record.priority || 'normal',
    authorId: record.created_by || '',
    authorName: record.author_name || 'Администрация',
    authorRole: 'manager',
    createdAt: record.created_at,
    expiresAt: record.expires_at,
    isActive: record.is_active === 1 || record.is_active === true,
    viewedBy,
    viewCount: record.view_count || 0,
    attachments: mapAttachments(record.attachments),
    personalizedData: mapPersonalizedData(record.personalized_data),
    target: record.target_type ? {
      type: record.target_type,
      branchId: record.target_branch,
      buildingId: record.target_building_id,
      entrance: record.target_entrance,
      floor: record.target_floor,
      customLogins: record.target_logins?.split(',').map((login) => login.trim()).filter(Boolean),
    } : undefined,
  };
};

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
          // Каналы публикации (§8). Передаём только если автор что-то
          // снял: бэкенд трактует отсутствие поля как «все включены»,
          // и лишний объект в теле ничего не меняет, но зашумляет лог.
          ...(announcementData.channels ? {
            channels: {
              push: announcementData.channels.push !== false,
              telegram_groups: announcementData.channels.telegramGroups !== false,
            },
          } : {}),
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
        // Sprint 80 P0 #10: was falling through to a "local-only (demo
        // mode)" path that pushed the row to the FE state — manager
        // thought the announcement was published, residents never saw
        // it. Now: surface the error and re-throw so the modal stays
        // open with the form intact.
        console.error('[DataStore] Failed to create announcement via API:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Failed to create announcement');
        throw error;
      }
    },

    updateAnnouncement: async (id, data) => {
      // Sprint 80 P0 #4-equivalent: was optimistically updating local
      // state BEFORE the API call. If the API failed, the UI showed
      // the new state while the server kept the old row — until the
      // next fetchAnnouncements wiped the optimism. Now: call API
      // first, only mutate local state on success.
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
        throw error;
      }

      set((state) => ({
        announcements: state.announcements.map((a) =>
          a.id === id ? { ...a, ...data } : a
        ),
      }));
    },

    deleteAnnouncement: async (id) => {
      // Sprint 80 P0 #9: was running `set(filter)` AFTER the catch, so
      // the UI removed the row even when the server kept the active
      // announcement broadcasting. Move set() inside try, after the
      // successful await.
      try {
        const { announcementsApi } = await import('../services/api');
        await announcementsApi.delete(id);
        set((state) => ({
          announcements: state.announcements.filter((a) => a.id !== id),
        }));
      } catch (error) {
        console.error('[DataStore] Failed to delete announcement via API:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Failed to delete announcement');
        throw error;
      }
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

        const announcements = (result.announcements || []).map((record) =>
          mapAnnouncement(record, userId, localReadAnnouncements));

        set({ announcements });
      } catch (error) {
        console.error('[DataStore] Failed to fetch announcements:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Failed to load announcements');
      }
    },
  })
);

registerSessionStore(useAnnouncementStore);
