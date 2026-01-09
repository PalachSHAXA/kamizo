import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BuildingFull,
  BuildingDocument,
  Entrance,
  Apartment,
  Meter,
  MeterReading,
  Owner,
  Resident,
  PersonalAccount,
} from '../types';
import { buildingsApi, entrancesApi, buildingDocumentsApi, apartmentsApi, ownersApi, personalAccountsApi, crmResidentsApi, metersApi, meterReadingsApi } from '../services/api';

interface CRMState {
  // Data
  buildings: BuildingFull[];
  entrances: Entrance[];
  apartments: Apartment[];
  meters: Meter[];
  meterReadings: MeterReading[];
  owners: Owner[];
  residents: Resident[];
  personalAccounts: PersonalAccount[];

  // Loading states
  isLoadingBuildings: boolean;
  isLoadingEntrances: boolean;
  isLoadingApartments: boolean;
  isLoadingOwners: boolean;
  isLoadingAccounts: boolean;
  isLoadingResidents: boolean;
  isLoadingMeters: boolean;

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

  // API-driven apartment actions
  fetchApartmentsByBuilding: (buildingId: string, options?: { entranceId?: string; status?: string }) => Promise<Apartment[]>;
  fetchApartmentById: (id: string) => Promise<{ apartment: Apartment; owners: Owner[]; account: PersonalAccount | null } | null>;
  addApartment: (apartment: Omit<Apartment, 'id' | 'createdAt' | 'updatedAt' | 'meters'>) => Promise<Apartment | null>;
  updateApartment: (id: string, data: Partial<Apartment>) => Promise<void>;
  deleteApartment: (id: string) => Promise<void>;
  getApartmentsByBuilding: (buildingId: string) => Apartment[];
  getApartmentsByEntrance: (entranceId: string) => Apartment[];
  getApartmentById: (id: string) => Apartment | undefined;

  // API-driven meter actions
  fetchMetersByApartment: (apartmentId: string, options?: { type?: string; isActive?: boolean }) => Promise<Meter[]>;
  fetchMetersByBuilding: (buildingId: string, options?: { type?: string; isCommon?: boolean }) => Promise<Meter[]>;
  fetchMeterById: (id: string) => Promise<{ meter: Meter; readings: MeterReading[] } | null>;
  addMeter: (meter: Omit<Meter, 'id'>) => Promise<Meter | null>;
  updateMeter: (id: string, data: Partial<Meter>) => Promise<void>;
  deleteMeter: (id: string) => Promise<void>;
  decommissionMeter: (id: string, reason?: string) => Promise<void>;
  getMetersByApartment: (apartmentId: string) => Meter[];
  getCommonMetersByBuilding: (buildingId: string) => Meter[];

  // API-driven meter reading actions
  fetchMeterReadings: (meterId: string, options?: { limit?: number; offset?: number }) => Promise<MeterReading[]>;
  submitMeterReading: (meterId: string, reading: { value: number; readingDate?: string; photoUrl?: string }) => Promise<MeterReading | null>;
  verifyMeterReading: (readingId: string, approved: boolean, rejectionReason?: string) => Promise<void>;
  getMeterReadings: (meterId: string) => MeterReading[];
  getLastReading: (meterId: string) => MeterReading | undefined;

  // API-driven owner actions
  fetchOwners: (options?: { type?: string; search?: string }) => Promise<Owner[]>;
  fetchOwnerById: (id: string) => Promise<{ owner: Owner; apartments: Apartment[] } | null>;
  addOwner: (owner: Omit<Owner, 'id' | 'createdAt' | 'updatedAt' | 'tags'>) => Promise<Owner | null>;
  updateOwner: (id: string, data: Partial<Owner>) => Promise<void>;
  deleteOwner: (id: string) => Promise<void>;
  linkOwnerToApartment: (ownerId: string, apartmentId: string, data?: { ownershipShare?: number; isPrimary?: boolean }) => Promise<void>;
  unlinkOwnerFromApartment: (ownerId: string, apartmentId: string) => Promise<void>;
  getOwnerById: (id: string) => Owner | undefined;
  getOwnersByApartment: (apartmentId: string) => Owner[];
  searchOwners: (query: string) => Owner[];

  // API-driven resident actions
  fetchResidentsByApartment: (apartmentId: string, options?: { isActive?: boolean }) => Promise<Resident[]>;
  fetchResidentById: (id: string) => Promise<Resident | null>;
  addResident: (apartmentId: string, resident: Omit<Resident, 'id' | 'createdAt'>) => Promise<Resident | null>;
  updateResident: (id: string, data: Partial<Resident>) => Promise<void>;
  deleteResident: (id: string) => Promise<void>;
  moveOutResident: (id: string, data: { movedOutDate?: string; reason?: string }) => Promise<void>;
  getResidentsByApartment: (apartmentId: string) => Resident[];

  // API-driven personal account actions
  fetchAccountsByBuilding: (buildingId: string, options?: { status?: string; hasDebt?: boolean }) => Promise<PersonalAccount[]>;
  addPersonalAccount: (account: Omit<PersonalAccount, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PersonalAccount | null>;
  updatePersonalAccount: (id: string, data: Partial<PersonalAccount>) => Promise<void>;
  getPersonalAccountById: (id: string) => PersonalAccount | undefined;
  getPersonalAccountByApartment: (apartmentId: string) => PersonalAccount | undefined;
  getPersonalAccountsByBuilding: (buildingId: string) => PersonalAccount[];
  fetchDebtors: (options?: { minDebt?: number; buildingId?: string }) => Promise<PersonalAccount[]>;
  getDebtors: (minDebt?: number) => PersonalAccount[];

  // Stats
  getBuildingStats: () => {
    totalBuildings: number;
    totalApartments: number;
    totalResidents: number;
    totalOwners: number;
    totalDebt: number;
    avgCollectionRate: number;
  };
}

// Helper to map API response to frontend type
const mapBuildingFromApi = (b: any): BuildingFull => ({
  id: b.id,
  name: b.name,
  address: b.address,
  zone: b.zone,
  cadastralNumber: b.cadastral_number,
  branchCode: b.branch_code,
  buildingNumber: b.building_number,
  floors: b.floors || 0,
  entrances: b.entrances_count || 0,
  totalApartments: b.apartments_count || 0,
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

const mapEntranceFromApi = (e: any): Entrance => ({
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

const mapApartmentFromApi = (a: any): Apartment => ({
  id: a.id,
  buildingId: a.building_id,
  entranceId: a.entrance_id,
  number: a.number,
  floor: a.floor || 1,
  rooms: a.rooms || 1,
  totalArea: a.total_area || 0,
  livingArea: a.living_area || 0,
  kitchenArea: a.kitchen_area,
  balconyArea: a.balcony_area,
  loggiaArea: a.loggia_area,
  ceilingHeight: a.ceiling_height,
  hasBalcony: !!a.has_balcony,
  hasLoggia: !!a.has_loggia,
  hasStorage: !!a.has_storage,
  hasParking: !!a.has_parking,
  parkingNumber: a.parking_number,
  ownershipType: a.ownership_type || 'private',
  ownershipShare: a.ownership_share,
  registrationNumber: a.registration_number,
  registrationDate: a.registration_date,
  status: a.status || 'occupied',
  isCommercial: !!a.is_commercial,
  commercialType: a.commercial_type,
  meters: [],
  personalAccountId: a.personal_account_id,
  primaryOwnerId: a.primary_owner_id,
  notes: a.notes,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

const mapOwnerFromApi = (o: any): Owner => ({
  id: o.id,
  type: o.type || 'individual',
  lastName: o.last_name,
  firstName: o.first_name,
  middleName: o.middle_name,
  fullName: o.full_name,
  companyName: o.company_name,
  inn: o.inn,
  kpp: o.kpp,
  ogrn: o.ogrn,
  legalAddress: o.legal_address,
  directorName: o.director_name,
  passportSeries: o.passport_series,
  passportNumber: o.passport_number,
  passportIssuedBy: o.passport_issued_by,
  passportIssuedDate: o.passport_issued_date,
  birthDate: o.birth_date,
  birthPlace: o.birth_place,
  registrationAddress: o.registration_address,
  actualAddress: o.actual_address,
  phone: o.phone,
  additionalPhone: o.additional_phone,
  email: o.email,
  preferredContact: o.preferred_contact || 'phone',
  ownershipType: o.ownership_type || 'owner',
  ownershipShare: o.ownership_share || 100,
  ownershipDocument: o.ownership_document,
  ownershipDocumentDate: o.ownership_document_date,
  apartmentIds: o.apartment_ids ? JSON.parse(o.apartment_ids) : [],
  personalAccountIds: o.personal_account_ids ? JSON.parse(o.personal_account_ids) : [],
  isActive: o.is_active !== false && o.is_active !== 0,
  isVerified: !!o.is_verified,
  verifiedAt: o.verified_at,
  verifiedBy: o.verified_by,
  bankName: o.bank_name,
  bankBik: o.bank_bik,
  bankAccount: o.bank_account,
  tags: o.tags ? JSON.parse(o.tags) : [],
  notes: o.notes,
  createdAt: o.created_at,
  updatedAt: o.updated_at,
});

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

const mapMeterFromApi = (m: any): Meter => ({
  id: m.id,
  apartmentId: m.apartment_id,
  buildingId: m.building_id,
  type: m.type,
  serialNumber: m.serial_number,
  model: m.model,
  brand: m.brand,
  installDate: m.install_date,
  verificationDate: m.verification_date,
  nextVerificationDate: m.next_verification_date,
  sealNumber: m.seal_number,
  location: m.install_location,
  initialValue: m.initial_value || 0,
  currentValue: m.current_value || 0,
  lastReadingDate: m.last_reading_date,
  isActive: m.is_active !== false && m.is_active !== 0,
  isCommon: !!m.is_common,
  tariffZone: m.tariff_zone,
  notes: m.notes,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

const mapMeterReadingFromApi = (r: any): MeterReading => ({
  id: r.id,
  meterId: r.meter_id,
  value: r.value,
  previousValue: r.previous_value,
  consumption: r.consumption,
  readingDate: r.reading_date,
  source: r.source,
  submittedBy: r.submitted_by,
  submittedAt: r.submitted_at,
  isVerified: !!r.is_verified,
  verifiedBy: r.verified_by,
  verifiedAt: r.verified_at,
  photoUrl: r.photo_url,
  status: r.status,
  rejectionReason: r.rejection_reason,
  notes: r.notes,
  createdAt: r.created_at,
});

const mapResidentFromApi = (r: any): Resident => ({
  id: r.id,
  apartmentId: r.apartment_id,
  ownerId: r.owner_id,
  lastName: r.last_name,
  firstName: r.first_name,
  middleName: r.middle_name,
  fullName: r.full_name,
  birthDate: r.birth_date,
  residentType: r.resident_type || 'owner',
  relationToOwner: r.relation_to_owner,
  registrationType: r.registration_type || 'permanent',
  registrationDate: r.registration_date,
  registrationEndDate: r.registration_end_date,
  phone: r.phone,
  additionalPhone: r.additional_phone,
  email: r.email,
  isActive: r.is_active !== false && r.is_active !== 0,
  movedInDate: r.moved_in_date,
  movedOutDate: r.moved_out_date,
  movedOutReason: r.moved_out_reason,
  passportSeries: r.passport_series,
  passportNumber: r.passport_number,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const useCRMStore = create<CRMState>()(
  persist(
    (set, get) => ({
      // Initialize with empty arrays - will be loaded from API
      buildings: [],
      entrances: [],
      apartments: [],
      meters: [],
      meterReadings: [],
      owners: [],
      residents: [],
      personalAccounts: [],

      // Loading states
      isLoadingBuildings: false,
      isLoadingEntrances: false,
      isLoadingApartments: false,
      isLoadingOwners: false,
      isLoadingAccounts: false,
      isLoadingResidents: false,
      isLoadingMeters: false,

      // ========== API-DRIVEN BUILDING ACTIONS ==========

      fetchBuildings: async () => {
        console.log('[fetchBuildings] Starting...');
        set({ isLoadingBuildings: true });
        try {
          const response = await buildingsApi.getAll();
          console.log('[fetchBuildings] API response:', response);
          const buildings = (response.buildings || []).map(mapBuildingFromApi);
          console.log('[fetchBuildings] Mapped buildings:', buildings.length);
          set({ buildings, isLoadingBuildings: false });
        } catch (error) {
          console.error('[fetchBuildings] Failed:', error);
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
          console.error('Failed to fetch building:', error);
          return null;
        }
      },

      addBuilding: async (buildingData) => {
        try {
          const response = await buildingsApi.create(buildingData as any);
          if (response.building) {
            const newBuilding = mapBuildingFromApi(response.building);
            set((state) => ({ buildings: [...state.buildings, newBuilding] }));
            return newBuilding;
          }
          return null;
        } catch (error) {
          console.error('Failed to create building:', error);
          return null;
        }
      },

      updateBuilding: async (id, data) => {
        try {
          await buildingsApi.update(id, data as any);
          // Optimistic update
          set((state) => ({
            buildings: state.buildings.map((b) =>
              b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString() } : b
            ),
          }));
        } catch (error) {
          console.error('Failed to update building:', error);
        }
      },

      deleteBuilding: async (id) => {
        try {
          await buildingsApi.delete(id);
          set((state) => ({
            buildings: state.buildings.filter((b) => b.id !== id),
            entrances: state.entrances.filter((e) => e.buildingId !== id),
            apartments: state.apartments.filter((a) => a.buildingId !== id),
            personalAccounts: state.personalAccounts.filter((p) => p.buildingId !== id),
          }));
        } catch (error: any) {
          console.error('Failed to delete building:', error);
          throw new Error(error.message || 'Ошибка при удалении здания');
        }
      },

      getBuildingById: (id) => {
        return get().buildings.find((b) => b.id === id);
      },

      getBuildingWithStats: (id) => {
        const building = get().buildings.find((b) => b.id === id);
        if (!building) return undefined;

        const apartments = get().apartments.filter((a) => a.buildingId === id);
        const accounts = get().personalAccounts.filter((p) => p.buildingId === id);
        const residents = get().residents.filter((r) =>
          apartments.some((a) => a.id === r.apartmentId)
        );

        return {
          ...building,
          totalApartments: apartments.length || building.totalApartments,
          residentsCount: residents.length || building.residentsCount,
          ownersCount: get().owners.filter((o) =>
            o.apartmentIds.some((aId) => apartments.some((a) => a.id === aId))
          ).length || building.ownersCount,
          totalDebt: accounts.reduce((sum, a) => sum + a.currentDebt, 0) || building.totalDebt,
          vacantApartments: apartments.filter((a) => a.status === 'vacant').length || building.vacantApartments,
        };
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
          console.error('Failed to add document:', error);
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
          console.error('Failed to delete document:', error);
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
          console.error('Failed to fetch entrances:', error);
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
          console.error('Failed to create entrance:', error);
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
          console.error('Failed to update entrance:', error);
        }
      },

      deleteEntrance: async (id) => {
        try {
          await entrancesApi.delete(id);
          set((state) => ({
            entrances: state.entrances.filter((e) => e.id !== id),
            apartments: state.apartments.filter((a) => a.entranceId !== id),
          }));
        } catch (error) {
          console.error('Failed to delete entrance:', error);
        }
      },

      getEntrancesByBuilding: (buildingId) => {
        return get().entrances.filter((e) => e.buildingId === buildingId);
      },

      // ========== API-DRIVEN APARTMENT ACTIONS ==========

      fetchApartmentsByBuilding: async (buildingId: string, options?: { entranceId?: string; status?: string }) => {
        set({ isLoadingApartments: true });
        try {
          const response = await apartmentsApi.getByBuilding(buildingId, options);
          const apartments = (response.apartments || []).map(mapApartmentFromApi);

          // Replace apartments for this building
          set((state) => {
            const otherApartments = state.apartments.filter((a) => a.buildingId !== buildingId);
            return { apartments: [...otherApartments, ...apartments], isLoadingApartments: false };
          });

          return apartments;
        } catch (error) {
          console.error('Failed to fetch apartments:', error);
          set({ isLoadingApartments: false });
          return [];
        }
      },

      fetchApartmentById: async (id: string) => {
        try {
          const response = await apartmentsApi.getById(id);
          if (!response.apartment) return null;

          const apartment = mapApartmentFromApi(response.apartment);
          const owners = (response.owners || []).map(mapOwnerFromApi);
          const account = response.personalAccount ? mapAccountFromApi(response.personalAccount) : null;

          // Update local state
          set((state) => {
            const updatedApartments = state.apartments.some((a) => a.id === id)
              ? state.apartments.map((a) => (a.id === id ? apartment : a))
              : [...state.apartments, apartment];

            return { apartments: updatedApartments };
          });

          return { apartment, owners, account };
        } catch (error) {
          console.error('Failed to fetch apartment:', error);
          return null;
        }
      },

      addApartment: async (apartmentData) => {
        try {
          const response = await apartmentsApi.create(apartmentData.buildingId, {
            number: apartmentData.number,
            entranceId: apartmentData.entranceId,
            floor: apartmentData.floor,
            totalArea: apartmentData.totalArea,
            livingArea: apartmentData.livingArea,
            kitchenArea: apartmentData.kitchenArea,
            rooms: apartmentData.rooms,
            hasBalcony: apartmentData.hasBalcony,
            hasLoggia: apartmentData.hasLoggia,
            status: apartmentData.status,
          });
          if (response.apartment) {
            const newApartment = mapApartmentFromApi(response.apartment);
            set((state) => ({ apartments: [...state.apartments, newApartment] }));
            return newApartment;
          }
          return null;
        } catch (error) {
          console.error('Failed to create apartment:', error);
          return null;
        }
      },

      updateApartment: async (id, data) => {
        try {
          await apartmentsApi.update(id, data as any);
          set((state) => ({
            apartments: state.apartments.map((a) =>
              a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a
            ),
          }));
        } catch (error) {
          console.error('Failed to update apartment:', error);
        }
      },

      deleteApartment: async (id) => {
        try {
          await apartmentsApi.delete(id);
          set((state) => ({
            apartments: state.apartments.filter((a) => a.id !== id),
            meters: state.meters.filter((m) => m.apartmentId !== id),
            residents: state.residents.filter((r) => r.apartmentId !== id),
            personalAccounts: state.personalAccounts.filter((p) => p.apartmentId !== id),
          }));
        } catch (error) {
          console.error('Failed to delete apartment:', error);
        }
      },

      getApartmentsByBuilding: (buildingId) => {
        return get().apartments.filter((a) => a.buildingId === buildingId);
      },

      getApartmentsByEntrance: (entranceId) => {
        return get().apartments.filter((a) => a.entranceId === entranceId);
      },

      getApartmentById: (id) => {
        return get().apartments.find((a) => a.id === id);
      },

      // ========== API-DRIVEN METER ACTIONS ==========

      fetchMetersByApartment: async (apartmentId: string, options?: { type?: string; isActive?: boolean }) => {
        set({ isLoadingMeters: true });
        try {
          const response = await metersApi.getByApartment(apartmentId, options);
          const meters = (response.meters || []).map(mapMeterFromApi);

          // Replace meters for this apartment
          set((state) => {
            const otherMeters = state.meters.filter((m) => m.apartmentId !== apartmentId);
            return { meters: [...otherMeters, ...meters], isLoadingMeters: false };
          });

          return meters;
        } catch (error) {
          console.error('Failed to fetch meters:', error);
          set({ isLoadingMeters: false });
          return [];
        }
      },

      fetchMetersByBuilding: async (buildingId: string, options?: { type?: string; isCommon?: boolean }) => {
        set({ isLoadingMeters: true });
        try {
          const response = await metersApi.getByBuilding(buildingId, options);
          const meters = (response.meters || []).map(mapMeterFromApi);

          // Replace building meters
          set((state) => {
            const otherMeters = state.meters.filter((m) => m.buildingId !== buildingId);
            return { meters: [...otherMeters, ...meters], isLoadingMeters: false };
          });

          return meters;
        } catch (error) {
          console.error('Failed to fetch building meters:', error);
          set({ isLoadingMeters: false });
          return [];
        }
      },

      fetchMeterById: async (id: string) => {
        try {
          const response = await metersApi.getById(id);
          if (!response.meter) return null;

          const meter = mapMeterFromApi(response.meter);
          const readings = (response.readings || []).map(mapMeterReadingFromApi);

          // Update local state
          set((state) => {
            const updatedMeters = state.meters.some((m) => m.id === id)
              ? state.meters.map((m) => (m.id === id ? meter : m))
              : [...state.meters, meter];

            // Replace readings for this meter
            const otherReadings = state.meterReadings.filter((r) => r.meterId !== id);
            return { meters: updatedMeters, meterReadings: [...otherReadings, ...readings] };
          });

          return { meter, readings };
        } catch (error) {
          console.error('Failed to fetch meter:', error);
          return null;
        }
      },

      addMeter: async (meterData) => {
        try {
          const response = await metersApi.create({
            apartmentId: meterData.apartmentId,
            buildingId: meterData.buildingId,
            type: meterData.type as any,
            isCommon: meterData.isCommon,
            serialNumber: meterData.serialNumber,
            model: meterData.model,
            brand: meterData.brand,
            installDate: meterData.installDate,
            location: meterData.location,
            initialValue: meterData.initialValue,
            verificationDate: meterData.verificationDate,
            nextVerificationDate: meterData.nextVerificationDate,
            sealNumber: meterData.sealNumber,
          });
          if (response.meter) {
            const newMeter = mapMeterFromApi(response.meter);
            set((state) => ({ meters: [...state.meters, newMeter] }));
            return newMeter;
          }
          return null;
        } catch (error) {
          console.error('Failed to create meter:', error);
          return null;
        }
      },

      updateMeter: async (id, data) => {
        try {
          await metersApi.update(id, data as any);
          set((state) => ({
            meters: state.meters.map((m) =>
              m.id === id ? { ...m, ...data, updatedAt: new Date().toISOString() } : m
            ),
          }));
        } catch (error) {
          console.error('Failed to update meter:', error);
        }
      },

      deleteMeter: async (id) => {
        try {
          await metersApi.delete(id);
          set((state) => ({
            meters: state.meters.filter((m) => m.id !== id),
            meterReadings: state.meterReadings.filter((r) => r.meterId !== id),
          }));
        } catch (error) {
          console.error('Failed to delete meter:', error);
        }
      },

      decommissionMeter: async (id, reason) => {
        try {
          await metersApi.decommission(id, reason);
          set((state) => ({
            meters: state.meters.map((m) =>
              m.id === id ? { ...m, isActive: false } : m
            ),
          }));
        } catch (error) {
          console.error('Failed to decommission meter:', error);
        }
      },

      getMetersByApartment: (apartmentId) => {
        return get().meters.filter((m) => m.apartmentId === apartmentId);
      },

      getCommonMetersByBuilding: (buildingId) => {
        return get().meters.filter((m) => m.buildingId === buildingId && m.isCommon);
      },

      // ========== API-DRIVEN METER READING ACTIONS ==========

      fetchMeterReadings: async (meterId: string, options?: { limit?: number; offset?: number }) => {
        try {
          const response = await meterReadingsApi.getByMeter(meterId, options);
          const readings = (response.readings || []).map(mapMeterReadingFromApi);

          // Replace readings for this meter
          set((state) => {
            const otherReadings = state.meterReadings.filter((r) => r.meterId !== meterId);
            return { meterReadings: [...otherReadings, ...readings] };
          });

          return readings;
        } catch (error) {
          console.error('Failed to fetch meter readings:', error);
          return [];
        }
      },

      submitMeterReading: async (meterId, readingData) => {
        try {
          const response = await meterReadingsApi.submit(meterId, readingData);
          if (response.reading) {
            const newReading = mapMeterReadingFromApi(response.reading);

            // Update meter's current value and add reading to state
            set((state) => ({
              meterReadings: [...state.meterReadings, newReading],
              meters: state.meters.map((m) =>
                m.id === meterId
                  ? {
                      ...m,
                      currentValue: readingData.value,
                      lastReadingDate: readingData.readingDate || new Date().toISOString().split('T')[0],
                    }
                  : m
              ),
            }));

            return newReading;
          }
          return null;
        } catch (error) {
          console.error('Failed to submit meter reading:', error);
          return null;
        }
      },

      verifyMeterReading: async (readingId, approved, rejectionReason) => {
        try {
          await meterReadingsApi.verify(readingId, { approved, rejectionReason });

          set((state) => ({
            meterReadings: state.meterReadings.map((r) =>
              r.id === readingId
                ? { ...r, isVerified: approved, status: approved ? 'approved' : 'rejected', rejectionReason }
                : r
            ),
          }));
        } catch (error) {
          console.error('Failed to verify meter reading:', error);
        }
      },

      getMeterReadings: (meterId) => {
        return get()
          .meterReadings.filter((r) => r.meterId === meterId)
          .sort((a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime());
      },

      getLastReading: (meterId) => {
        const readings = get().getMeterReadings(meterId);
        return readings.length > 0 ? readings[0] : undefined;
      },

      // ========== API-DRIVEN OWNER ACTIONS ==========

      fetchOwners: async (options?: { type?: string; search?: string }) => {
        set({ isLoadingOwners: true });
        try {
          const response = await ownersApi.getAll(options);
          const owners = (response.owners || []).map(mapOwnerFromApi);
          set({ owners, isLoadingOwners: false });
          return owners;
        } catch (error) {
          console.error('Failed to fetch owners:', error);
          set({ isLoadingOwners: false });
          return [];
        }
      },

      fetchOwnerById: async (id: string) => {
        try {
          const response = await ownersApi.getById(id);
          if (!response.owner) return null;

          const owner = mapOwnerFromApi(response.owner);
          const apartments = (response.apartments || []).map(mapApartmentFromApi);

          // Update local state
          set((state) => {
            const updatedOwners = state.owners.some((o) => o.id === id)
              ? state.owners.map((o) => (o.id === id ? owner : o))
              : [...state.owners, owner];
            return { owners: updatedOwners };
          });

          return { owner, apartments };
        } catch (error) {
          console.error('Failed to fetch owner:', error);
          return null;
        }
      },

      addOwner: async (ownerData) => {
        try {
          const response = await ownersApi.create({
            type: ownerData.type,
            lastName: ownerData.lastName,
            firstName: ownerData.firstName,
            middleName: ownerData.middleName,
            fullName: ownerData.fullName,
            phone: ownerData.phone,
            email: ownerData.email,
            ownershipType: ownerData.ownershipType,
            ownershipShare: ownerData.ownershipShare,
          });
          if (response.owner) {
            const newOwner = mapOwnerFromApi(response.owner);
            set((state) => ({ owners: [...state.owners, newOwner] }));
            return newOwner;
          }
          return null;
        } catch (error) {
          console.error('Failed to create owner:', error);
          return null;
        }
      },

      updateOwner: async (id, data) => {
        try {
          await ownersApi.update(id, data as any);
          set((state) => ({
            owners: state.owners.map((o) =>
              o.id === id ? { ...o, ...data, updatedAt: new Date().toISOString() } : o
            ),
          }));
        } catch (error) {
          console.error('Failed to update owner:', error);
        }
      },

      deleteOwner: async (id) => {
        try {
          await ownersApi.delete(id);
          set((state) => ({
            owners: state.owners.filter((o) => o.id !== id),
          }));
        } catch (error) {
          console.error('Failed to delete owner:', error);
        }
      },

      linkOwnerToApartment: async (ownerId, apartmentId, data) => {
        try {
          await ownersApi.linkToApartment(ownerId, apartmentId, data);
          // Update local state - add apartment to owner's apartmentIds
          set((state) => ({
            owners: state.owners.map((o) =>
              o.id === ownerId
                ? { ...o, apartmentIds: [...(o.apartmentIds || []), apartmentId] }
                : o
            ),
          }));
        } catch (error) {
          console.error('Failed to link owner to apartment:', error);
        }
      },

      unlinkOwnerFromApartment: async (ownerId, apartmentId) => {
        try {
          await ownersApi.unlinkFromApartment(ownerId, apartmentId);
          set((state) => ({
            owners: state.owners.map((o) =>
              o.id === ownerId
                ? { ...o, apartmentIds: (o.apartmentIds || []).filter((id) => id !== apartmentId) }
                : o
            ),
          }));
        } catch (error) {
          console.error('Failed to unlink owner from apartment:', error);
        }
      },

      getOwnerById: (id) => {
        return get().owners.find((o) => o.id === id);
      },

      getOwnersByApartment: (apartmentId) => {
        return get().owners.filter((o) => o.apartmentIds?.includes(apartmentId));
      },

      searchOwners: (query) => {
        const lowerQuery = query.toLowerCase();
        return get().owners.filter(
          (o) =>
            o.fullName?.toLowerCase().includes(lowerQuery) ||
            o.phone?.includes(query) ||
            o.email?.toLowerCase().includes(lowerQuery)
        );
      },

      // ========== API-DRIVEN RESIDENT ACTIONS ==========

      fetchResidentsByApartment: async (apartmentId: string, options?: { isActive?: boolean }) => {
        set({ isLoadingResidents: true });
        try {
          const response = await crmResidentsApi.getByApartment(apartmentId, options);
          const residents = (response.residents || []).map(mapResidentFromApi);

          // Replace residents for this apartment
          set((state) => {
            const otherResidents = state.residents.filter((r) => r.apartmentId !== apartmentId);
            return { residents: [...otherResidents, ...residents], isLoadingResidents: false };
          });

          return residents;
        } catch (error) {
          console.error('Failed to fetch residents:', error);
          set({ isLoadingResidents: false });
          return [];
        }
      },

      fetchResidentById: async (id: string) => {
        try {
          const response = await crmResidentsApi.getById(id);
          if (!response.resident) return null;

          const resident = mapResidentFromApi(response.resident);

          // Update local state
          set((state) => {
            const updatedResidents = state.residents.some((r) => r.id === id)
              ? state.residents.map((r) => (r.id === id ? resident : r))
              : [...state.residents, resident];
            return { residents: updatedResidents };
          });

          return resident;
        } catch (error) {
          console.error('Failed to fetch resident:', error);
          return null;
        }
      },

      addResident: async (apartmentId, residentData) => {
        try {
          const response = await crmResidentsApi.create(apartmentId, {
            lastName: residentData.lastName,
            firstName: residentData.firstName,
            middleName: residentData.middleName,
            fullName: residentData.fullName,
            birthDate: residentData.birthDate,
            residentType: residentData.residentType,
            relationToOwner: residentData.relationToOwner,
            registrationType: residentData.registrationType,
            registrationDate: residentData.registrationDate,
            phone: residentData.phone,
            email: residentData.email,
            movedInDate: residentData.movedInDate,
            ownerId: residentData.ownerId,
          });
          if (response.resident) {
            const newResident = mapResidentFromApi(response.resident);
            set((state) => ({ residents: [...state.residents, newResident] }));
            return newResident;
          }
          return null;
        } catch (error) {
          console.error('Failed to create resident:', error);
          return null;
        }
      },

      updateResident: async (id, data) => {
        try {
          await crmResidentsApi.update(id, data as any);
          set((state) => ({
            residents: state.residents.map((r) =>
              r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
            ),
          }));
        } catch (error) {
          console.error('Failed to update resident:', error);
        }
      },

      deleteResident: async (id) => {
        try {
          await crmResidentsApi.delete(id);
          set((state) => ({
            residents: state.residents.filter((r) => r.id !== id),
          }));
        } catch (error) {
          console.error('Failed to delete resident:', error);
        }
      },

      moveOutResident: async (id, data) => {
        try {
          await crmResidentsApi.moveOut(id, data);
          set((state) => ({
            residents: state.residents.map((r) =>
              r.id === id ? { ...r, isActive: false, movedOutDate: data.movedOutDate, movedOutReason: data.reason } : r
            ),
          }));
        } catch (error) {
          console.error('Failed to move out resident:', error);
        }
      },

      getResidentsByApartment: (apartmentId) => {
        return get().residents.filter((r) => r.apartmentId === apartmentId);
      },

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

      // Stats
      getBuildingStats: () => {
        const { buildings, apartments, residents, owners, personalAccounts } = get();
        const totalDebt = personalAccounts.reduce((sum, a) => sum + a.currentDebt, 0);
        const totalCollectionRates = buildings.reduce((sum, b) => sum + b.collectionRate, 0);

        return {
          totalBuildings: buildings.length,
          totalApartments: apartments.length,
          totalResidents: residents.length,
          totalOwners: owners.length,
          totalDebt,
          avgCollectionRate: buildings.length > 0 ? totalCollectionRates / buildings.length : 0,
        };
      },
    }),
    {
      name: 'uk-crm-storage',
      version: 4, // Increment to clear old cache - all data now comes from API
      // Do NOT persist data that should come from API
      // Only persist UI state if needed
      partialize: () => ({
        // All data now loaded from API - no local caching
        // This ensures data is consistent across all browsers/devices
      }),
      // Migration to add branchCode and fix duplicate IDs
      migrate: (persistedState: unknown, _version: number) => {
        const state = persistedState as Partial<CRMState>;

        // Helper function to extract building number from address
        // Supports: "8Б-уй", "дом 8Б", "д. 8Б", "8B-уй", etc.
        const extractBuildingFromAddress = (address: string): string => {
          if (!address) return '';

          // Uzbek format: "8Б-уй" or "уй 8Б"
          const uzMatch = address.match(/(\d+[А-Яа-яA-Za-z]?)-уй|уй\s*(\d+[А-Яа-яA-Za-z]?)/i);
          if (uzMatch) {
            const num = (uzMatch[1] || uzMatch[2]).toUpperCase();
            // Convert Cyrillic to Latin: Б -> B, А -> A
            return num.replace(/Б/gi, 'B').replace(/А/gi, 'A');
          }

          // Russian format: "дом 8Б", "д. 8Б"
          const ruMatch = address.match(/(?:дом|д\.?)\s*(\d+[А-Яа-яA-Za-z]?)/i);
          if (ruMatch) {
            const num = ruMatch[1].toUpperCase();
            return num.replace(/Б/gi, 'B').replace(/А/gi, 'A');
          }

          return '';
        };

        if (state.buildings) {
          // Ensure each building has unique ID, branchCode and buildingNumber
          const seenIds = new Set<string>();
          state.buildings = state.buildings.map((building, index) => {
            let updatedBuilding = { ...building };

            // Fix duplicate or missing IDs
            if (!updatedBuilding.id || seenIds.has(updatedBuilding.id)) {
              updatedBuilding.id = `building_${Date.now()}_${index}`;
            }
            seenIds.add(updatedBuilding.id);

            // Add branchCode if missing
            if (!updatedBuilding.branchCode) {
              updatedBuilding.branchCode = updatedBuilding.name?.includes('Юнусабад') ? 'YS' :
                                           updatedBuilding.name?.includes('Чиланзар') ? 'CH' :
                                           updatedBuilding.name?.includes('Сергели') ? 'SR' :
                                           'YS';
            }

            // Add buildingNumber if missing - try to extract from address first
            if (!updatedBuilding.buildingNumber) {
              const extractedNumber = extractBuildingFromAddress(updatedBuilding.address || '');
              updatedBuilding.buildingNumber = extractedNumber || `${index + 1}A`;
            }

            return updatedBuilding;
          });
        }
        return state as CRMState;
      },
    }
  )
);
