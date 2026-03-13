import { create } from 'zustand';
import type {
  PersonalAccount,
} from '../types';
import { personalAccountsApi } from '../services/api';

const mapAccountFromApi = (a: any): PersonalAccount => ({
  id: a.id,
  number: a.number,
  apartmentId: a.apartment_id,
  buildingId: a.building_id,
  primaryOwnerId: a.primary_owner_id,
  ownerName: a.owner_name,
  apartmentNumber: a.apartment_number,
  address: a.address,
  totalArea: a.total_area || 0,
  residentsCount: a.residents_count || 0,
  registeredCount: a.registered_count || 0,
  balance: a.balance || 0,
  currentDebt: a.current_debt || 0,
  penaltyAmount: a.penalty_amount || 0,
  lastPaymentDate: a.last_payment_date,
  lastPaymentAmount: a.last_payment_amount,
  lastChargeDate: a.last_charge_date,
  lastChargeAmount: a.last_charge_amount,
  tariffPlanId: a.tariff_plan_id,
  hasSubsidy: !!a.has_subsidy,
  subsidyPercent: a.subsidy_percent,
  subsidyEndDate: a.subsidy_end_date,
  hasDiscount: !!a.has_discount,
  discountPercent: a.discount_percent,
  discountReason: a.discount_reason,
  status: a.status || 'active',
  closedAt: a.closed_at,
  closedReason: a.closed_reason,
  notes: a.notes,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

interface AccountState {
  // Data
  personalAccounts: PersonalAccount[];

  // Loading states
  isLoadingAccounts: boolean;

  // API-driven personal account actions
  fetchAccountsByBuilding: (buildingId: string, options?: { status?: string; hasDebt?: boolean }) => Promise<PersonalAccount[]>;
  addPersonalAccount: (account: Omit<PersonalAccount, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PersonalAccount | null>;
  updatePersonalAccount: (id: string, data: Partial<PersonalAccount>) => Promise<void>;
  getPersonalAccountById: (id: string) => PersonalAccount | undefined;
  getPersonalAccountByApartment: (apartmentId: string) => PersonalAccount | undefined;
  getPersonalAccountsByBuilding: (buildingId: string) => PersonalAccount[];
  fetchDebtors: (options?: { minDebt?: number; buildingId?: string }) => Promise<PersonalAccount[]>;
  getDebtors: (minDebt?: number) => PersonalAccount[];
}

export const useAccountStore = create<AccountState>()(
  (set, get) => ({
    // Initialize with empty arrays
    personalAccounts: [],

    // Loading states
    isLoadingAccounts: false,

    // ========== API-DRIVEN PERSONAL ACCOUNT ACTIONS ==========

    fetchAccountsByBuilding: async (buildingId: string, options?: { status?: string; hasDebt?: boolean }) => {
      set({ isLoadingAccounts: true });
      try {
        const response = await personalAccountsApi.getByBuilding(buildingId, options);
        const accounts = (response.accounts || []).map(mapAccountFromApi);

        // Replace accounts for this building
        set((state) => {
          const otherAccounts = state.personalAccounts.filter((a) => a.buildingId !== buildingId);
          return { personalAccounts: [...otherAccounts, ...accounts], isLoadingAccounts: false };
        });

        return accounts;
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
        set({ isLoadingAccounts: false });
        return [];
      }
    },

    addPersonalAccount: async (accountData) => {
      try {
        const response = await personalAccountsApi.create({
          apartmentId: accountData.apartmentId,
          buildingId: accountData.buildingId,
          primaryOwnerId: accountData.primaryOwnerId,
          ownerName: accountData.ownerName,
          apartmentNumber: accountData.apartmentNumber,
          totalArea: accountData.totalArea,
          residentsCount: accountData.residentsCount,
          balance: accountData.balance,
          currentDebt: accountData.currentDebt,
        });
        if (response.account) {
          const newAccount = mapAccountFromApi(response.account);
          set((state) => ({ personalAccounts: [...state.personalAccounts, newAccount] }));
          return newAccount;
        }
        return null;
      } catch (error) {
        console.error('Failed to create account:', error);
        return null;
      }
    },

    updatePersonalAccount: async (id, data) => {
      try {
        await personalAccountsApi.update(id, data as any);
        set((state) => ({
          personalAccounts: state.personalAccounts.map((a) =>
            a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a
          ),
        }));
      } catch (error) {
        console.error('Failed to update account:', error);
      }
    },

    getPersonalAccountById: (id) => {
      return get().personalAccounts.find((a) => a.id === id);
    },

    getPersonalAccountByApartment: (apartmentId) => {
      return get().personalAccounts.find((a) => a.apartmentId === apartmentId);
    },

    getPersonalAccountsByBuilding: (buildingId) => {
      return get().personalAccounts.filter((a) => a.buildingId === buildingId);
    },

    fetchDebtors: async (options?: { minDebt?: number; buildingId?: string }) => {
      try {
        const response = await personalAccountsApi.getDebtors(options);
        return (response.debtors || []).map(mapAccountFromApi);
      } catch (error) {
        console.error('Failed to fetch debtors:', error);
        return [];
      }
    },

    getDebtors: (minDebt = 0) => {
      return get()
        .personalAccounts.filter((a) => a.currentDebt > minDebt)
        .sort((a, b) => b.currentDebt - a.currentDebt);
    },
  })
);
