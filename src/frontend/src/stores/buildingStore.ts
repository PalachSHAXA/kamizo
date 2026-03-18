import { create } from 'zustand';
import type {
  BuildingFull,
  BuildingDocument,
  Entrance,
} from '../types';
import { buildingsApi, entrancesApi, buildingDocumentsApi } from '../services/api';
import { useToastStore } from './toastStore';

// Helper to map API response to frontend type
const mapBuildingFromApi = (b: Record<string, unknown>): BuildingFull => ({
  id: b.id,
  name: b.name,
  address: b.address,
  zone: b.zone,
  cadastralNumber: b.cadastral_number,
  branchCode: b.branch_code,
  buildingNumber: b.building_number,
  floors: b.floors || 0,
  entrances: b.entrances_actual ?? b.entrances_count ?? 0,
  totalApartments: b.apartments_actual ?? b.apartments_count ?? 0,
  totalArea: b.total_area || 0,
  livingArea: b.living_area || 0,
  commonArea: b.common_area || 0,
  landArea: b.land_area,
  yearBuilt: b.year_built || 0,
  yearRenovated: b.year_renovated,
  buildingType: b.building_type || 'monolith',
  roofType: b.roof_type || 'flat',
  wallMaterial: b.wall_material || '',
  foundationType: b.foundation_type || '',
  hasElevator: !!b.has_elevator,
  elevatorCount: b.elevator_count || 0,
  hasGas: !!b.has_gas,
  heatingType: b.heating_type || 'central',
  hasHotWater: !!b.has_hot_water,
  waterSupplyType: b.water_supply_type || 'central',
  sewerageType: b.sewerage_type || 'central',
  hasIntercom: !!b.has_intercom,
  hasVideoSurveillance: !!b.has_video_surveillance,
  hasConcierge: !!b.has_concierge,
  hasParkingLot: !!b.has_parking_lot,
  parkingSpaces: b.parking_spaces || 0,
  hasPlayground: !!b.has_playground,
  managerId: b.manager_id,
  managerName: b.manager_name,
  managementStartDate: b.management_start_date,
  contractNumber: b.contract_number,
  contractEndDate: b.contract_end_date,
  monthlyBudget: b.monthly_budget || 0,
  reserveFund: b.reserve_fund || 0,
  totalDebt: b.total_debt || 0,
  collectionRate: b.collection_rate || 0,
  residentsCount: b.residents_count || 0,
  ownersCount: b.owners_count || 0,
  tenantsCount: b.tenants_count || 0,
  vacantApartments: b.vacant_apartments || 0,
  activeRequestsCount: b.active_requests_count || 0,
  documents: [],
  createdAt: b.created_at,
  updatedAt: b.updated_at,
});

const mapEntranceFromApi = (e: Record<string, unknown>): Entrance => ({
  id: e.id,
  buildingId: e.building_id,
  number: e.number,
  floorsFrom: e.floors_from || 1,
  floorsTo: e.floors_to,
  apartmentsFrom: e.apartments_from,
  apartmentsTo: e.apartments_to,
  hasElevator: !!e.has_elevator,
  elevatorId: e.elevator_id,
  intercomType: e.intercom_type,
  intercomCode: e.intercom_code,
  cleaningSchedule: e.cleaning_schedule,
  responsibleId: e.responsible_id,
  lastInspection: e.last_inspection,
  notes: e.notes,
});

interface BuildingState {
  // Data
  buildings: BuildingFull[];
  entrances: Entrance[];

  // Loading states
  isLoadingBuildings: boolean;
  isLoadingEntrances: boolean;

  // API-driven building actions
  fetchBuildings: () => Promise<void>;
  fetchBuildingById: (id: string) => Promise<{ building: BuildingFull; entrances: Entrance[]; documents: BuildingDocument[] } | null>;
  addBuilding: (building: Omit<BuildingFull, 'id' | 'createdAt' | 'updatedAt' | 'documents'>) => Promise<BuildingFull | null>;
  updateBuilding: (id: string, data: Partial<BuildingFull>) => Promise<void>;
  deleteBuilding: (id: string) => Promise<void>;
  getBuildingById: (id: string) => BuildingFull | undefined;
  getBuildingWithStats: (id: string) => BuildingFull | undefined;

  // API-driven building document actions
  addBuildingDocument: (buildingId: string, doc: Omit<BuildingDocument, 'id' | 'buildingId' | 'uploadedAt'>) => Promise<void>;
  deleteBuildingDocument: (buildingId: string, docId: string) => Promise<void>;

  // API-driven entrance actions
  fetchEntrancesByBuilding: (buildingId: string) => Promise<Entrance[]>;
  addEntrance: (entrance: Omit<Entrance, 'id'>) => Promise<Entrance | null>;
  updateEntrance: (id: string, data: Partial<Entrance>) => Promise<void>;
  deleteEntrance: (id: string) => Promise<void>;
  getEntrancesByBuilding: (buildingId: string) => Entrance[];
}

export const useBuildingStore = create<BuildingState>()(
  (set, get) => ({
    // Initialize with empty arrays - will be loaded from API
    buildings: [],
    entrances: [],

    // Loading states
    isLoadingBuildings: false,
    isLoadingEntrances: false,

    // ========== API-DRIVEN BUILDING ACTIONS ==========

    fetchBuildings: async () => {
      set({ isLoadingBuildings: true });
      try {
        const response = await buildingsApi.getAll();
        const buildings = (response.buildings || []).map(mapBuildingFromApi);
        set({ buildings, isLoadingBuildings: false });
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка загрузки зданий');
        set({ isLoadingBuildings: false });
      }
    },

    fetchBuildingById: async (id: string) => {
      try {
        const response = await buildingsApi.getById(id);
        if (!response.building) return null;

        const building = mapBuildingFromApi(response.building);
        const entrances = (response.entrances || []).map(mapEntranceFromApi);
        const documents = response.documents || [];

        // Update local state with this building's data
        set((state) => {
          const updatedBuildings = state.buildings.some((b) => b.id === id)
            ? state.buildings.map((b) => (b.id === id ? { ...building, documents } : b))
            : [...state.buildings, { ...building, documents }];

          // Merge entrances (replace for this building, keep others)
          const otherEntrances = state.entrances.filter((e) => e.buildingId !== id);
          const updatedEntrances = [...otherEntrances, ...entrances];

          return { buildings: updatedBuildings, entrances: updatedEntrances };
        });

        return { building: { ...building, documents }, entrances, documents };
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        return null;
      }
    },

    addBuilding: async (buildingData) => {
      try {
        const response = await buildingsApi.create(buildingData as Record<string, unknown>); // TODO: type this properly
        if (response.building) {
          const newBuilding = mapBuildingFromApi(response.building);
          set((state) => ({ buildings: [...state.buildings, newBuilding] }));
          return newBuilding;
        }
        return null;
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        return null;
      }
    },

    updateBuilding: async (id, data) => {
      try {
        await buildingsApi.update(id, data as Record<string, unknown>); // TODO: type this properly
        // Optimistic update
        set((state) => ({
          buildings: state.buildings.map((b) =>
            b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString() } : b
          ),
        }));
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    deleteBuilding: async (id) => {
      try {
        await buildingsApi.delete(id);
        set((state) => ({
          buildings: state.buildings.filter((b) => b.id !== id),
          entrances: state.entrances.filter((e) => e.buildingId !== id),
        }));
      } catch (err: unknown) {
        useToastStore.getState().addToast('error', (err as Error).message || 'Ошибка');
        throw new Error((err as Error).message || 'Ошибка при удалении здания');
      }
    },

    getBuildingById: (id) => {
      return get().buildings.find((b) => b.id === id);
    },

    getBuildingWithStats: (id) => {
      const building = get().buildings.find((b) => b.id === id);
      if (!building) return undefined;
      // Note: This returns building data only from this store.
      // Cross-store stats (apartments, residents, owners, accounts) are computed in the facade.
      return building;
    },

    // ========== API-DRIVEN DOCUMENT ACTIONS ==========

    addBuildingDocument: async (buildingId, docData) => {
      try {
        const response = await buildingDocumentsApi.create(buildingId, {
          name: docData.name,
          type: docData.type,
          fileUrl: docData.fileUrl,
          fileSize: docData.fileSize,
          expiresAt: docData.expiresAt,
        });
        if (response.document) {
          // Optimistic update
          const newDoc: BuildingDocument = {
            ...docData,
            id: response.document.id,
            buildingId,
            uploadedAt: response.document.uploaded_at || new Date().toISOString(),
          };
          set((state) => ({
            buildings: state.buildings.map((b) =>
              b.id === buildingId
                ? { ...b, documents: [...(b.documents || []), newDoc] }
                : b
            ),
          }));
        }
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    deleteBuildingDocument: async (buildingId, docId) => {
      try {
        await buildingDocumentsApi.delete(docId);
        set((state) => ({
          buildings: state.buildings.map((b) =>
            b.id === buildingId
              ? { ...b, documents: (b.documents || []).filter((d) => d.id !== docId) }
              : b
          ),
        }));
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    // ========== API-DRIVEN ENTRANCE ACTIONS ==========

    fetchEntrancesByBuilding: async (buildingId: string) => {
      set({ isLoadingEntrances: true });
      try {
        const response = await entrancesApi.getByBuilding(buildingId);
        const entrances = (response.entrances || []).map(mapEntranceFromApi);

        // Replace entrances for this building, keep others
        set((state) => {
          const otherEntrances = state.entrances.filter((e) => e.buildingId !== buildingId);
          return { entrances: [...otherEntrances, ...entrances], isLoadingEntrances: false };
        });

        return entrances;
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        set({ isLoadingEntrances: false });
        return [];
      }
    },

    addEntrance: async (entranceData) => {
      try {
        const response = await entrancesApi.create(entranceData.buildingId, {
          number: entranceData.number,
          floorsFrom: entranceData.floorsFrom,
          floorsTo: entranceData.floorsTo,
          apartmentsFrom: entranceData.apartmentsFrom,
          apartmentsTo: entranceData.apartmentsTo,
          hasElevator: entranceData.hasElevator,
          elevatorId: entranceData.elevatorId,
          intercomType: entranceData.intercomType,
          intercomCode: entranceData.intercomCode,
          cleaningSchedule: entranceData.cleaningSchedule,
          responsibleId: entranceData.responsibleId,
          notes: entranceData.notes,
        });
        if (response.entrance) {
          const newEntrance = mapEntranceFromApi(response.entrance);
          set((state) => ({ entrances: [...state.entrances, newEntrance] }));
          return newEntrance;
        }
        return null;
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
        return null;
      }
    },

    updateEntrance: async (id, data) => {
      try {
        await entrancesApi.update(id, data);
        set((state) => ({
          entrances: state.entrances.map((e) =>
            e.id === id ? { ...e, ...data } : e
          ),
        }));
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    deleteEntrance: async (id) => {
      try {
        await entrancesApi.delete(id);
        set((state) => ({
          entrances: state.entrances.filter((e) => e.id !== id),
        }));
      } catch (error) {
        useToastStore.getState().addToast('error', (error as Error).message || 'Ошибка');
      }
    },

    getEntrancesByBuilding: (buildingId) => {
      return get().entrances.filter((e) => e.buildingId === buildingId);
    },
  })
);
