// ============================================
// VEHICLES MODULE - Автомобили жителей
// ============================================

export type VehicleType = 'car' | 'motorcycle' | 'truck' | 'other';
export type VehicleOwnerType = 'individual' | 'legal_entity' | 'service';

export interface Vehicle {
  id: string;
  ownerId: string;           // ID жителя или менеджера (для служебных)
  ownerName: string;
  ownerPhone: string;
  apartment: string;
  address: string;
  plateNumber: string;       // Номер авто (01A123BC)
  brand: string;             // Марка (Toyota, Chevrolet, etc)
  model: string;             // Модель (Camry, Nexia, etc)
  color: string;             // Цвет
  year?: number;             // Год выпуска
  type: VehicleType;
  ownerType: VehicleOwnerType; // Тип владельца: физлицо, юрлицо, служебный
  companyName?: string;      // Название компании (для юрлица/служебного)
  parkingSpot?: string;      // Номер парковочного места
  notes?: string;            // Примечания
  createdAt: string;
  updatedAt?: string;
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, { label: string; labelUz: string }> = {
  car: { label: 'Легковой автомобиль', labelUz: 'Yengil avtomobil' },
  motorcycle: { label: 'Мотоцикл', labelUz: 'Mototsikl' },
  truck: { label: 'Грузовик', labelUz: 'Yuk mashinasi' },
  other: { label: 'Другое', labelUz: 'Boshqa' },
};

export const VEHICLE_OWNER_TYPE_LABELS: Record<VehicleOwnerType, { label: string; labelUz: string; icon: string }> = {
  individual: { label: 'Физ. лицо', labelUz: 'Jismoniy shaxs', icon: '👤' },
  legal_entity: { label: 'Юр. лицо', labelUz: 'Yuridik shaxs', icon: '🏢' },
  service: { label: 'Служебный', labelUz: 'Xizmat', icon: '🚐' },
};
