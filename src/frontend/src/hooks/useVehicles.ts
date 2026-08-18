import { useState, useEffect, useCallback } from 'react';
import { vehiclesApi } from '../services/api';
import type { VehicleDto } from '../services/api/vehicles';

export function useVehicles() {
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await vehiclesApi.getAll();
      setVehicles(data.vehicles || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setVehicles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const addVehicle = async (vehicleData: {
    plate_number: string;
    brand?: string;
    model?: string;
    color?: string;
    is_primary?: boolean;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await vehiclesApi.create(vehicleData);
      setVehicles(prev => [...prev, data.vehicle]);
      return data.vehicle;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteVehicle = async (vehicleId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await vehiclesApi.delete(vehicleId);
      setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const searchVehicles = async (query: string) => {
    if (!query || query.length < 2) {
      return [];
    }
    try {
      const data = await vehiclesApi.search(query);
      return data.vehicles || [];
    } catch (err: unknown) {
      console.error('Search error:', err);
      return [];
    }
  };

  return {
    vehicles,
    isLoading,
    error,
    fetchVehicles,
    addVehicle,
    deleteVehicle,
    searchVehicles,
  };
}
