// API-клиент раздела «Протоколы» (акты приёма-передачи дома).
import { apiRequest } from './client';
import type { BuildingAct, ActBasis, ActOptions, ActSnapshot } from '../../types/acts';

// Бэкенд отдаёт *_json строками — парсим в объекты.
function parseAct(raw: Record<string, unknown>): BuildingAct {
  const parse = <T>(v: unknown, fb: T): T => {
    if (typeof v !== 'string') return (v as T) ?? fb;
    try { return JSON.parse(v) as T; } catch { return fb; }
  };
  return {
    id: String(raw.id),
    building_id: String(raw.building_id),
    act_type: String(raw.act_type || 'handover'),
    act_number: (raw.act_number as string) || undefined,
    act_date: (raw.act_date as string) || undefined,
    basis: parse<ActBasis>(raw.basis_json, {}),
    options: parse<ActOptions>(raw.options_json, { has_parking: false, has_nonresidential: false, tech_docs: [] }),
    snapshot: parse<ActSnapshot>(raw.snapshot_json, {}),
    created_at: (raw.created_at as string) || undefined,
  };
}

export const actsApi = {
  list: async (buildingId: string): Promise<BuildingAct[]> => {
    const res = await apiRequest<{ acts: Record<string, unknown>[] }>(`/api/buildings/${buildingId}/acts`);
    return (res.acts || []).map(parseAct);
  },

  get: async (id: string): Promise<BuildingAct> => {
    const res = await apiRequest<{ act: Record<string, unknown> }>(`/api/acts/${id}`);
    return parseAct(res.act);
  },

  create: async (buildingId: string, payload: {
    act_type?: string; act_number?: string; act_date?: string;
    basis: ActBasis; options: ActOptions; snapshot: ActSnapshot;
  }): Promise<{ id: string }> => {
    return apiRequest<{ id: string }>(`/api/buildings/${buildingId}/acts`, {
      method: 'POST', body: JSON.stringify(payload),
    });
  },

  remove: async (id: string): Promise<{ ok: boolean }> => {
    return apiRequest<{ ok: boolean }>(`/api/acts/${id}`, { method: 'DELETE' });
  },

  // Массовое создание ячеек одного типа (жилые/парковка/нежилые).
  bulkCells: async (buildingId: string, cells: Array<{
    number: string; floor?: number;
    is_commercial?: boolean; is_parking?: boolean; is_basement?: boolean;
  }>): Promise<{ created: number; total: number }> => {
    return apiRequest<{ created: number; total: number }>(
      `/api/buildings/${buildingId}/apartments/bulk`,
      { method: 'POST', body: JSON.stringify({ apartments: cells }) },
    );
  },
};
