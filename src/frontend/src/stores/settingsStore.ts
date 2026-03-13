import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Settings interface
interface AppSettings {
  companyName: string;
  companyInn: string;
  companyAddress: string;
  companyPhone: string;
  routingMode: 'manual' | 'auto' | 'hybrid';
  workingHoursStart: string;
  workingHoursEnd: string;
  autoAssign: boolean;
  notifyOnNew: boolean;
  notifyOnComplete: boolean;
  notifyOnRating: boolean;
  smsNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

// Default settings — empty company info, loaded from tenant config at runtime
const defaultSettings: AppSettings = {
  companyName: '',
  companyInn: '',
  companyAddress: '',
  companyPhone: '',
  routingMode: 'hybrid',
  workingHoursStart: '08:00',
  workingHoursEnd: '20:00',
  autoAssign: true,
  notifyOnNew: true,
  notifyOnComplete: true,
  notifyOnRating: true,
  smsNotifications: false,
  emailNotifications: true,
  pushNotifications: true,
};

interface SettingsState {
  settings: AppSettings;

  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,

      fetchSettings: async () => {
        try {
          const { settingsApi } = await import('../services/api');
          const response = await settingsApi.getAll();
          if (response.success && response.data?.settings) {
            const apiSettings = response.data.settings;
            // Map API settings to local format
            set((state) => ({
              settings: {
                ...state.settings,
                companyName: apiSettings.companyName ?? state.settings.companyName,
                companyInn: apiSettings.companyInn ?? state.settings.companyInn,
                companyAddress: apiSettings.companyAddress ?? state.settings.companyAddress,
                companyPhone: apiSettings.companyPhone ?? state.settings.companyPhone,
                routingMode: apiSettings.routingMode ?? state.settings.routingMode,
                workingHoursStart: apiSettings.workingHoursStart ?? state.settings.workingHoursStart,
                workingHoursEnd: apiSettings.workingHoursEnd ?? state.settings.workingHoursEnd,
                autoAssign: apiSettings.autoAssign ?? state.settings.autoAssign,
                notifyOnNew: apiSettings.notifyOnNew ?? state.settings.notifyOnNew,
                notifyOnComplete: apiSettings.notifyOnComplete ?? state.settings.notifyOnComplete,
                notifyOnRating: apiSettings.notifyOnRating ?? state.settings.notifyOnRating,
                smsNotifications: apiSettings.smsNotifications ?? state.settings.smsNotifications,
                emailNotifications: apiSettings.emailNotifications ?? state.settings.emailNotifications,
                pushNotifications: apiSettings.pushNotifications ?? state.settings.pushNotifications,
              },
            }));
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      },

      updateSettings: async (newSettings) => {
        // Optimistically update local state
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));

        // Sync to API
        try {
          const { settingsApi } = await import('../services/api');
          await settingsApi.updateMany(newSettings);
        } catch (error) {
          console.error('Failed to save settings to API:', error);
          // Settings already updated locally, API will sync on next fetch
        }
      },
    }),
    {
      name: 'uk-settings-storage',
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);
