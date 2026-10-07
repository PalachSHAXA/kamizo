import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  publish: vi.fn(),
  worksPreview: vi.fn(),
  preview: vi.fn(),
  save: vi.fn(),
  generatePdf: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  adminUkReportsApi: {
    list: mocks.list,
    publish: mocks.publish,
    worksPreview: mocks.worksPreview,
    archive: vi.fn(),
    downloadPdf: vi.fn(),
  },
  branchesApi: { getAll: vi.fn().mockResolvedValue({ branches: [{ id: 'branch-1', code: 'BR', name: 'ЖК Орзу' }] }) },
  buildingsApi: { getAll: vi.fn() },
  entrancesApi: {},
  buildingDocumentsApi: {},
}));

vi.mock('../../../services/api/finance-v2', () => ({ factReportApi: { preview: mocks.preview, save: mocks.save } }));
vi.mock('../../../utils/ukReportPdf', () => ({ generateUkReportPdf: mocks.generatePdf }));
vi.mock('../../../utils/downloadFile', () => ({ downloadBlob: vi.fn() }));

import { UkReportsPublishingPage } from '../UkReportsPublishingPage';
import { useBuildingStore } from '../../../stores/buildingStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useTenantStore } from '../../../stores/tenantStore';

const financialPreview = {
  building: { id: 'building-1', name: 'Дом 1' },
  period_from: '2026-09',
  period_to: '2026-09',
  rows: [{ name: 'Содержание', prior_debt: 10, accrued: 100, paid: 80, arrears: 30 }],
  totals: { prior_debt: 10, accrued: 100, paid: 80, arrears: 30 },
  uk_income_plan: 100,
  uk_income_fact: 80,
};

describe('UK report generation workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
    mocks.preview.mockResolvedValue(financialPreview);
    mocks.save.mockResolvedValue(financialPreview);
    mocks.generatePdf.mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), filename: 'report.pdf' });
    mocks.publish.mockResolvedValue({ id: 'report-1' });
    useLanguageStore.setState({ language: 'ru' });
    useBuildingStore.setState({
      buildings: [{ id: 'building-1', name: 'Дом 1', address: 'ул. Тестовая', branchCode: 'BR' }] as never,
      isLoadingBuildings: false,
    });
    useTenantStore.setState({ config: { tenant: { id: 'tenant-1', name: 'УК Тест', slug: 'test', color: '#000', color_secondary: '#fff', plan: 'base', logo: null, is_demo: false }, features: [] } });
  });

  it('stores a financial snapshot before publishing the generated PDF', async () => {
    render(<UkReportsPublishingPage />);

    fireEvent.change(await screen.findByLabelText('Объект / ЖК'), { target: { value: 'BR' } });
    fireEvent.change(screen.getByLabelText('Дом'), { target: { value: 'building-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сформировать предварительный просмотр' }));

    expect(await screen.findByText('Содержание')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать жителям' }));

    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ building_id: 'building-1' }));
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]);
    const formData = mocks.publish.mock.calls[0][0] as FormData;
    expect(formData.get('report_type')).toBe('financial');
    expect(formData.get('building_id')).toBe('building-1');
  });
});
