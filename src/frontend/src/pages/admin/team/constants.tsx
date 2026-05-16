import {
  Droplets, Zap, ArrowUpDown, Bell, Brush, ShieldCheck, Hammer, Flame, Wind,
  Truck, Leaf, Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ExecutorSpecialization } from '../../../types';

// Sprint 31: shared role/specialization label + color + icon tables
// for TeamPage and its split-out children (StaffCard, StaffSection).
// Lives here so the children don't import from the parent file.

export interface StaffMember {
  id: string;
  login: string;
  password?: string;
  name: string;
  phone: string;
  role: 'admin' | 'manager' | 'department_head' | 'executor' | 'advertiser';
  specialization?: ExecutorSpecialization;
  status?: string;
  created_at: string;
  completed_count?: number;
  active_count?: number;
  avg_rating?: number;
}

export const ROLE_LABELS_RU: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  advertiser: 'Менеджер рекламы',
  department_head: 'Глава отдела',
  executor: 'Исполнитель',
};

export const ROLE_LABELS_UZ: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Menejer',
  advertiser: 'Reklama menejeri',
  department_head: "Bo'lim boshlig'i",
  executor: 'Ijrochi',
};

export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  advertiser: 'bg-orange-100 text-orange-700',
  department_head: 'bg-blue-100 text-blue-700',
  executor: 'bg-green-100 text-green-700',
};

export const SPECIALIZATION_ICONS: Record<ExecutorSpecialization, ReactNode> = {
  plumber: <Droplets className="w-4 h-4" />,
  electrician: <Zap className="w-4 h-4" />,
  elevator: <ArrowUpDown className="w-4 h-4" />,
  intercom: <Bell className="w-4 h-4" />,
  cleaning: <Brush className="w-4 h-4" />,
  security: <ShieldCheck className="w-4 h-4" />,
  trash: <Hammer className="w-4 h-4" />,
  boiler: <Flame className="w-4 h-4" />,
  ac: <Wind className="w-4 h-4" />,
  courier: <Truck className="w-4 h-4" />,
  gardener: <Leaf className="w-4 h-4" />,
  other: <Wrench className="w-4 h-4" />,
};

export const SPECIALIZATION_COLORS: Record<ExecutorSpecialization, string> = {
  plumber: 'bg-blue-100 text-blue-700',
  electrician: 'bg-yellow-100 text-yellow-700',
  elevator: 'bg-gray-100 text-gray-700',
  intercom: 'bg-purple-100 text-purple-700',
  cleaning: 'bg-pink-100 text-pink-700',
  security: 'bg-red-100 text-red-700',
  trash: 'bg-amber-100 text-amber-700',
  boiler: 'bg-orange-100 text-orange-700',
  ac: 'bg-cyan-100 text-cyan-700',
  courier: 'bg-green-100 text-green-700',
  gardener: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-700',
};

