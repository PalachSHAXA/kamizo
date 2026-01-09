import { useState, useRef, useEffect, useMemo } from 'react';
import { Car, Plus, X, Edit2, Trash2, AlertTriangle, AlertCircle, Search, MapPin, Calendar, Building2, User, Phone, Home } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Vehicle, VehicleType, VehicleOwnerType } from '../types';
import { VEHICLE_TYPE_LABELS, VEHICLE_OWNER_TYPE_LABELS } from '../types';

// Uzbekistan plate number formats:
// Individual (Физ. лицо): 01 A 123 EA (region + 1 letter + 3 digits + 2 letters)
// Legal entity (Юр. лицо): 01 123 EAA (region + 3 digits + 3 letters)

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

interface PlateNumberInputProps {
  ownerType: VehicleOwnerType;
  value: { region: string; letters1: string; digits: string; letters2: string };
  onChange: (value: { region: string; letters1: string; digits: string; letters2: string }) => void;
  language: string;
}

// UZ Flag component - responsive
const UZFlag = ({ className = "w-8 h-5 sm:w-12 sm:h-8" }: { className?: string }) => (
  <svg viewBox="0 0 30 20" className={className}>
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
  const isLegalFormat = value.letters1 === '' && value.digits.length > 0;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative bg-white border-[3px] border-black rounded-xl shadow-xl overflow-visible w-full max-w-[380px]">
        <div className="flex items-center h-14 sm:h-20 bg-white rounded-xl">
          <div className="relative flex items-center justify-center border-r-2 border-black h-full px-2 sm:px-3 bg-gray-50 rounded-l-xl">
            <button
              type="button"
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="text-2xl sm:text-4xl font-bold text-center hover:text-primary-600 transition-colors cursor-pointer min-w-[36px] sm:min-w-[50px]"
            >
              {value.region || <span className="text-gray-300">01</span>}
            </button>

            {showRegionDropdown && (
              <>
                <div className="fixed inset-0 z-[89]" onClick={() => setShowRegionDropdown(false)} />
                <div className="absolute top-full left-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto min-w-[280px]">
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

          <div className="flex-1 flex items-center justify-center px-1 sm:px-2 gap-0.5 sm:gap-1">
            <input
              ref={letters1Ref}
              type="text"
              value={value.letters1}
              onChange={handleLetters1Change}
              onKeyDown={(e) => handleKeyDown(e, 'letters1')}
              className="w-6 sm:w-10 text-2xl sm:text-4xl font-bold text-center outline-none bg-transparent uppercase"
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
              className="w-14 sm:w-20 text-2xl sm:text-4xl font-bold text-center outline-none bg-transparent tracking-wider"
              placeholder="123"
              maxLength={3}
            />
            <input
              ref={letters2Ref}
              type="text"
              value={value.letters2}
              onChange={handleLetters2Change}
              onKeyDown={(e) => handleKeyDown(e, 'letters2')}
              className="w-12 sm:w-20 text-2xl sm:text-4xl font-bold text-center outline-none bg-transparent uppercase"
              placeholder={isLegalFormat ? 'ABC' : 'BC'}
              maxLength={3}
            />
          </div>

          <div className="flex flex-col items-center justify-center border-l-2 border-black h-full px-1.5 sm:px-3 bg-gray-50 rounded-r-xl">
            <UZFlag />
            <span className="text-xs sm:text-sm font-bold mt-0.5">UZ</span>
          </div>
        </div>
      </div>

      {selectedRegion && (
        <p className="text-sm text-primary-600 mt-3 font-medium">
          {language === 'ru' ? selectedRegion.name : selectedRegion.nameUz}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1">
        {language === 'ru' ? 'Введите любую часть номера для поиска' : 'Qidirish uchun raqamning istalgan qismini kiriting'}
      </p>
    </div>
  );
}

// Beautiful plate number input component like avtoraqam.uzex.uz
function PlateNumberInput({ ownerType, value, onChange, language }: PlateNumberInputProps) {
  const letters1Ref = useRef<HTMLInputElement>(null);
  const digitsRef = useRef<HTMLInputElement>(null);
  const letters2Ref = useRef<HTMLInputElement>(null);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  const handleRegionSelect = (code: string) => {
    onChange({ ...value, region: code });
    setShowRegionDropdown(false);
    setTimeout(() => {
      if (ownerType === 'legal_entity' || ownerType === 'service') {
        digitsRef.current?.focus();
      } else {
        letters1Ref.current?.focus();
      }
    }, 100);
  };

  const handleLetters1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    onChange({ ...value, letters1: val });
    if (val.length === 1) {
      digitsRef.current?.focus();
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
    const maxLen = ownerType === 'legal_entity' || ownerType === 'service' ? 3 : 2;
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, maxLen);
    onChange({ ...value, letters2: val });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'letters1' | 'digits' | 'letters2') => {
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
      if (field === 'letters2') digitsRef.current?.focus();
      else if (field === 'digits') {
        if (ownerType !== 'legal_entity' && ownerType !== 'service') {
          letters1Ref.current?.focus();
        }
      }
    }
  };

  // Get selected region name
  const selectedRegion = UZ_REGIONS.find(r => r.code === value.region);

  return (
    <div className="flex flex-col items-center w-full">
      {/* License plate like avtoraqam.uzex.uz */}
      <div className="relative bg-white border-[3px] border-black rounded-xl shadow-xl overflow-visible w-full max-w-[420px]">
        <div className="flex items-center h-16 sm:h-24 bg-white rounded-xl">
          {/* Region section with dropdown */}
          <div className="relative flex items-center justify-center border-r-2 border-black h-full px-2 sm:px-4 bg-gray-50 rounded-l-xl">
            <button
              type="button"
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="text-3xl sm:text-5xl font-bold text-center hover:text-primary-600 transition-colors cursor-pointer min-w-[40px] sm:min-w-[60px]"
            >
              {value.region || <span className="text-gray-300">01</span>}
            </button>

            {/* Region dropdown */}
            {showRegionDropdown && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setShowRegionDropdown(false)} />
                <div className="absolute top-full left-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl z-[101] max-h-72 overflow-y-auto min-w-[280px]">
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

          {/* Number section */}
          <div className="flex-1 flex items-center justify-center px-1 sm:px-4">
            {ownerType !== 'legal_entity' && ownerType !== 'service' ? (
              // Individual: A 123 EA
              <div className="flex items-center gap-1 sm:gap-3">
                <input
                  ref={letters1Ref}
                  type="text"
                  value={value.letters1}
                  onChange={handleLetters1Change}
                  onKeyDown={(e) => handleKeyDown(e, 'letters1')}
                  className="w-8 sm:w-14 text-3xl sm:text-5xl font-bold text-center outline-none bg-transparent uppercase"
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
                  className="w-16 sm:w-28 text-3xl sm:text-5xl font-bold text-center outline-none bg-transparent tracking-wider"
                  placeholder="123"
                  maxLength={3}
                />
                <input
                  ref={letters2Ref}
                  type="text"
                  value={value.letters2}
                  onChange={handleLetters2Change}
                  onKeyDown={(e) => handleKeyDown(e, 'letters2')}
                  className="w-12 sm:w-20 text-3xl sm:text-5xl font-bold text-center outline-none bg-transparent uppercase"
                  placeholder="EA"
                  maxLength={2}
                />
              </div>
            ) : (
              // Legal entity/Service: 123 EAA
              <div className="flex items-center gap-1 sm:gap-3">
                <input
                  ref={digitsRef}
                  type="text"
                  inputMode="numeric"
                  value={value.digits}
                  onChange={handleDigitsChange}
                  onKeyDown={(e) => handleKeyDown(e, 'digits')}
                  className="w-16 sm:w-28 text-3xl sm:text-5xl font-bold text-center outline-none bg-transparent tracking-wider"
                  placeholder="123"
                  maxLength={3}
                />
                <input
                  ref={letters2Ref}
                  type="text"
                  value={value.letters2}
                  onChange={handleLetters2Change}
                  onKeyDown={(e) => handleKeyDown(e, 'letters2')}
                  className="w-16 sm:w-28 text-3xl sm:text-5xl font-bold text-center outline-none bg-transparent uppercase"
                  placeholder="EAA"
                  maxLength={3}
                />
              </div>
            )}
          </div>

          {/* Flag section */}
          <div className="flex flex-col items-center justify-center border-l-2 border-black h-full px-1.5 sm:px-3 bg-gray-50 rounded-r-xl">
            <UZFlag />
            <span className="text-xs sm:text-base font-bold mt-0.5 sm:mt-1">UZ</span>
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

// Parse plate number to parts
function parsePlateNumber(plate: string, ownerType: VehicleOwnerType): { region: string; letters1: string; digits: string; letters2: string } {
  const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (ownerType === 'legal_entity' || ownerType === 'service') {
    // Format: 01123EAA
    return {
      region: cleaned.slice(0, 2),
      letters1: '',
      digits: cleaned.slice(2, 5),
      letters2: cleaned.slice(5, 8),
    };
  } else {
    // Format: 01A123EA
    return {
      region: cleaned.slice(0, 2),
      letters1: cleaned.slice(2, 3),
      digits: cleaned.slice(3, 6),
      letters2: cleaned.slice(6, 8),
    };
  }
}

// Combine parts to plate number
function combinePlateNumber(parts: { region: string; letters1: string; digits: string; letters2: string }, ownerType: VehicleOwnerType): string {
  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return `${parts.region}${parts.digits}${parts.letters2}`.toUpperCase();
  } else {
    return `${parts.region}${parts.letters1}${parts.digits}${parts.letters2}`.toUpperCase();
  }
}

// Validate plate number
function validatePlateNumber(parts: { region: string; letters1: string; digits: string; letters2: string }, ownerType: VehicleOwnerType): boolean {
  const region = parseInt(parts.region);
  if (isNaN(region) || region < 1 || region > 99) return false;

  if (ownerType === 'legal_entity' || ownerType === 'service') {
    return parts.digits.length === 3 && parts.letters2.length === 3;
  } else {
    return parts.letters1.length === 1 && parts.digits.length === 3 && parts.letters2.length === 2;
  }
}

export function ResidentVehiclesPage() {
  const { user } = useAuthStore();
  const { addVehicle, updateVehicle, deleteVehicle, fetchVehicles, searchVehiclesByPlate } = useDataStore();
  const { language } = useLanguageStore();

  // Fetch vehicles from D1 database on mount (run once using ref to prevent duplicates)
  // Only fetch when user is authenticated to prevent 401 errors
  const hasFetched = useRef(false);
  useEffect(() => {
    if (!hasFetched.current && user) {
      hasFetched.current = true;
      fetchVehicles();
    }
  }, [fetchVehicles, user]);

  const [activeTab, setActiveTab] = useState<'my_vehicles' | 'search'>('my_vehicles');
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);

  // Search state
  const [searchPlateParts, setSearchPlateParts] = useState({ region: '', letters1: '', digits: '', letters2: '' });
  // State for manually selected search result (when user clicks on a vehicle)
  const [manuallySelectedResult, setManuallySelectedResult] = useState<Vehicle | null>(null);
  // API search results (for searching all vehicles in the system)
  const [apiSearchResults, setApiSearchResults] = useState<Vehicle[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Owner type for form
  const [selectedOwnerType, setSelectedOwnerType] = useState<VehicleOwnerType>('individual');

  // Plate number parts
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

  // Memoize vehicles to prevent infinite useEffect loop
  // getVehiclesByOwner creates a new array on each call, causing reference changes
  const vehiclesData = useDataStore(state => state.vehicles);
  const vehicles = useMemo(() => {
    if (!user) return [];
    return vehiclesData.filter(v => v.ownerId === user.id);
  }, [vehiclesData, user]);

  const resetForm = () => {
    setFormData({
      brand: '',
      model: '',
      color: '',
      year: '',
      type: 'car',
      companyName: '',
      parkingSpot: '',
      notes: '',
    });
    setPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
    setSelectedOwnerType('individual');
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

  // Reset plate parts when owner type changes
  useEffect(() => {
    if (!editingVehicle) {
      setPlateParts(prev => ({ region: prev.region, letters1: '', digits: '', letters2: '' }));
    }
  }, [selectedOwnerType, editingVehicle]);

  // Filter vehicles based on search plate parts - memoized to prevent unnecessary re-renders
  const searchPattern = useMemo(() => {
    const { region, letters1, digits, letters2 } = searchPlateParts;
    return `${region}${letters1}${digits}${letters2}`.toUpperCase();
  }, [searchPlateParts]);

  const hasSearchInput = useMemo(() => {
    const { region, letters1, digits, letters2 } = searchPlateParts;
    return !!(region || letters1 || digits || letters2);
  }, [searchPlateParts]);

  // Search via API when search pattern changes (debounced)
  useEffect(() => {
    if (!hasSearchInput || searchPattern.length < 2) {
      setApiSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Use API to search all vehicles in the system
        console.log('[Vehicle Search] Searching for:', searchPattern);
        const results = await searchVehiclesByPlate(searchPattern);
        console.log('[Vehicle Search] Results:', results);
        setApiSearchResults(results);
      } catch (err) {
        console.error('[Vehicle Search] Error:', err);
        setApiSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchPattern, hasSearchInput, searchVehiclesByPlate]);

  // Combined search result: either manually selected or auto-selected when only 1 match
  const searchResult = useMemo(() => {
    if (manuallySelectedResult) return manuallySelectedResult;
    if (apiSearchResults.length === 1) return apiSearchResults[0];
    return null;
  }, [apiSearchResults, manuallySelectedResult]);

  // Alias for filtered vehicles
  const filteredVehicles = apiSearchResults;
  const hasSearched = hasSearchInput;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate plate number
    if (!validatePlateNumber(plateParts, selectedOwnerType)) {
      setPlateError(
        language === 'ru'
          ? 'Заполните все поля номера авто'
          : 'Avto raqamining barcha maydonlarini to\'ldiring'
      );
      return;
    }

    const plateNumber = combinePlateNumber(plateParts, selectedOwnerType);

    const vehicleData = {
      ownerId: user.id,
      ownerName: user.name,
      ownerPhone: user.phone,
      apartment: (user as any).apartment || '',
      address: (user as any).address || 'ул. Мустакиллик, 15',
      plateNumber,
      brand: formData.brand,
      model: formData.model,
      color: formData.color,
      year: formData.year ? parseInt(formData.year) : undefined,
      type: formData.type,
      ownerType: selectedOwnerType,
      companyName: selectedOwnerType !== 'individual' ? formData.companyName : undefined,
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
  };

  const handleQuickSearch = (vehicle: Vehicle) => {
    setManuallySelectedResult(vehicle);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatPlateDisplay = (plate: string) => {
    // Format for display: 01 A 123 EA or 01 123 EAA
    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length === 8 && /^\d{2}[A-Z]\d{3}[A-Z]{2}$/.test(cleaned)) {
      return `${cleaned.slice(0,2)} ${cleaned.slice(2,3)} ${cleaned.slice(3,6)} ${cleaned.slice(6,8)}`;
    }
    if (cleaned.length === 8 && /^\d{5}[A-Z]{3}$/.test(cleaned)) {
      return `${cleaned.slice(0,2)} ${cleaned.slice(2,5)} ${cleaned.slice(5,8)}`;
    }
    return plate;
  };

  const getOwnerTypeIcon = (type: VehicleOwnerType) => {
    switch (type) {
      case 'individual': return <User className="w-4 h-4" />;
      case 'legal_entity': return <Building2 className="w-4 h-4" />;
      case 'service': return <Car className="w-4 h-4" />;
    }
  };

  const tabs = [
    {
      id: 'my_vehicles' as const,
      label: language === 'ru' ? 'Мои авто' : 'Avtomobillarim',
      icon: Car,
      count: vehicles.length
    },
    {
      id: 'search' as const,
      label: language === 'ru' ? 'Поиск' : 'Qidirish',
      icon: Search
    },
  ];

  const ownerTypes: VehicleOwnerType[] = ['individual', 'legal_entity'];

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <Car className="w-7 h-7 text-blue-500" />
          {language === 'ru' ? 'Мои автомобили' : 'Mening avtomobillarim'}
        </h1>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">
            {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
          </span>
        </button>
      </div>

      {/* Tabs */}
      <div className="glass-card p-1.5 md:p-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-1 md:inline-flex min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'my_vehicles') {
                  setSearchPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
                  setManuallySelectedResult(null);
                }
              }}
              className={`px-4 py-3 md:py-2 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap touch-manipulation ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-gray-900 shadow-md'
                  : 'hover:bg-white/30 active:bg-white/50 text-gray-600'
              }`}
            >
              <tab.icon className="w-5 h-5 md:w-4 md:h-4" />
              <span className="text-sm md:text-base">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs text-white font-medium bg-blue-500`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* My Vehicles Tab */}
      {activeTab === 'my_vehicles' && (
        <>
          {/* Info Card */}
          <div className="glass-card p-4 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Car className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                {language === 'ru'
                  ? 'Зарегистрируйте свои автомобили для быстрой идентификации на территории комплекса. Это поможет охране и управляющей компании.'
                  : 'Avtomobillaringizni majmua hududida tez aniqlash uchun ro\'yxatdan o\'tkazing. Bu qo\'riqlash va boshqaruv kompaniyasiga yordam beradi.'}
              </p>
            </div>
          </div>

          {/* Vehicles List */}
          {vehicles.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Car className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                {language === 'ru' ? 'Нет зарегистрированных авто' : 'Ro\'yxatdan o\'tgan avtomobillar yo\'q'}
              </h3>
              <p className="text-gray-400 mb-4">
                {language === 'ru'
                  ? 'Добавьте свой автомобиль, нажав кнопку выше'
                  : 'Yuqoridagi tugmani bosib avtomobilingizni qo\'shing'}
              </p>
              <button
                onClick={() => handleOpenModal()}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                {language === 'ru' ? 'Добавить первый авто' : 'Birinchi avtoni qo\'shish'}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="glass-card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                        <Car className="w-6 h-6 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 tracking-wider">
                          {formatPlateDisplay(vehicle.plateNumber)}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {vehicle.brand} {vehicle.model}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleOpenModal(vehicle)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(vehicle.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {vehicle.ownerType && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          vehicle.ownerType === 'individual' ? 'bg-blue-100 text-blue-700' :
                          vehicle.ownerType === 'legal_entity' ? 'bg-purple-100 text-purple-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {getOwnerTypeIcon(vehicle.ownerType)}
                          {language === 'ru'
                            ? VEHICLE_OWNER_TYPE_LABELS[vehicle.ownerType].label
                            : VEHICLE_OWNER_TYPE_LABELS[vehicle.ownerType].labelUz}
                        </span>
                      </div>
                    )}
                    {vehicle.companyName && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{language === 'ru' ? 'Компания' : 'Kompaniya'}:</span>
                        <span className="text-gray-900 font-medium">{vehicle.companyName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Тип' : 'Turi'}:</span>
                      <span className="text-gray-900">
                        {language === 'ru'
                          ? VEHICLE_TYPE_LABELS[vehicle.type].label
                          : VEHICLE_TYPE_LABELS[vehicle.type].labelUz}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Цвет' : 'Rangi'}:</span>
                      <span className="text-gray-900">{vehicle.color}</span>
                    </div>
                    {vehicle.year && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{language === 'ru' ? 'Год' : 'Yili'}:</span>
                        <span className="text-gray-900">{vehicle.year}</span>
                      </div>
                    )}
                    {vehicle.parkingSpot && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{language === 'ru' ? 'Парковка' : 'Avtoturargoh'}:</span>
                        <span className="text-gray-900">{vehicle.parkingSpot}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-500" />
              {language === 'ru' ? 'Поиск автомобиля' : 'Avtomobil qidirish'}
            </h2>
            <span className="text-sm text-gray-500">
              {language === 'ru' ? 'Всего:' : 'Jami:'} {vehicles.length}
            </span>
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
                    setManuallySelectedResult(filteredVehicles[0]);
                  }
                }}
              />

              {/* Clear search button */}
              {(searchPlateParts.region || searchPlateParts.letters1 || searchPlateParts.digits || searchPlateParts.letters2) && (
                <button
                  onClick={() => {
                    setSearchPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
                    setManuallySelectedResult(null);
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
                  <button
                    key={vehicle.id}
                    type="button"
                    className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-primary-50 cursor-pointer transition-colors border-2 border-transparent hover:border-primary-300 active:scale-[0.99] text-left"
                    onClick={() => setManuallySelectedResult(vehicle)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Car className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 tracking-wider">{formatPlateDisplay(vehicle.plateNumber)}</p>
                        <p className="text-sm text-gray-500">
                          {vehicle.brand} {vehicle.model} • {vehicle.color}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-primary-500">
                      <span className="text-sm font-medium hidden sm:inline">
                        {language === 'ru' ? 'Подробнее' : 'Batafsil'}
                      </span>
                      <Search className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Result */}
          {searchResult && (
            <div className="glass-card p-6 border-2 border-green-200 bg-green-50/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <Car className="w-4 h-4 text-green-600" />
                </div>
                <h2 className="text-lg font-bold text-green-700">
                  {language === 'ru' ? 'Автомобиль найден!' : 'Avtomobil topildi!'}
                </h2>
              </div>

              <div className="bg-white rounded-xl p-4 mb-4">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Car className="w-8 h-8 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 tracking-wider">
                      {formatPlateDisplay(searchResult.plateNumber)}
                    </h3>
                    <p className="text-gray-500">
                      {searchResult.brand} {searchResult.model} • {searchResult.color}
                      {searchResult.year && ` • ${searchResult.year}`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    {/* Owner info */}
                    {searchResult.ownerName && (
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">{language === 'ru' ? 'Владелец' : 'Egasi'}</p>
                          <p className="font-medium">{searchResult.ownerName}</p>
                        </div>
                      </div>
                    )}
                    {/* Phone */}
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Телефон' : 'Telefon'}</p>
                        {searchResult.ownerPhone ? (
                          <a href={`tel:${searchResult.ownerPhone}`} className="font-medium text-primary-600 hover:underline">
                            {searchResult.ownerPhone}
                          </a>
                        ) : (
                          <p className="font-medium text-gray-400">{language === 'ru' ? 'Не указан' : 'Ko\'rsatilmagan'}</p>
                        )}
                      </div>
                    </div>
                    {/* Apartment */}
                    {searchResult.apartment && (
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">{language === 'ru' ? 'Квартира' : 'Kvartira'}</p>
                          <p className="font-medium">{language === 'ru' ? 'Кв.' : ''} {searchResult.apartment}</p>
                        </div>
                      </div>
                    )}
                    {/* Address */}
                    {searchResult.address && searchResult.address !== 'Служебный автомобиль' && (
                      <div className="flex items-center gap-3">
                        <Home className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">{language === 'ru' ? 'Адрес' : 'Manzil'}</p>
                          <p className="font-medium">{searchResult.address}</p>
                        </div>
                      </div>
                    )}
                  </div>
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

              {/* Only show edit button if user owns this vehicle */}
              {user && searchResult.ownerId === user.id && (
                <button
                  onClick={() => handleOpenModal(searchResult)}
                  className="w-full py-3 px-4 rounded-xl font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  {language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                </button>
              )}
            </div>
          )}

          {/* Loading State */}
          {isSearching && (
            <div className="glass-card p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500">
                {language === 'ru' ? 'Поиск...' : 'Qidirilmoqda...'}
              </p>
            </div>
          )}

          {/* Not Found State */}
          {!isSearching && hasSearched && filteredVehicles.length === 0 && (searchPlateParts.region || searchPlateParts.digits) && (
            <div className="glass-card p-8 text-center border-2 border-amber-200 bg-amber-50/50">
              <AlertCircle className="w-12 h-12 mx-auto text-amber-400 mb-3" />
              <h3 className="text-lg font-semibold text-amber-700 mb-2">
                {language === 'ru' ? 'Автомобиль не найден' : 'Avtomobil topilmadi'}
              </h3>
              <p className="text-amber-600 text-sm">
                {language === 'ru'
                  ? 'По введённым данным автомобиль не найден в системе'
                  : 'Kiritilgan ma\'lumotlar bo\'yicha avtomobil topilmadi'}
              </p>
            </div>
          )}

          {/* Quick list - show when no search */}
          {vehicles.length > 0 && !hasSearched && (
            <div className="glass-card p-4">
              <h3 className="font-medium text-gray-700 mb-3">
                {language === 'ru' ? 'Ваши автомобили' : 'Sizning avtomobillaringiz'}
              </h3>
              <div className="space-y-2">
                {vehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-primary-50 cursor-pointer transition-colors border-2 border-transparent hover:border-primary-300 active:scale-[0.99] text-left"
                    onClick={() => handleQuickSearch(vehicle)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Car className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 tracking-wider">{formatPlateDisplay(vehicle.plateNumber)}</p>
                        <p className="text-sm text-gray-500">
                          {vehicle.brand} {vehicle.model}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-primary-500">
                      <span className="text-sm font-medium hidden sm:inline">
                        {language === 'ru' ? 'Подробнее' : 'Batafsil'}
                      </span>
                      <Search className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {vehicles.length === 0 && !hasSearched && (
            <div className="glass-card p-12 text-center">
              <Car className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                {language === 'ru' ? 'Нет автомобилей для поиска' : 'Qidirish uchun avtomobillar yo\'q'}
              </h3>
              <p className="text-gray-400 mb-4">
                {language === 'ru'
                  ? 'Сначала добавьте свои автомобили'
                  : 'Avval avtomobillaringizni qo\'shing'}
              </p>
              <button
                onClick={() => {
                  setActiveTab('my_vehicles');
                  handleOpenModal();
                }}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                {language === 'ru' ? 'Добавить авто' : 'Avto qo\'shish'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal - Mobile full-screen, centered on desktop */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 md:flex md:items-center md:justify-center">
          <div className="h-full md:h-auto w-full md:max-w-2xl md:mx-4 bg-white md:rounded-2xl overflow-hidden md:max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold">
                {editingVehicle
                  ? (language === 'ru' ? 'Редактировать авто' : 'Avtoni tahrirlash')
                  : (language === 'ru' ? 'Добавить авто' : 'Avto qo\'shish')}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="p-3 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Owner Type + Plate Number - side by side on desktop */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Owner Type Selection */}
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
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all ${
                          selectedOwnerType === type
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-base">{VEHICLE_OWNER_TYPE_LABELS[type].icon}</span>
                        <span className="font-medium text-sm">
                          {language === 'ru' ? VEHICLE_OWNER_TYPE_LABELS[type].label : VEHICLE_OWNER_TYPE_LABELS[type].labelUz}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Company Name (for legal entity) - shows in same row */}
                {selectedOwnerType !== 'individual' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === 'ru' ? 'Название компании' : 'Kompaniya nomi'}
                    </label>
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder={language === 'ru' ? 'ООО "Компания"' : '"Kompaniya" MChJ'}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Plate Number Input - Compact */}
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                  {language === 'ru' ? 'Номер автомобиля' : 'Avtomobil raqami'}
                </label>
                <PlateNumberInput
                  ownerType={selectedOwnerType}
                  value={plateParts}
                  onChange={(newParts) => {
                    setPlateParts(newParts);
                    setPlateError(null);
                  }}
                  language={language}
                />
                {plateError && (
                  <div className="flex items-center justify-center gap-1 mt-2 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {plateError}
                  </div>
                )}
              </div>

              {/* Vehicle Details - 2 columns */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Type */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Тип транспорта' : 'Transport turi'}
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as VehicleType })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                    required
                  >
                    {Object.entries(VEHICLE_TYPE_LABELS).map(([key, labels]) => (
                      <option key={key} value={key}>
                        {language === 'ru' ? labels.label : labels.labelUz}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Brand */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Марка' : 'Markasi'}
                  </label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Chevrolet"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                    required
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Модель' : 'Modeli'}
                  </label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="Malibu"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                    required
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Цвет' : 'Rangi'}
                  </label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder={language === 'ru' ? 'Белый' : 'Oq'}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                    required
                  />
                </div>

                {/* Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Год' : 'Yili'}
                  </label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    placeholder="2020"
                    min="1990"
                    max={new Date().getFullYear()}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                  />
                </div>

                {/* Parking Spot */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Парковка' : 'Avtoturargoh'}
                  </label>
                  <input
                    type="text"
                    value={formData.parkingSpot}
                    onChange={(e) => setFormData({ ...formData, parkingSpot: e.target.value })}
                    placeholder="A-15"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                  />
                </div>

                {/* Notes - full width */}
                <div className="col-span-2 md:col-span-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Примечания' : 'Izohlar'}
                  </label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={language === 'ru' ? 'Дополнительная информация...' : 'Qo\'shimcha ma\'lumot...'}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                  />
                </div>
              </div>
            </form>

            <div className="p-4 border-t border-gray-100 bg-white safe-area-bottom">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 py-4 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
                >
                  {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  type="submit"
                  onClick={handleSubmit}
                  className="flex-1 py-4 px-4 rounded-xl font-semibold text-gray-900 bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 active:from-primary-600 active:to-primary-700 transition-all touch-manipulation"
                >
                  {editingVehicle
                    ? (language === 'ru' ? 'Сохранить' : 'Saqlash')
                    : (language === 'ru' ? 'Добавить' : 'Qo\'shish')}
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
              {language === 'ru'
                ? 'Это действие нельзя отменить'
                : 'Bu amalni bekor qilib bo\'lmaydi'}
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
