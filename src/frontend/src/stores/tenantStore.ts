import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TenantConfig {
  tenant: {
    id: string;
    name: string;
    slug: string;
    color: string;
    color_secondary: string;
    plan: string;
    logo: string | null;
  } | null;
  features: string[];
}

interface TenantState {
  config: TenantConfig | null;
  isLoading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  hasFeature: (feature: string) => boolean;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set, get) => ({
      config: null,
      isLoading: false,
      error: null,

      fetchConfig: async () => {
        set({ isLoading: true, error: null });
        try {
          const API_URL = import.meta.env.VITE_API_URL || window.location.origin;
          const response = await fetch(`${API_URL}/api/tenant/config`);

          if (!response.ok) {
            throw new Error('Failed to fetch tenant config');
          }

          const config = await response.json();
          set({ config, isLoading: false });
        } catch (error: unknown) {
          console.error('Error fetching tenant config:', error);
          set({
            isLoading: false,
            error: (error as Error).message,
            config: { tenant: null, features: [] }
          });
        }
      },

      hasFeature: (feature: string) => {
        const config = get().config;
        if (!config || !config.tenant) {
          // If no tenant (main domain), allow all features
          return true;
        }
        return config.features.includes(feature);
      },
    }),
    {
      name: 'tenant-config',
      version: 1,
    }
  )
);
