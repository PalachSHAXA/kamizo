// Branch type (represents a residential complex — ЖК)
export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  district?: string;
  buildings_count: number;
  residents_count: number;
}

// Entrance type
export interface Entrance {
  id: string;
  building_id: string;
  number: number;
  floors_from?: number;
  floors_to?: number;
  apartments_from?: number;
  apartments_to?: number;
  has_elevator?: number;
  intercom_type?: string;
  intercom_code?: string;
}

// Apartment type
export interface Apartment {
  id: string;
  building_id: string;
  entrance_id?: string;
  number: string;
  floor?: number;
  total_area?: number;
  living_area?: number;
  rooms?: number;
  status?: string;
  is_commercial?: number;
  ownership_type?: string;
  resident_count?: number;
}

export type ViewLevel = 'districts' | 'branches' | 'buildings' | 'entrances';

// Color helpers
export const STATUS_CONFIG = {
  occupied: { bg: '#E0E5F0', text: '#4B5580', label_ru: 'Занята', label_uz: 'Band' },
  vacant:   { bg: '#D1F0DC', text: '#16A34A', label_ru: 'Свободна', label_uz: "Bo'sh" },
  commercial: { bg: '#FFD6D6', text: '#DC2626', label_ru: 'Коммерция', label_uz: 'Tijorat' },
  rented:   { bg: '#FEF3C7', text: '#D97706', label_ru: 'Аренда', label_uz: 'Ijara' },
  renovation: { bg: '#F3E8FF', text: '#7C3AED', label_ru: 'Ремонт', label_uz: "Ta'mir" },
} as const;

export function getAptStatus(apt: Apartment) {
  if (apt.is_commercial) return 'commercial';
  return (apt.status as keyof typeof STATUS_CONFIG) || 'occupied';
}

export function getStatusStyle(status: string) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.occupied;
  return { background: cfg.bg, color: cfg.text };
}

export function getStatusLabel(status: string, lang: string) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.occupied;
  return lang === 'ru' ? cfg.label_ru : cfg.label_uz;
}

// Building colors (deterministic from name)
export function getBuildingColor(name: string) {
  const colors = ['#1A5C30', '#1A2A6C', '#3D1A7A', '#6B3A1A', '#1A4F4F', '#4F1A1A', '#1A6B3A', '#1A1A4F'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
