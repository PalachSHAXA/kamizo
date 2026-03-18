import { create } from 'zustand';
import type {
  Apartment,
  Owner,
  Resident,
  PersonalAccount,
} from '../types';
import { apartmentsApi, ownersApi, crmResidentsApi } from '../services/api';

const mapApartmentFromApi = (a: Record<string, unknown>): Apartment => ({
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

const mapOwnerFromApi = (o: Record<string, unknown>): Owner => ({
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

const mapAccountFromApi = (a: Record<string, unknown>): PersonalAccount => ({
  id: a.id,
  number: a.number,
  apartmentId: a.apartment_id,
  buildingId: a.building_id,
  primaryOwnerId: a.primary_owner_id,
  ownerName: a.owner_name,
  apartmentNumber: a.apartment_number,
  address: a.address,
  totalArea: (a.total_area as number) || 0,
  residentsCount: (a.residents_count as number) || 0,
  registeredCount: (a.registered_count as number) || 0,
  balance: (a.balance as number) || 0,
  currentDebt: (a.current_debt as number) || 0,
  penaltyAmount: (a.penalty_amount as number) || 0,
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
  status: (a.status as string) || 'active',
  closedAt: a.closed_at,
  closedReason: a.closed_reason,
  notes: a.notes,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
} as PersonalAccount);

const mapResidentFromApi = (r: Record<string, unknown>): Resident => ({
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

interface ApartmentState {
  // Data
  apartments: Apartment[];
  owners: Owner[];
  residents: Resident[];

  // Loading states
  isLoadingApartments: boolean;
  isLoadingOwners: boolean;
  isLoadingResidents: boolean;

  // API-driven apartment actions
  fetchApartmentsByBuilding: (buildingId: string, options?: { entranceId?: string; status?: string }) => Promise<Apartment[]>;
  fetchApartmentById: (id: string) => Promise<{ apartment: Apartment; owners: Owner[]; account: PersonalAccount | null } | null>;
  addApartment: (apartment: Omit<Apartment, 'id' | 'createdAt' | 'updatedAt' | 'meters'>) => Promise<Apartment | null>;
  updateApartment: (id: string, data: Partial<Apartment>) => Promise<void>;
  deleteApartment: (id: string) => Promise<void>;
  getApartmentsByBuilding: (buildingId: string) => Apartment[];
  getApartmentsByEntrance: (entranceId: string) => Apartment[];
  getApartmentById: (id: string) => Apartment | undefined;

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
}

export const useApartmentStore = create<ApartmentState>()(
  (set, get) => ({
    // Initialize with empty arrays
    apartments: [],
    owners: [],
    residents: [],

    // Loading states
    isLoadingApartments: false,
    isLoadingOwners: false,
    isLoadingResidents: false,

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
        await apartmentsApi.update(id, data as Record<string, unknown>); // TODO: type this properly
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
          residents: state.residents.filter((r) => r.apartmentId !== id),
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
        await ownersApi.update(id, data as Record<string, unknown>); // TODO: type this properly
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
        await crmResidentsApi.update(id, data as Record<string, unknown>); // TODO: type this properly
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
  })
);
