import type { VehicleOwnerType } from '../../types';

// Region codes of Uzbekistan
export const UZ_REGIONS = [
  { code: '01', name: 'Ташкент', nameUz: 'Toshkent' },
  { code: '10', name: 'Ташкентская область', nameUz: 'Toshkent viloyati' },
  { code: '20', name: 'Сырдарьинская область', nameUz: 'Sirdaryo viloyati' },
  { code: '25', name: 'Джизакская область', nameUz: 'Jizzax viloyati' },
  { code: '30', name: 'Самаркандская область', nameUz: 'Samarqand viloyati' },
  { code: '40', name: 'Ферганская область', nameUz: 'Farg\'ona viloyati' },
  { code: '50', name: 'Наманганская область', nameUz: 'Namangan viloyati' },
  { code: '60', name: 'Андижанская область', nameUz: 'Andijon viloyati' },
  { code: '70', name: 'Кашкадарьинская область', nameUz: 'Qashqadaryo viloyati' },
  { code: '75', name: 'Сурхандарьинская область', nameUz: 'Surxondaryo viloyati' },
  { code: '80', name: 'Бухарская область', nameUz: 'Buxoro viloyati' },
  { code: '85', name: 'Навоийская область', nameUz: 'Navoiy viloyati' },
  { code: '90', name: 'Хорезмская область', nameUz: 'Xorazm viloyati' },
  { code: '95', name: 'Республика Каракалпакстан', nameUz: 'Qoraqalpog\'iston Respublikasi' },
];

export interface PlateParts {
  region: string;
  letters1: string;
  digits: string;
  letters2: string;
}

// Parse plate number to parts
export function parsePlateNumber(plate: string, ownerType: VehicleOwnerType): PlateParts {
  const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return {
      region: cleaned.slice(0, 2),
      letters1: '',
      digits: cleaned.slice(2, 5),
      letters2: cleaned.slice(5, 8),
    };
  }
  return {
    region: cleaned.slice(0, 2),
    letters1: cleaned.slice(2, 3),
    digits: cleaned.slice(3, 6),
    letters2: cleaned.slice(6, 8),
  };
}

// Combine parts to plate number
export function combinePlateNumber(parts: PlateParts, ownerType: VehicleOwnerType): string {
  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return `${parts.region}${parts.digits}${parts.letters2}`.toUpperCase();
  }
  return `${parts.region}${parts.letters1}${parts.digits}${parts.letters2}`.toUpperCase();
}

// Validate plate number
export function validatePlateNumber(parts: PlateParts, ownerType: VehicleOwnerType): boolean {
  const region = parseInt(parts.region);
  if (isNaN(region) || region < 1 || region > 99) return false;

  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return parts.digits.length === 3 && parts.letters2.length === 3;
  }
  return parts.letters1.length === 1 && parts.digits.length === 3 && parts.letters2.length === 2;
}

// Format plate for display: 01 A 123 EA or 01 123 EAA
export function formatPlateDisplay(plate: string | null | undefined): string {
  if (!plate) return '\u2014';
  const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length === 8 && /^\d{2}[A-Z]\d{3}[A-Z]{2}$/.test(cleaned)) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)}`;
  }
  if (cleaned.length === 8 && /^\d{5}[A-Z]{3}$/.test(cleaned)) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)}`;
  }
  return plate;
}
