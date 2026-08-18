import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tenant } from '../components/types';

const { apiRequest, addToast } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('../../../services/api', () => ({ apiRequest }));
vi.mock('../../../stores/languageStore', () => ({ useLanguageStore: () => ({ language: 'ru' }) }));
vi.mock('../../../stores/toastStore', () => ({ useToastStore: { getState: () => ({ addToast }) } }));
vi.mock('../../../components/ui', () => ({ Switch: () => null }));
vi.mock('../../../components/contracts/ContractUploader', () => ({ ContractUploader: () => null }));

import { DashboardTab } from '../components/DashboardTab';

const tenant: Tenant = {
  id: 'tenant-1',
  name: 'Tenant One',
  slug: 'tenant',
  url: 'https://tenant.kamizo.uz',
  admin_url: null,
  color: '#111111',
  color_secondary: '#222222',
  plan: 'pro',
  features: '[]',
  logo: null,
  contract_template: null,
  admin_email: null,
  admin_phone: null,
  users_count: 1,
  requests_count: 0,
  votes_count: 0,
  qr_count: 0,
  revenue: 0,
  is_active: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  show_useful_contacts_banner: 0,
  show_marketplace_banner: 0,
};

describe('DashboardTab impersonation', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    addToast.mockReset();
  });

  it('opens the tenant with only the opaque exchange code in the URL', async () => {
    apiRequest.mockImplementation(async (endpoint: string) => {
      if (endpoint.includes('/details')) {
        return {
          tenant,
          stats: { residents: 0, requests: 0, votes: 0, qr_codes: 0, buildings: 0, staff: 0 },
          tabData: [],
        };
      }
      return {
        exchangeCode: 'opaque-code',
        tenantUrl: 'https://tenant.kamizo.uz',
        ttlSec: 60,
      };
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <DashboardTab
        tenants={[tenant]}
        setTenants={vi.fn()}
        error=""
        setError={vi.fn()}
        onEditTenant={vi.fn()}
        onDeleteTenant={vi.fn()}
        onToggleActive={vi.fn()}
        loadTenants={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Войти в админку УК/i }));

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const openedUrl = open.mock.calls[0][0] as string;
    expect(openedUrl).toBe('https://tenant.kamizo.uz/?impersonation_code=opaque-code');
    expect(openedUrl).not.toMatch(/token|jwt|user|auto_auth|base64/i);
    expect(apiRequest).toHaveBeenCalledWith('/api/super-admin/impersonate/tenant-1', {
      method: 'POST',
      body: JSON.stringify({ originUrl: window.location.href }),
    });
  });
});
