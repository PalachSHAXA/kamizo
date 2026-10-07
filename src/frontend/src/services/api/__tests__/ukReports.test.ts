import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('../client', () => ({
  apiRequest,
  API_URL: 'https://api.example.test',
  getToken: vi.fn(),
}));

import { adminUkReportsApi, residentUkReportsApi } from '../ukReports';

describe('residentUkReportsApi.estimate', () => {
  beforeEach(() => apiRequest.mockReset());

  it('requests the active resident estimate endpoint', async () => {
    apiRequest.mockResolvedValue({ estimate: { id: 'estimate-1' } });

    await residentUkReportsApi.estimate();

    expect(apiRequest).toHaveBeenCalledWith('/api/resident/uk-estimate');
  });
});

describe('adminUkReportsApi.worksPreview', () => {
  beforeEach(() => apiRequest.mockReset());

  it('requests a building-scoped ISO date range', async () => {
    apiRequest.mockResolvedValue({ completed_requests: [], completed_work_orders: [] });

    await adminUkReportsApi.worksPreview({
      building_id: 'building 1',
      date_from: '2026-01-01',
      date_to: '2026-01-31',
    });

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/admin/uk-reports/works-preview?building_id=building+1&date_from=2026-01-01&date_to=2026-01-31',
    );
  });
});
