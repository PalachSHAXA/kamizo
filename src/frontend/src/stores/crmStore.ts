/**
 * CRM Store - Backward-compatible facade
 *
 * This file re-exports all split CRM stores and provides a unified
 * useCRMStore hook for backward compatibility with existing consumers.
 *
 * New code should import from the individual stores directly:
 *   - useBuildingStore  (buildingStore.ts)  - buildings, entrances, documents
 *   - useApartmentStore (apartmentStore.ts) - apartments, owners, residents
 *   - useMeterStore     (meterStore.ts)     - meters, meter readings
 *   - useAccountStore   (accountStore.ts)   - personal accounts, debtors
 */

export { useBuildingStore } from './buildingStore';
export { useApartmentStore } from './apartmentStore';
export { useMeterStore } from './meterStore';
export { useAccountStore } from './accountStore';

import { useBuildingStore } from './buildingStore';
import { useApartmentStore } from './apartmentStore';
import { useMeterStore } from './meterStore';
import { useAccountStore } from './accountStore';

/**
 * Backward-compatible hook that merges all CRM sub-stores into one object.
 * Existing consumers can continue using `useCRMStore()` without changes.
 *
 * NOTE: This hook subscribes to ALL four stores, so any change in any store
 * will trigger a re-render. For better performance, import the specific store
 * you need (e.g., `useBuildingStore`) instead.
 */
export function useCRMStore() {
  const buildingState = useBuildingStore();
  const apartmentState = useApartmentStore();
  const meterState = useMeterStore();
  const accountState = useAccountStore();

  return {
    // ===== Building store =====
    buildings: buildingState.buildings,
    entrances: buildingState.entrances,
    isLoadingBuildings: buildingState.isLoadingBuildings,
    isLoadingEntrances: buildingState.isLoadingEntrances,
    fetchBuildings: buildingState.fetchBuildings,
    fetchBuildingById: buildingState.fetchBuildingById,
    addBuilding: buildingState.addBuilding,
    updateBuilding: buildingState.updateBuilding,
    deleteBuilding: buildingState.deleteBuilding,
    getBuildingById: buildingState.getBuildingById,
    addBuildingDocument: buildingState.addBuildingDocument,
    deleteBuildingDocument: buildingState.deleteBuildingDocument,
    fetchEntrancesByBuilding: buildingState.fetchEntrancesByBuilding,
    addEntrance: buildingState.addEntrance,
    updateEntrance: buildingState.updateEntrance,
    deleteEntrance: buildingState.deleteEntrance,
    getEntrancesByBuilding: buildingState.getEntrancesByBuilding,

    // ===== Apartment store =====
    apartments: apartmentState.apartments,
    owners: apartmentState.owners,
    residents: apartmentState.residents,
    isLoadingApartments: apartmentState.isLoadingApartments,
    isLoadingOwners: apartmentState.isLoadingOwners,
    isLoadingResidents: apartmentState.isLoadingResidents,
    fetchApartmentsByBuilding: apartmentState.fetchApartmentsByBuilding,
    fetchApartmentById: apartmentState.fetchApartmentById,
    addApartment: apartmentState.addApartment,
    updateApartment: apartmentState.updateApartment,
    deleteApartment: apartmentState.deleteApartment,
    getApartmentsByBuilding: apartmentState.getApartmentsByBuilding,
    getApartmentsByEntrance: apartmentState.getApartmentsByEntrance,
    getApartmentById: apartmentState.getApartmentById,
    fetchOwners: apartmentState.fetchOwners,
    fetchOwnerById: apartmentState.fetchOwnerById,
    addOwner: apartmentState.addOwner,
    updateOwner: apartmentState.updateOwner,
    deleteOwner: apartmentState.deleteOwner,
    linkOwnerToApartment: apartmentState.linkOwnerToApartment,
    unlinkOwnerFromApartment: apartmentState.unlinkOwnerFromApartment,
    getOwnerById: apartmentState.getOwnerById,
    getOwnersByApartment: apartmentState.getOwnersByApartment,
    searchOwners: apartmentState.searchOwners,
    fetchResidentsByApartment: apartmentState.fetchResidentsByApartment,
    fetchResidentById: apartmentState.fetchResidentById,
    addResident: apartmentState.addResident,
    updateResident: apartmentState.updateResident,
    deleteResident: apartmentState.deleteResident,
    moveOutResident: apartmentState.moveOutResident,
    getResidentsByApartment: apartmentState.getResidentsByApartment,

    // ===== Meter store =====
    meters: meterState.meters,
    meterReadings: meterState.meterReadings,
    isLoadingMeters: meterState.isLoadingMeters,
    fetchMetersByApartment: meterState.fetchMetersByApartment,
    fetchMetersByBuilding: meterState.fetchMetersByBuilding,
    fetchMeterById: meterState.fetchMeterById,
    addMeter: meterState.addMeter,
    updateMeter: meterState.updateMeter,
    deleteMeter: meterState.deleteMeter,
    decommissionMeter: meterState.decommissionMeter,
    getMetersByApartment: meterState.getMetersByApartment,
    getCommonMetersByBuilding: meterState.getCommonMetersByBuilding,
    fetchMeterReadings: meterState.fetchMeterReadings,
    submitMeterReading: meterState.submitMeterReading,
    verifyMeterReading: meterState.verifyMeterReading,
    getMeterReadings: meterState.getMeterReadings,
    getLastReading: meterState.getLastReading,

    // ===== Account store =====
    personalAccounts: accountState.personalAccounts,
    isLoadingAccounts: accountState.isLoadingAccounts,
    fetchAccountsByBuilding: accountState.fetchAccountsByBuilding,
    addPersonalAccount: accountState.addPersonalAccount,
    updatePersonalAccount: accountState.updatePersonalAccount,
    getPersonalAccountById: accountState.getPersonalAccountById,
    getPersonalAccountByApartment: accountState.getPersonalAccountByApartment,
    getPersonalAccountsByBuilding: accountState.getPersonalAccountsByBuilding,
    fetchDebtors: accountState.fetchDebtors,
    getDebtors: accountState.getDebtors,

    // ===== Cross-store computed =====

    getBuildingWithStats: (id: string) => {
      const building = buildingState.buildings.find((b) => b.id === id);
      if (!building) return undefined;

      const apartments = apartmentState.apartments.filter((a) => a.buildingId === id);
      const accounts = accountState.personalAccounts.filter((p) => p.buildingId === id);
      const residents = apartmentState.residents.filter((r) =>
        apartments.some((a) => a.id === r.apartmentId)
      );

      return {
        ...building,
        totalApartments: apartments.length || building.totalApartments,
        residentsCount: residents.length || building.residentsCount,
        ownersCount: apartmentState.owners.filter((o) =>
          o.apartmentIds.some((aId) => apartments.some((a) => a.id === aId))
        ).length || building.ownersCount,
        totalDebt: accounts.reduce((sum, a) => sum + a.currentDebt, 0) || building.totalDebt,
        vacantApartments: apartments.filter((a) => a.status === 'vacant').length || building.vacantApartments,
      };
    },

    getBuildingStats: () => {
      const { buildings } = buildingState;
      const { apartments, residents, owners } = apartmentState;
      const { personalAccounts } = accountState;
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
  };
}
