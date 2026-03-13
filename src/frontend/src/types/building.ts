export interface Building {
  id: string;
  name: string;
  address: string;
  floors: number;
  apartments: number;
  entrances: number;
  yearBuilt?: number;
  managerId?: string;
  createdAt: string;
  residentsCount: number;
  activeRequestsCount: number;
}

// Rental apartment for commercial owners (tenants)
export interface RentalApartment {
  id: string;
  name: string; // e.g., "Квартира 42" or custom name
  address: string;
  apartment: string;
  ownerId: string; // tenant user id
  ownerName: string;
  ownerPhone: string;
  ownerLogin: string;
  ownerPassword?: string; // stored for delete confirmation
  ownerType: 'tenant' | 'commercial_owner'; // tenant = посуточная аренда, commercial_owner = коммерческая недвижимость
  createdAt: string;
  isActive: boolean;
}

// Rental record (guest check-in/check-out)
export interface RentalRecord {
  id: string;
  apartmentId: string;
  guestNames: string; // comma separated or single name
  passportInfo: string;
  checkInDate: string;
  checkOutDate: string;
  amount: number; // rental amount
  currency: string; // UZS, USD, etc.
  notes?: string;
  createdAt: string;
  createdBy: string; // manager id
}

// Расширенный дом с полной информацией
export interface BuildingFull {
  id: string;
  name: string;
  address: string;
  zone?: string;                   // Название района/зоны (Юнусабад, Чиланзар и т.д.)
  cadastralNumber?: string;        // Кадастровый номер
  branchCode?: string;             // Код филиала (YS, CH, etc.)
  buildingNumber?: string;         // Номер дома (8A, 15, etc.)

  // Технические характеристики
  floors: number;
  entrances: number;
  totalApartments: number;
  totalArea: number;               // Общая площадь м²
  livingArea: number;              // Жилая площадь м²
  commonArea: number;              // Площадь МОП м²
  landArea?: number;               // Площадь участка м²
  yearBuilt: number;
  yearRenovated?: number;
  buildingType: 'panel' | 'brick' | 'monolith' | 'block' | 'wooden' | 'mixed';
  roofType: 'flat' | 'pitched' | 'combined';
  wallMaterial: string;
  foundationType: string;

  // Инженерные системы
  hasElevator: boolean;
  elevatorCount: number;
  hasGas: boolean;
  heatingType: 'central' | 'individual' | 'autonomous';
  hasHotWater: boolean;
  waterSupplyType: 'central' | 'autonomous';
  sewerageType: 'central' | 'autonomous';
  hasIntercom: boolean;
  hasVideoSurveillance: boolean;
  hasConcierge: boolean;
  hasParkingLot: boolean;
  parkingSpaces: number;
  hasPlayground: boolean;

  // Управление
  managerId?: string;
  managerName?: string;
  managementStartDate?: string;
  contractNumber?: string;
  contractEndDate?: string;

  // Финансовые данные
  monthlyBudget: number;
  reserveFund: number;
  totalDebt: number;
  collectionRate: number;          // % собираемости

  // Статистика
  residentsCount: number;
  ownersCount: number;
  tenantsCount: number;
  vacantApartments: number;
  activeRequestsCount: number;

  // Документы
  documents: BuildingDocument[];

  createdAt: string;
  updatedAt: string;
}

// Документ дома
export interface BuildingDocument {
  id: string;
  buildingId: string;
  name: string;
  type: 'contract' | 'act' | 'protocol' | 'passport' | 'license' | 'certificate' | 'other';
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  expiresAt?: string;
  isActive: boolean;
}

// Подъезд
export interface Entrance {
  id: string;
  buildingId: string;
  number: number;
  floorsFrom: number;
  floorsTo: number;
  apartmentsFrom: number;
  apartmentsTo: number;
  hasElevator: boolean;
  elevatorId?: string;
  intercomType?: 'audio' | 'video' | 'smart' | 'none';
  intercomCode?: string;
  cleaningSchedule?: string;
  responsibleId?: string;          // Ответственный сотрудник
  lastInspection?: string;
  notes?: string;
}

// Квартира (расширенная)
export interface Apartment {
  id: string;
  buildingId: string;
  entranceId: string;
  number: string;                  // Номер квартиры
  floor: number;

  // Характеристики
  rooms: number;
  totalArea: number;               // Общая площадь м²
  livingArea: number;              // Жилая площадь м²
  kitchenArea?: number;
  balconyArea?: number;
  loggiaArea?: number;             // Площадь лоджии
  ceilingHeight?: number;          // Высота потолков
  hasBalcony: boolean;
  hasLoggia: boolean;
  hasStorage?: boolean;            // Кладовая
  hasParking?: boolean;            // Парковка
  parkingNumber?: string;          // Номер парковки

  // Право собственности
  ownershipType: 'private' | 'municipal' | 'state' | 'cooperative';
  ownershipShare?: number;          // Доля в общем имуществе %
  registrationNumber?: string;     // Регистрационный номер
  registrationDate?: string;       // Дата регистрации
  cadastralValue?: number;

  // Текущий статус
  status: 'occupied' | 'vacant' | 'rented' | 'commercial' | 'under_repair';
  isCommercial: boolean;           // Нежилое помещение
  commercialType?: string;         // Тип коммерческого помещения

  // Счетчики
  meters: Meter[];

  // Связи
  personalAccountId?: string;
  primaryOwnerId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Счетчик (ИПУ)
export interface Meter {
  id: string;
  apartmentId?: string;
  buildingId?: string;             // Для ОДПУ
  type: 'cold_water' | 'hot_water' | 'electricity' | 'gas' | 'heat';
  serialNumber: string;
  model?: string;
  brand?: string;                  // Бренд/производитель
  manufacturer?: string;
  installDate: string;
  verificationDate: string;
  nextVerificationDate: string;
  sealNumber?: string;
  location: string;
  initialValue: number;
  currentValue: number;
  lastReadingDate?: string;
  isActive: boolean;
  isCommon: boolean;               // ОДПУ
  tariffZone?: string;             // Тарифная зона
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Показания счетчика
export interface MeterReading {
  id: string;
  meterId: string;
  apartmentId?: string;
  value: number;
  previousValue: number;
  consumption: number;
  readingDate: string;
  source: 'manual' | 'online' | 'auto' | 'calculated';
  submittedBy?: string;
  submittedAt: string;
  isVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  photoUrl?: string;
  status?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  notes?: string;
  createdAt?: string;
}

// Labels
export const BUILDING_TYPE_LABELS: Record<BuildingFull['buildingType'], string> = {
  panel: 'Панельный',
  brick: 'Кирпичный',
  monolith: 'Монолитный',
  block: 'Блочный',
  wooden: 'Деревянный',
  mixed: 'Смешанный'
};
