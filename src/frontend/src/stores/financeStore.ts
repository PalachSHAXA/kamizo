// Finance store — Zustand module for the full finance module

import { create } from 'zustand';
import { financeApi } from '../services/api/finance';
import { useToastStore } from './toastStore';

interface FinanceFilters {
  buildingId: string;
  period: string;
  status: string;
}

interface FinanceState {
  // Estimates
  estimates: Record<string, unknown>[];
  currentEstimate: Record<string, unknown> | null;
  estimatesLoading: boolean;
  // Charges
  charges: Record<string, unknown>[];
  chargesPagination: Record<string, unknown> | null;
  chargesSummary: Record<string, unknown> | null;
  chargesLoading: boolean;
  // Payments
  payments: Record<string, unknown>[];
  paymentsPagination: Record<string, unknown> | null;
  paymentsLoading: boolean;
  // Debtors
  debtors: Record<string, unknown>[];
  debtorsLoading: boolean;
  // Income
  income: Record<string, unknown>[];
  incomeCategories: Record<string, unknown>[];
  incomeLoading: boolean;
  // Materials
  materials: Record<string, unknown>[];
  materialsLoading: boolean;
  // Access
  financeAccess: Record<string, unknown>[];
  accessLoading: boolean;
  // Filters
  filters: FinanceFilters;

  // Actions — Estimates
  fetchEstimates: () => Promise<void>;
  fetchEstimate: (id: string) => Promise<void>;
  createEstimate: (data: Parameters<typeof financeApi.createEstimate>[0]) => Promise<boolean>;
  updateEstimate: (id: string, data: Record<string, unknown>) => Promise<boolean>;
  activateEstimate: (id: string) => Promise<boolean>;
  // Actions — Charges
  generateCharges: (estimateId: string) => Promise<boolean>;
  fetchCharges: (page?: number) => Promise<void>;
  fetchChargesSummary: (buildingId: string, period?: string) => Promise<void>;
  // Actions — Payments
  createPayment: (data: Parameters<typeof financeApi.createPayment>[0]) => Promise<boolean>;
  fetchPayments: (page?: number) => Promise<void>;
  // Actions — Debtors
  fetchDebtors: () => Promise<void>;
  // Actions — Income
  fetchIncome: () => Promise<void>;
  createIncome: (data: Parameters<typeof financeApi.createIncome>[0]) => Promise<boolean>;
  fetchIncomeCategories: () => Promise<void>;
  createIncomeCategory: (name: string) => Promise<boolean>;
  // Actions — Materials
  fetchMaterials: (buildingId?: string) => Promise<void>;
  createMaterial: (data: Parameters<typeof financeApi.createMaterial>[0]) => Promise<boolean>;
  useMaterial: (id: string, data: { quantity: number; request_id?: string; description?: string }) => Promise<boolean>;
  // Actions — Claims
  generateReconciliation: (data: { apartment_id: string; period_from: string; period_to: string }) => Promise<Record<string, unknown> | null>;
  generatePretension: (apartmentId: string) => Promise<Record<string, unknown> | null>;
  // Actions — Access
  fetchFinanceAccess: () => Promise<void>;
  grantAccess: (userId: string, level: string) => Promise<boolean>;
  revokeAccess: (id: string) => Promise<boolean>;
  // Actions — Balance
  getApartmentBalance: (apartmentId: string) => Promise<Record<string, unknown> | null>;
  // Filters
  setFilters: (filters: Partial<FinanceFilters>) => void;
}

const addToast = (msg: string, type: 'success' | 'error') =>
  useToastStore.getState().addToast(msg, type);

export const useFinanceStore = create<FinanceState>((set, get) => ({
  estimates: [],
  currentEstimate: null,
  estimatesLoading: false,
  charges: [],
  chargesPagination: null,
  chargesSummary: null,
  chargesLoading: false,
  payments: [],
  paymentsPagination: null,
  paymentsLoading: false,
  debtors: [],
  debtorsLoading: false,
  income: [],
  incomeCategories: [],
  incomeLoading: false,
  materials: [],
  materialsLoading: false,
  financeAccess: [],
  accessLoading: false,
  filters: { buildingId: '', period: '', status: '' },

  // ── Estimates ────────────────────────────────

  fetchEstimates: async () => {
    set({ estimatesLoading: true });
    try {
      const { buildingId, period, status } = get().filters;
      const res = await financeApi.getEstimates({
        building_id: buildingId || undefined,
        period: period || undefined,
        status: status || undefined,
      });
      set({ estimates: res.estimates || [] });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки смет', 'error');
    } finally {
      set({ estimatesLoading: false });
    }
  },

  fetchEstimate: async (id) => {
    try {
      const res = await financeApi.getEstimate(id);
      set({ currentEstimate: res.estimate || null });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки сметы', 'error');
    }
  },

  createEstimate: async (data) => {
    try {
      await financeApi.createEstimate(data);
      addToast('Смета создана', 'success');
      await get().fetchEstimates();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка создания сметы', 'error');
      return false;
    }
  },

  updateEstimate: async (id, data) => {
    try {
      await financeApi.updateEstimate(id, data);
      addToast('Смета обновлена', 'success');
      await get().fetchEstimates();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка обновления сметы', 'error');
      return false;
    }
  },

  activateEstimate: async (id) => {
    try {
      await financeApi.activateEstimate(id);
      addToast('Смета активирована', 'success');
      await get().fetchEstimates();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка активации сметы', 'error');
      return false;
    }
  },

  // ── Charges ──────────────────────────────────

  generateCharges: async (estimateId) => {
    try {
      const res = await financeApi.generateCharges(estimateId);
      addToast(`Начисления созданы: ${res.generated} из ${res.total_apartments}`, 'success');
      await get().fetchCharges();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка генерации начислений', 'error');
      return false;
    }
  },

  fetchCharges: async (page = 1) => {
    set({ chargesLoading: true });
    try {
      const { buildingId, period, status } = get().filters;
      const res = await financeApi.getCharges({
        building_id: buildingId || undefined,
        period: period || undefined,
        status: status || undefined,
        page,
      });
      set({ charges: res.data || [], chargesPagination: res.pagination || null });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки начислений', 'error');
    } finally {
      set({ chargesLoading: false });
    }
  },

  fetchChargesSummary: async (buildingId, period) => {
    if (!buildingId) {
      set({ chargesSummary: { total_charged: 0, total_paid: 0, total_debt: 0, total_overpaid: 0 } });
      return;
    }
    try {
      const res = await financeApi.getChargesSummary(buildingId, period);
      set({ chargesSummary: res.summary || null });
    } catch (err) {
      set({ chargesSummary: { total_charged: 0, total_paid: 0, total_debt: 0, total_overpaid: 0 } });
    }
  },

  // ── Payments ─────────────────────────────────

  createPayment: async (data) => {
    try {
      const res = await financeApi.createPayment(data);
      const receipt = (res.payment as Record<string, unknown>)?.receipt_number || '';
      addToast(`Оплата принята. Квитанция: ${receipt}`, 'success');
      await get().fetchPayments();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка приёма оплаты', 'error');
      return false;
    }
  },

  fetchPayments: async (page = 1) => {
    set({ paymentsLoading: true });
    try {
      const { buildingId, period } = get().filters;
      const res = await financeApi.getPayments({
        apartment_id: buildingId || undefined,
        period: period || undefined,
        page,
      });
      set({ payments: res.data || [], paymentsPagination: res.pagination || null });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки оплат', 'error');
    } finally {
      set({ paymentsLoading: false });
    }
  },

  // ── Debtors ──────────────────────────────────

  fetchDebtors: async () => {
    set({ debtorsLoading: true });
    try {
      const { buildingId } = get().filters;
      const res = await financeApi.getDebtors({ building_id: buildingId || undefined });
      set({ debtors: res.debtors || [] });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки должников', 'error');
    } finally {
      set({ debtorsLoading: false });
    }
  },

  // ── Income ───────────────────────────────────

  fetchIncome: async () => {
    set({ incomeLoading: true });
    try {
      const { period } = get().filters;
      const res = await financeApi.getIncome({ period: period || undefined });
      set({ income: res.income || [] });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки доходов', 'error');
    } finally {
      set({ incomeLoading: false });
    }
  },

  createIncome: async (data) => {
    try {
      await financeApi.createIncome(data);
      addToast('Доход добавлен', 'success');
      await get().fetchIncome();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка добавления дохода', 'error');
      return false;
    }
  },

  fetchIncomeCategories: async () => {
    try {
      const res = await financeApi.getIncomeCategories();
      set({ incomeCategories: res.categories || [] });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки категорий', 'error');
    }
  },

  createIncomeCategory: async (name) => {
    try {
      await financeApi.createIncomeCategory(name);
      addToast('Категория создана', 'success');
      await get().fetchIncomeCategories();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка создания категории', 'error');
      return false;
    }
  },

  // ── Materials ────────────────────────────────

  fetchMaterials: async (buildingId) => {
    set({ materialsLoading: true });
    try {
      const res = await financeApi.getMaterials(buildingId || get().filters.buildingId || undefined);
      set({ materials: res.materials || [] });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки материалов', 'error');
    } finally {
      set({ materialsLoading: false });
    }
  },

  createMaterial: async (data) => {
    try {
      await financeApi.createMaterial(data);
      addToast(data.id ? 'Материал обновлён' : 'Материал добавлен', 'success');
      await get().fetchMaterials();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка сохранения материала', 'error');
      return false;
    }
  },

  useMaterial: async (id, data) => {
    try {
      const res = await financeApi.useMaterial(id, data);
      addToast(`Списано. Остаток: ${res.new_quantity}`, 'success');
      await get().fetchMaterials();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка списания', 'error');
      return false;
    }
  },

  // ── Claims ───────────────────────────────────

  generateReconciliation: async (data) => {
    try {
      const res = await financeApi.generateReconciliation(data);
      addToast('Акт сверки сформирован', 'success');
      return res;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка формирования акта', 'error');
      return null;
    }
  },

  generatePretension: async (apartmentId) => {
    try {
      const res = await financeApi.generatePretension(apartmentId);
      addToast('Претензия сформирована', 'success');
      return res;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка формирования претензии', 'error');
      return null;
    }
  },

  // ── Access ───────────────────────────────────

  fetchFinanceAccess: async () => {
    set({ accessLoading: true });
    try {
      const res = await financeApi.getFinanceAccess();
      set({ financeAccess: res.access || [] });
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки доступов', 'error');
    } finally {
      set({ accessLoading: false });
    }
  },

  grantAccess: async (userId, level) => {
    try {
      await financeApi.grantFinanceAccess(userId, level);
      addToast('Доступ предоставлен', 'success');
      await get().fetchFinanceAccess();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка предоставления доступа', 'error');
      return false;
    }
  },

  revokeAccess: async (id) => {
    try {
      await financeApi.revokeFinanceAccess(id);
      addToast('Доступ отозван', 'success');
      await get().fetchFinanceAccess();
      return true;
    } catch (err) {
      addToast((err as Error).message || 'Ошибка отзыва доступа', 'error');
      return false;
    }
  },

  // ── Balance ──────────────────────────────────

  getApartmentBalance: async (apartmentId) => {
    try {
      return await financeApi.getApartmentBalance(apartmentId);
    } catch (err) {
      addToast((err as Error).message || 'Ошибка загрузки баланса', 'error');
      return null;
    }
  },

  // ── Filters ──────────────────────────────────

  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
}));
