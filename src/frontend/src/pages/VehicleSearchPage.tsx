import { useState, useRef, useEffect } from 'react';
import { Search, Car, User, Phone, MapPin, Home, Calendar, Info, AlertCircle, Plus, X, Building2, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Vehicle, VehicleType, VehicleOwnerType } from '../types';
import { VEHICLE_TYPE_LABELS, VEHICLE_OWNER_TYPE_LABELS } from '../types';

// Region codes of Uzbekistan
const UZ_REGIONS = [
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

// UZ Flag component
const UZFlag = () => (
  <svg viewBox="0 0 30 20" className="w-12 h-8">
    <rect width="30" height="6.67" fill="#1EB53A"/>
    <rect y="6.67" width="30" height="6.67" fill="#FFFFFF"/>
    <rect y="13.33" width="30" height="6.67" fill="#0099B5"/>
    <rect y="6.17" width="30" height="1" fill="#CE1126"/>
    <rect y="12.83" width="30" height="1" fill="#CE1126"/>
    <circle cx="8" cy="3.33" r="2" fill="#FFFFFF"/>
    <circle cx="9" cy="3.33" r="2" fill="#0099B5"/>
    {[0,1,2,3,4,5,6,7,8,9,10,11].map((i) => (
      <circle key={i} cx={14 + (i % 4) * 2.5} cy={1.5 + Math.floor(i / 4) * 2} r="0.6" fill="#FFFFFF"/>
    ))}
  </svg>
);

// Search Plate Input Component - universal search supporting both formats
interface SearchPlateInputProps {
  value: { region: string; letters1: string; digits: string; letters2: string };
  onChange: (value: { region: string; letters1: string; digits: string; letters2: string }) => void;
  language: string;
  onSearch?: () => void;
}

function SearchPlateInput({ value, onChange, language, onSearch }: SearchPlateInputProps) {
  const letters1Ref = useRef<HTMLInputElement>(null);
  const digitsRef = useRef<HTMLInputElement>(null);
  const letters2Ref = useRef<HTMLInputElement>(null);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  const handleRegionSelect = (code: string) => {
    onChange({ ...value, region: code });
    setShowRegionDropdown(false);
    setTimeout(() => {
      letters1Ref.current?.focus();
    }, 100);
  };

  const handleLetters1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 1);
    // Check if it's a digit - then skip letters1 and go to digits
    if (/^\d$/.test(val)) {
      onChange({ ...value, letters1: '', digits: val });
      digitsRef.current?.focus();
    } else {
      onChange({ ...value, letters1: val });
      if (val.length === 1) {
        digitsRef.current?.focus();
      }
    }
  };

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 3);
    onChange({ ...value, digits: val });
    if (val.length === 3) {
      letters2Ref.current?.focus();
    }
  };

  const handleLetters2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    onChange({ ...value, letters2: val });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'letters1' | 'digits' | 'letters2') => {
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
      if (field === 'letters2') digitsRef.current?.focus();
      else if (field === 'digits') letters1Ref.current?.focus();
    }
    if (e.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  const selectedRegion = UZ_REGIONS.find(r => r.code === value.region);

  // Determine display format based on what's entered
  const isLegalFormat = value.letters1 === '' && value.digits.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* License plate like avtoraqam.uzex.uz */}
      <div className="relative bg-white border-[3px] border-black rounded-xl shadow-xl overflow-visible" style={{ minWidth: '380px' }}>
        <div className="flex items-center h-20 bg-white rounded-xl">
          {/* Region section with dropdown */}
          <div className="relative flex items-center justify-center border-r-2 border-black h-full px-3 bg-gray-50 rounded-l-xl">
            <button
              type="button"
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="text-4xl font-bold text-center hover:text-primary-600 transition-colors cursor-pointer min-w-[50px]"
            >
              {value.region || <span className="text-gray-300">01</span>}
            </button>

            {/* Region dropdown */}
            {showRegionDropdown && (
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => setShowRegionDropdown(false)} />
                <div className="absolute top-full left-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl z-[9999] max-h-72 overflow-y-auto min-w-[280px]">
                  {UZ_REGIONS.map((region) => (
                    <button
                      key={region.code}
                      type="button"
                      onClick={() => handleRegionSelect(region.code)}
                      className={`w-full px-4 py-3 text-left hover:bg-primary-50 flex items-center gap-4 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                        value.region === region.code ? 'bg-primary-100 text-primary-700' : ''
                      }`}
                    >
                      <span className="text-2xl font-bold text-gray-700 w-10">{region.code}</span>
                      <span className="text-sm text-gray-600">
                        {language === 'ru' ? region.name : region.nameUz}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Number section: A 123 BC or 123 ABC */}
          <div className="flex-1 flex items-center justify-center px-2 gap-1">
            {/* First letter (optional for search) */}
            <input
              ref={letters1Ref}
              type="text"
              value={value.letters1}
              onChange={handleLetters1Change}
              onKeyDown={(e) => handleKeyDown(e, 'letters1')}
              className="w-10 text-4xl font-bold text-center outline-none bg-transparent uppercase"
              placeholder="A"
              maxLength={1}
            />
            <input
              ref={digitsRef}
              type="text"
              inputMode="numeric"
              value={value.digits}
              onChange={handleDigitsChange}
              onKeyDown={(e) => handleKeyDown(e, 'digits')}
              className="w-20 text-4xl font-bold text-center outline-none bg-transparent tracking-wider"
              placeholder="123"
              maxLength={3}
            />
            <input
              ref={letters2Ref}
              type="text"
              value={value.letters2}
              onChange={handleLetters2Change}
              onKeyDown={(e) => handleKeyDown(e, 'letters2')}
              className="w-20 text-4xl font-bold text-center outline-none bg-transparent uppercase"
              placeholder={isLegalFormat ? 'ABC' : 'BC'}
              maxLength={3}
            />
          </div>

          {/* Flag section */}
          <div className="flex flex-col items-center justify-center border-l-2 border-black h-full px-3 bg-gray-50 rounded-r-xl">
            <UZFlag />
            <span className="text-sm font-bold mt-0.5">UZ</span>
          </div>
        </div>
      </div>

      {/* Selected region hint */}
      {selectedRegion && (
        <p className="text-sm text-primary-600 mt-3 font-medium">
          {language === 'ru' ? selectedRegion.name : selectedRegion.nameUz}
        </p>
      )}

      {/* Format hint */}
      <p className="text-xs text-gray-400 mt-1">
        {language === 'ru' ? 'Введите любую часть номера для поиска' : 'Qidirish uchun raqamning istalgan qismini kiriting'}
      </p>
    </div>
  );
}

// Plate Number Input Component (for service/legal entity only - format: 01 123 EAA)
interface PlateNumberInputProps {
  value: { region: string; letters1: string; digits: string; letters2: string };
  onChange: (value: { region: string; letters1: string; digits: string; letters2: string }) => void;
  language: string;
}

function PlateNumberInput({ value, onChange, language }: PlateNumberInputProps) {
  const digitsRef = useRef<HTMLInputElement>(null);
  const letters2Ref = useRef<HTMLInputElement>(null);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  const handleRegionSelect = (code: string) => {
    onChange({ ...value, region: code });
    setShowRegionDropdown(false);
    setTimeout(() => {
      digitsRef.current?.focus();
    }, 100);
  };

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 3);
    onChange({ ...value, digits: val });
    if (val.length === 3) {
      letters2Ref.current?.focus();
    }
  };

  const handleLetters2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const maxLen = 3; // Always 3 letters for service/legal_entity
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, maxLen);
    onChange({ ...value, letters2: val });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'digits' | 'letters2') => {
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
      if (field === 'letters2') digitsRef.current?.focus();
    }
  };

  const selectedRegion = UZ_REGIONS.find(r => r.code === value.region);

  return (
    <div className="flex flex-col items-center">
      {/* License plate like avtoraqam.uzex.uz */}
      <div className="relative bg-white border-[3px] border-black rounded-xl shadow-xl overflow-visible" style={{ minWidth: '340px' }}>
        <div className="flex items-center h-20 bg-white rounded-xl">
          {/* Region section with dropdown */}
          <div className="relative flex items-center justify-center border-r-2 border-black h-full px-3 bg-gray-50 rounded-l-xl">
            <button
              type="button"
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="text-4xl font-bold text-center hover:text-primary-600 transition-colors cursor-pointer min-w-[50px]"
            >
              {value.region || <span className="text-gray-300">01</span>}
            </button>

            {/* Region dropdown */}
            {showRegionDropdown && (
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => setShowRegionDropdown(false)} />
                <div className="absolute top-full left-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl z-[9999] max-h-72 overflow-y-auto min-w-[280px]">
                  {UZ_REGIONS.map((region) => (
                    <button
                      key={region.code}
                      type="button"
                      onClick={() => handleRegionSelect(region.code)}
                      className={`w-full px-4 py-3 text-left hover:bg-primary-50 flex items-center gap-4 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                        value.region === region.code ? 'bg-primary-100 text-primary-700' : ''
                      }`}
                    >
                      <span className="text-2xl font-bold text-gray-700 w-10">{region.code}</span>
                      <span className="text-sm text-gray-600">
                        {language === 'ru' ? region.name : region.nameUz}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Number section: 123 EAA */}
          <div className="flex-1 flex items-center justify-center px-3 gap-2">
            <input
              ref={digitsRef}
              type="text"
              inputMode="numeric"
              value={value.digits}
              onChange={handleDigitsChange}
              onKeyDown={(e) => handleKeyDown(e, 'digits')}
              className="w-24 text-4xl font-bold text-center outline-none bg-transparent tracking-wider"
              placeholder="123"
              maxLength={3}
            />
            <input
              ref={letters2Ref}
              type="text"
              value={value.letters2}
              onChange={handleLetters2Change}
              onKeyDown={(e) => handleKeyDown(e, 'letters2')}
              className="w-24 text-4xl font-bold text-center outline-none bg-transparent uppercase"
              placeholder="EAA"
              maxLength={3}
            />
          </div>

          {/* Flag section */}
          <div className="flex flex-col items-center justify-center border-l-2 border-black h-full px-3 bg-gray-50 rounded-r-xl">
            <UZFlag />
            <span className="text-sm font-bold mt-0.5">UZ</span>
          </div>
        </div>
      </div>

      {/* Selected region hint */}
      {selectedRegion && (
        <p className="text-sm text-primary-600 mt-3 font-medium">
          {language === 'ru' ? selectedRegion.name : selectedRegion.nameUz}
        </p>
      )}

      {/* Format hint */}
      <p className="text-xs text-gray-400 mt-1">
        {language === 'ru' ? 'Нажмите на код региона для выбора' : 'Viloyat kodini tanlash uchun bosing'}
      </p>
    </div>
  );
}

function parsePlateNumber(plate: string, ownerType: VehicleOwnerType) {
  const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return { region: cleaned.slice(0, 2), letters1: '', digits: cleaned.slice(2, 5), letters2: cleaned.slice(5, 8) };
  }
  return { region: cleaned.slice(0, 2), letters1: cleaned.slice(2, 3), digits: cleaned.slice(3, 6), letters2: cleaned.slice(6, 8) };
}

function combinePlateNumber(parts: { region: string; letters1: string; digits: string; letters2: string }, ownerType: VehicleOwnerType): string {
  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return `${parts.region}${parts.digits}${parts.letters2}`.toUpperCase();
  }
  return `${parts.region}${parts.letters1}${parts.digits}${parts.letters2}`.toUpperCase();
}

function validatePlateNumber(parts: { region: string; letters1: string; digits: string; letters2: string }, ownerType: VehicleOwnerType): boolean {
  const region = parseInt(parts.region);
  if (isNaN(region) || region < 1 || region > 99) return false;
  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return parts.digits.length === 3 && parts.letters2.length === 3;
  }
  return parts.letters1.length === 1 && parts.digits.length === 3 && parts.letters2.length === 2;
}

export function VehicleSearchPage() {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle, fetchVehicles } = useDataStore();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  // Fetch ALL vehicles from D1 database on mount (for staff search page)
  useEffect(() => {
    // Pass true to get all vehicles (staff endpoint)
    fetchVehicles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [searchPlateParts, setSearchPlateParts] = useState({ region: '', letters1: '', digits: '', letters2: '' });
  const [searchResult, setSearchResult] = useState<Vehicle | null>(null);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [showAllVehicles, setShowAllVehicles] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);

  // Form state
  const [selectedOwnerType, setSelectedOwnerType] = useState<VehicleOwnerType>('service');
  const [plateParts, setPlateParts] = useState({ region: '', letters1: '', digits: '', letters2: '' });
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    color: '',
    year: '',
    type: 'car' as VehicleType,
    companyName: '',
    parkingSpot: '',
    notes: '',
  });

  const isManager = user?.role === 'manager' || user?.role === 'admin';
  const ownerTypes: VehicleOwnerType[] = ['service', 'legal_entity'];

  const resetForm = () => {
    setFormData({ brand: '', model: '', color: '', year: '', type: 'car', companyName: '', parkingSpot: '', notes: '' });
    setPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
    setSelectedOwnerType('service');
    setEditingVehicle(null);
    setPlateError(null);
  };

  const handleOpenModal = (vehicle?: Vehicle) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      const ownerType = vehicle.ownerType || 'individual';
      setSelectedOwnerType(ownerType);
      setPlateParts(parsePlateNumber(vehicle.plateNumber, ownerType));
      setFormData({
        brand: vehicle.brand,
        model: vehicle.model,
        color: vehicle.color,
        year: vehicle.year?.toString() || '',
        type: vehicle.type,
        companyName: vehicle.companyName || '',
        parkingSpot: vehicle.parkingSpot || '',
        notes: vehicle.notes || '',
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  useEffect(() => {
    if (!editingVehicle) {
      setPlateParts({ region: plateParts.region, letters1: '', digits: '', letters2: '' });
    }
  }, [selectedOwnerType]);

  // Filter vehicles based on search plate parts
  useEffect(() => {
    const { region, letters1, digits, letters2 } = searchPlateParts;
    const hasInput = region || letters1 || digits || letters2;

    if (!hasInput) {
      setFilteredVehicles([]);
      setSearchResult(null);
      setHasSearched(false);
      return;
    }

    // Build search pattern - combine all parts that user entered
    const searchPattern = `${region}${letters1}${digits}${letters2}`.toUpperCase();

    const filtered = vehicles.filter(v => {
      const cleanPlate = v.plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');

      // Simple contains check - if the plate contains search pattern
      if (searchPattern && cleanPlate.includes(searchPattern)) {
        return true;
      }

      // Also check each part individually for more flexible matching
      let matches = true;

      if (region) {
        matches = matches && cleanPlate.startsWith(region);
      }

      if (letters1) {
        // letters1 should be at position 2 for individual format (01A123EA)
        const charAtPos2 = cleanPlate.charAt(2);
        matches = matches && charAtPos2 === letters1;
      }

      if (digits) {
        // Check if digits appear in the plate
        matches = matches && cleanPlate.includes(digits);
      }

      if (letters2) {
        // Check if letters2 appears at the end
        matches = matches && cleanPlate.endsWith(letters2);
      }

      return matches;
    });

    setFilteredVehicles(filtered);
    setHasSearched(true);

    // Auto-select if exactly one match
    if (filtered.length === 1) {
      setSearchResult(filtered[0]);
    } else {
      setSearchResult(null);
    }
  }, [searchPlateParts, vehicles]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!validatePlateNumber(plateParts, selectedOwnerType)) {
      setPlateError(language === 'ru' ? 'Заполните все поля номера' : 'Barcha maydonlarni to\'ldiring');
      return;
    }

    const plateNumber = combinePlateNumber(plateParts, selectedOwnerType);
    const vehicleData = {
      ownerId: user.id,
      ownerName: selectedOwnerType === 'service' ? (formData.companyName || 'Служебный') : user.name,
      ownerPhone: user.phone,
      apartment: '',
      address: 'Служебный автомобиль',
      plateNumber,
      brand: formData.brand,
      model: formData.model,
      color: formData.color,
      year: formData.year ? parseInt(formData.year) : undefined,
      type: formData.type,
      ownerType: selectedOwnerType,
      companyName: formData.companyName || undefined,
      parkingSpot: formData.parkingSpot || undefined,
      notes: formData.notes || undefined,
    };

    if (editingVehicle) {
      updateVehicle(editingVehicle.id, vehicleData);
    } else {
      addVehicle(vehicleData);
    }

    setShowModal(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    deleteVehicle(id);
    setDeleteConfirm(null);
    setSearchResult(null);
  };

  const handleQuickSearch = (vehicle: Vehicle) => {
    setSearchResult(vehicle);
    setHasSearched(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatPlateDisplay = (plate: string) => {
    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length === 8 && /^\d{2}[A-Z]\d{3}[A-Z]{2}$/.test(cleaned)) {
      return `${cleaned.slice(0,2)} ${cleaned.slice(2,3)} ${cleaned.slice(3,6)} ${cleaned.slice(6,8)}`;
    }
    if (cleaned.length === 8 && /^\d{5}[A-Z]{3}$/.test(cleaned)) {
      return `${cleaned.slice(0,2)} ${cleaned.slice(2,5)} ${cleaned.slice(5,8)}`;
    }
    return plate;
  };

  const getOwnerTypeIcon = (type?: VehicleOwnerType) => {
    if (!type) return <User className="w-4 h-4" />;
    switch (type) {
      case 'individual': return <User className="w-4 h-4" />;
      case 'legal_entity': return <Building2 className="w-4 h-4" />;
      case 'service': return <Car className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <Search className="w-7 h-7 text-blue-500" />
          {language === 'ru' ? 'Поиск автомобилей' : 'Avtomobil qidirish'}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {language === 'ru' ? 'Всего:' : 'Jami:'} {vehicles.length}
          </span>
          {isManager && (
            <button
              onClick={() => handleOpenModal()}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">
                {language === 'ru' ? 'Служебное авто' : 'Xizmat avtosi'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Search Form with Beautiful Plate Input */}
      <div className="glass-card p-6 relative z-10 overflow-visible">
        <div className="flex flex-col items-center relative">
          <SearchPlateInput
            value={searchPlateParts}
            onChange={setSearchPlateParts}
            language={language}
            onSearch={() => {
              if (filteredVehicles.length === 1) {
                setSearchResult(filteredVehicles[0]);
              }
            }}
          />

          {/* Clear search button */}
          {(searchPlateParts.region || searchPlateParts.letters1 || searchPlateParts.digits || searchPlateParts.letters2) && (
            <button
              onClick={() => {
                setSearchPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
                setFilteredVehicles([]);
                setSearchResult(null);
                setHasSearched(false);
              }}
              className="mt-4 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              {language === 'ru' ? 'Очистить поиск' : 'Qidiruvni tozalash'}
            </button>
          )}
        </div>
      </div>

      {/* Filtered Results List */}
      {hasSearched && filteredVehicles.length > 1 && !searchResult && (
        <div className="glass-card p-4">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Search className="w-5 h-5 text-primary-500" />
            {language === 'ru' ? 'Найденные автомобили' : 'Topilgan avtomobillar'}
            <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-600 text-sm">
              {filteredVehicles.length}
            </span>
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-primary-50 cursor-pointer transition-colors border border-transparent hover:border-primary-200"
                onClick={() => {
                  setSearchResult(vehicle);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Car className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 tracking-wider">{formatPlateDisplay(vehicle.plateNumber)}</p>
                      {vehicle.ownerType && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                          vehicle.ownerType === 'individual' ? 'bg-blue-100 text-blue-600' :
                          vehicle.ownerType === 'legal_entity' ? 'bg-purple-100 text-purple-600' :
                          'bg-orange-100 text-orange-600'
                        }`}>
                          {getOwnerTypeIcon(vehicle.ownerType)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {vehicle.brand} {vehicle.model} • {vehicle.color}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-600">{vehicle.ownerName}</p>
                  {vehicle.apartment && (
                    <p className="text-xs text-gray-400">
                      {language === 'ru' ? 'Кв.' : 'Kv.'} {vehicle.apartment}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Result */}
      {searchResult && (
        <div className="space-y-4">
          {searchResult && (
            <div className="glass-card p-6 border-2 border-green-200 bg-green-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <Car className="w-4 h-4 text-green-600" />
                  </div>
                  <h2 className="text-lg font-bold text-green-700">
                    {language === 'ru' ? 'Автомобиль найден!' : 'Avtomobil topildi!'}
                  </h2>
                </div>
                {isManager && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenModal(searchResult)}
                      className="p-2 hover:bg-white rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(searchResult.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                )}
              </div>

              {/* Vehicle Info */}
              <div className="bg-white rounded-xl p-4 mb-4">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Car className="w-8 h-8 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 tracking-wider">{formatPlateDisplay(searchResult.plateNumber)}</h3>
                    <p className="text-gray-500">
                      {searchResult.brand} {searchResult.model} • {searchResult.color}
                      {searchResult.year && ` • ${searchResult.year}`}
                    </p>
                    {searchResult.ownerType && (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        searchResult.ownerType === 'individual' ? 'bg-blue-100 text-blue-700' :
                        searchResult.ownerType === 'legal_entity' ? 'bg-purple-100 text-purple-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {getOwnerTypeIcon(searchResult.ownerType)}
                        {language === 'ru'
                          ? VEHICLE_OWNER_TYPE_LABELS[searchResult.ownerType].label
                          : VEHICLE_OWNER_TYPE_LABELS[searchResult.ownerType].labelUz}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Car className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Тип транспорта' : 'Transport turi'}</p>
                        <p className="font-medium">
                          {language === 'ru'
                            ? VEHICLE_TYPE_LABELS[searchResult.type].label
                            : VEHICLE_TYPE_LABELS[searchResult.type].labelUz}
                        </p>
                      </div>
                    </div>
                    {searchResult.parkingSpot && (
                      <div className="flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">{language === 'ru' ? 'Парковочное место' : 'Avtoturargoh joyi'}</p>
                          <p className="font-medium">{searchResult.parkingSpot}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Дата регистрации' : 'Ro\'yxatga olingan sana'}</p>
                        <p className="font-medium">{formatDate(searchResult.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Owner Info */}
              <div className="bg-white rounded-xl p-4">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary-500" />
                  {language === 'ru' ? 'Информация о владельце' : 'Egasi haqida ma\'lumot'}
                </h4>

                <div className="space-y-3">
                  {/* Owner Name - always show */}
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{language === 'ru' ? 'Владелец' : 'Egasi'}</p>
                      <p className="font-medium text-lg">{searchResult.ownerName || (language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan')}</p>
                    </div>
                  </div>

                  {/* Company Name - show if exists */}
                  {searchResult.companyName && (
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Компания' : 'Kompaniya'}</p>
                        <p className="font-medium">{searchResult.companyName}</p>
                      </div>
                    </div>
                  )}

                  {/* Phone - always show */}
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{language === 'ru' ? 'Телефон' : 'Telefon'}</p>
                      {searchResult.ownerPhone ? (
                        <a href={`tel:${searchResult.ownerPhone}`} className="font-medium text-primary-600 hover:underline">
                          {searchResult.ownerPhone}
                        </a>
                      ) : (
                        <p className="font-medium text-gray-400">{language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan'}</p>
                      )}
                    </div>
                  </div>

                  {/* Apartment - show if exists */}
                  {searchResult.apartment && (
                    <div className="flex items-center gap-3">
                      <Home className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Квартира' : 'Kvartira'}</p>
                        <p className="font-medium">{searchResult.apartment}</p>
                      </div>
                    </div>
                  )}

                  {/* Address - show if exists and not service vehicle */}
                  {searchResult.address && searchResult.address !== 'Служебный автомобиль' && (
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Адрес' : 'Manzil'}</p>
                        <p className="font-medium">{searchResult.address}</p>
                      </div>
                    </div>
                  )}
                </div>

                {searchResult.notes && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="text-xs text-yellow-600 font-medium">{language === 'ru' ? 'Примечание' : 'Izoh'}</p>
                        <p className="text-sm text-yellow-700">{searchResult.notes}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Not Found State */}
      {hasSearched && filteredVehicles.length === 0 && (searchPlateParts.region || searchPlateParts.digits) && (
        <div className="glass-card p-8 text-center border-2 border-red-200 bg-red-50/50">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h3 className="text-lg font-semibold text-red-700 mb-2">
            {language === 'ru' ? 'Автомобиль не найден' : 'Avtomobil topilmadi'}
          </h3>
          <p className="text-red-600 text-sm">
            {language === 'ru'
              ? 'По введённым данным автомобиль не найден в системе'
              : 'Kiritilgan ma\'lumotlar bo\'yicha avtomobil topilmadi'}
          </p>
        </div>
      )}

      {/* All Vehicles Toggle - Only for managers/admins */}
      {isManager && vehicles.length > 0 && (
        <div className="glass-card p-4">
          <button
            onClick={() => setShowAllVehicles(!showAllVehicles)}
            className="w-full flex items-center justify-between py-2"
          >
            <span className="font-medium text-gray-700">
              {language === 'ru' ? 'Все зарегистрированные автомобили' : 'Barcha ro\'yxatga olingan avtomobillar'}
              <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-100 text-primary-600 text-sm">
                {vehicles.length}
              </span>
            </span>
            <span className="text-primary-500 text-sm">
              {showAllVehicles ? (language === 'ru' ? 'Скрыть' : 'Yashirish') : (language === 'ru' ? 'Показать' : 'Ko\'rsatish')}
            </span>
          </button>

          {showAllVehicles && (
            <div className="mt-4 space-y-3">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => handleQuickSearch(vehicle)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Car className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 tracking-wider">{formatPlateDisplay(vehicle.plateNumber)}</p>
                        {vehicle.ownerType && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                            vehicle.ownerType === 'individual' ? 'bg-blue-100 text-blue-600' :
                            vehicle.ownerType === 'legal_entity' ? 'bg-purple-100 text-purple-600' :
                            'bg-orange-100 text-orange-600'
                          }`}>
                            {getOwnerTypeIcon(vehicle.ownerType)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {vehicle.brand} {vehicle.model} • {vehicle.ownerName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-600">
                      {vehicle.apartment ? `${language === 'ru' ? 'Кв.' : 'Kv.'} ${vehicle.apartment}` : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {vehicles.length === 0 && !hasSearched && (
        <div className="glass-card p-12 text-center">
          <Car className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">
            {language === 'ru' ? 'Нет зарегистрированных автомобилей' : 'Ro\'yxatga olingan avtomobillar yo\'q'}
          </h3>
          <p className="text-gray-400 mb-4">
            {language === 'ru'
              ? 'Жители еще не добавили свои автомобили в систему'
              : 'Aholi hali avtomobillarini tizimga qo\'shmagan'}
          </p>
          {isManager && (
            <button
              onClick={() => handleOpenModal()}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {language === 'ru' ? 'Добавить служебное авто' : 'Xizmat avtosini qo\'shish'}
            </button>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold">
                {editingVehicle
                  ? (language === 'ru' ? 'Редактировать авто' : 'Avtoni tahrirlash')
                  : (language === 'ru' ? 'Добавить служебное авто' : 'Xizmat avtosini qo\'shish')}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Owner Type + Company Name */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {language === 'ru' ? 'Тип владельца' : 'Egasi turi'}
                  </label>
                  <div className="flex gap-2">
                    {ownerTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedOwnerType(type)}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-xl border-2 transition-all text-sm ${
                          selectedOwnerType === type
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span>{VEHICLE_OWNER_TYPE_LABELS[type].icon}</span>
                        <span className="font-medium">
                          {language === 'ru' ? VEHICLE_OWNER_TYPE_LABELS[type].label : VEHICLE_OWNER_TYPE_LABELS[type].labelUz}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {language === 'ru' ? 'Название/Компания' : 'Nomi/Kompaniya'}
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder={language === 'ru' ? 'УК "Название" / ООО "Компания"' : 'BK "Nomi" / MChJ'}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none"
                  />
                </div>
              </div>

              {/* Plate Number */}
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                  {language === 'ru' ? 'Номер автомобиля' : 'Avtomobil raqami'}
                </label>
                <PlateNumberInput
                  value={plateParts}
                  onChange={(newParts) => { setPlateParts(newParts); setPlateError(null); }}
                  language={language}
                />
                {plateError && (
                  <div className="flex items-center justify-center gap-1 mt-2 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {plateError}
                  </div>
                )}
              </div>

              {/* Vehicle Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Тип транспорта' : 'Transport turi'}</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as VehicleType })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none text-sm"
                    required
                  >
                    {Object.entries(VEHICLE_TYPE_LABELS).map(([key, labels]) => (
                      <option key={key} value={key}>{language === 'ru' ? labels.label : labels.labelUz}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Марка' : 'Markasi'}</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Chevrolet"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Модель' : 'Modeli'}</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="Damas"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Цвет' : 'Rangi'}</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder={language === 'ru' ? 'Белый' : 'Oq'}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Год' : 'Yili'}</label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    placeholder="2020"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Парковка' : 'Avtoturargoh'}</label>
                  <input
                    type="text"
                    value={formData.parkingSpot}
                    onChange={(e) => setFormData({ ...formData, parkingSpot: e.target.value })}
                    placeholder="S-01"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none text-sm"
                  />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Примечания' : 'Izohlar'}</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={language === 'ru' ? 'Машина для вывоза мусора...' : 'Chiqindilarni olib ketish mashinasi...'}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 outline-none text-sm"
                  />
                </div>
              </div>
            </form>

            <div className="p-4 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  type="submit"
                  onClick={handleSubmit}
                  className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 transition-all"
                >
                  {editingVehicle ? (language === 'ru' ? 'Сохранить' : 'Saqlash') : (language === 'ru' ? 'Добавить' : 'Qo\'shish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-center mb-2">
              {language === 'ru' ? 'Удалить автомобиль?' : 'Avtomobilni o\'chirish?'}
            </h3>
            <p className="text-gray-500 text-center text-sm mb-6">
              {language === 'ru' ? 'Это действие нельзя отменить' : 'Bu amalni bekor qilib bo\'lmaydi'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                {language === 'ru' ? 'Удалить' : 'O\'chirish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
