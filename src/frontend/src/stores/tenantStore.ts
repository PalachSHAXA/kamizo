import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_URL, getToken } from '../services/api/client';

export interface TenantConfig {
  tenant: {
    id: string;
    name: string;
    slug: string;
    color: string;
    color_secondary: string;
    plan: string;
    logo: string | null;
    is_demo: boolean;
  } | null;
  features: string[];
}

interface TenantState {
  config: TenantConfig | null;
  isLoading: boolean;
  isConfigFetched: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  hasFeature: (feature: string) => boolean;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set, get) => ({
      config: null,
      isLoading: false,
      isConfigFetched: false,
      error: null,

      fetchConfig: async () => {
        set({ isLoading: true, error: null });
        try {
          // API_URL is hardcoded to https://api.kamizo.uz in client.ts —
          // critical for the Capacitor native app whose WebView origin
          // is https://localhost / capacitor://localhost. The previous
          // `window.location.origin` fallback resolved to the bundled-
          // asset host and 404'd in native, leaving every UK card blank
          // and feature-gating defaulting to "allow all".
          //
          // Include the JWT when present so the backend's JWT-fallback
          // path can resolve the user's tenant when the Origin header
          // doesn't (i.e. unified mobile app, where Origin is
          // https://localhost rather than a tenant subdomain).
          const token = getToken();
          const headers: HeadersInit = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const response = await fetch(`${API_URL}/api/tenant/config`, { headers });

          if (!response.ok) {
            throw new Error('Failed to fetch tenant config');
          }

          const config = await response.json();
          set({ config, isLoading: false, isConfigFetched: true });
        } catch (error: unknown) {
          console.error('Error fetching tenant config:', error);
          set({
            isLoading: false,
            isConfigFetched: true,
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
      partialize: (state) => ({ config: state.config }),
    }
  )
);
