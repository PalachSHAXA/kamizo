import { useState, useEffect, useCallback } from 'react';
import { vehiclesApi } from '../services/api';

export interface Vehicle {
  id: string;
  user_id: string;
  plate_number: string;
  brand?: string;
  model?: string;
  color?: string;
  is_primary?: boolean;
  created_at?: string;
  // For search results
  owner_name?: string;
  owner_phone?: string;
  apartment?: string;
  address?: string;
}

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await vehiclesApi.getAll();
      setVehicles(data.vehicles || []);
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
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
