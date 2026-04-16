import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Car, User, Phone, MapPin, Home, Calendar, Info, AlertCircle, Plus, X, Building2, Edit2, Trash2, AlertTriangle, QrCode, Loader2 } from 'lucide-react';
import { EmptyState } from '../components/common';
import { formatName } from '../utils/formatName';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { apiRequest, usersApi } from '../services/api';
import type { Vehicle, VehicleType, VehicleOwnerType } from '../types';
import { VEHICLE_TYPE_LABELS, VEHICLE_OWNER_TYPE_LABELS } from '../types';
import { SearchPlateInput, PlateNumberInput, parsePlateNumber, combinePlateNumber, validatePlateNumber, formatPlateDisplay, UZFlag } from './vehicles';


// Guest vehicle result shape (from guestAccessCodes with vehicle plate)
interface GuestVehicleResult {
  plateNumber: string;
  residentName: string;
  residentApartment: string;
  residentPhone: string;
  residentAddress: string;
  visitorType: string;
  validUntil: string;
  status: string;
}

export function VehicleSearchPage() {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle, fetchVehicles, guestAccessCodes, fetchGuestCodes } = useDataStore();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  // Fetch ALL vehicles from D1 database on mount (for staff search page)
  useEffect(() => {
    fetchVehicles(true);
    fetchGuestCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [searchPlateParts, setSearchPlateParts] = useState({ region: '', letters1: '', digits: '', letters2: '' });
  const [searchResult, setSearchResult] = useState<Vehicle | null>(null);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [guestVehicleResults, setGuestVehicleResults] = useState<GuestVehicleResult[]>([]);
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

  const isManager = user?.role === 'manager' || user?.role === 'admin' || user?.role === 'director';
  const ownerTypes: VehicleOwnerType[] = ['service', 'legal_entity', 'resident'];

  // Resident search state
  const [residentSearch, setResidentSearch] = useState('');
  const [residentResults, setResidentResults] = useState<Array<{ id: string; name: string; phone?: string; apartment?: string; address?: string }>>([]);
  const [selectedResidentUser, setSelectedResidentUser] = useState<{ id: string; name: string; phone?: string; apartment?: string; address?: string } | null>(null);
  const [residentSearchLoading, setResidentSearchLoading] = useState(false);

  const resetForm = () => {
    setFormData({ brand: '', model: '', color: '', year: '', type: 'car', companyName: '', parkingSpot: '', notes: '' });
    setPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
    setSelectedOwnerType('service');
    setEditingVehicle(null);
    setPlateError(null);
    setResidentSearch('');
    setResidentResults([]);
    setSelectedResidentUser(null);
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

  // Resident search with debounce
  useEffect(() => {
    if (selectedOwnerType !== 'resident' || residentSearch.length < 2) {
      setResidentResults([]);
      return;
    }
    setResidentSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await usersApi.getAll({ role: 'resident', limit: 20 });
        const query = residentSearch.toLowerCase();
        const filtered = (res.users || [])
          .filter((u: any) =>
            u.name?.toLowerCase().includes(query) ||
            u.apartment?.toLowerCase().includes(query) ||
            u.phone?.includes(query)
          )
          .slice(0, 10)
          .map((u: any) => ({ id: u.id, name: u.name, phone: u.phone, apartment: u.apartment, address: u.address }));
        setResidentResults(filtered);
      } catch {
        setResidentResults([]);
      } finally {
        setResidentSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [residentSearch, selectedOwnerType]);

  // Search vehicles via API based on search plate parts
  useEffect(() => {
    const { region, letters1, digits, letters2 } = searchPlateParts;
    const hasInput = region || letters1 || digits || letters2;

    if (!hasInput) {
      setFilteredVehicles([]);
      setGuestVehicleResults([]);
      setSearchResult(null);
      setHasSearched(false);
      return;
    }

    // Build search query from all parts
    const searchQuery = `${region}${letters1}${digits}${letters2}`.toUpperCase();

    if (searchQuery.length < 1) return;

    // Search guest access codes for matching vehicle plates
    const matchedGuests: GuestVehicleResult[] = (guestAccessCodes || [])
      .filter(c => c.visitorVehiclePlate && c.visitorVehiclePlate.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(searchQuery))
      .map(c => ({
        plateNumber: c.visitorVehiclePlate!,
        residentName: c.residentName,
        residentApartment: c.residentApartment,
        residentPhone: c.residentPhone,
        residentAddress: c.residentAddress,
        visitorType: c.visitorType,
        validUntil: c.validUntil,
        status: c.status,
      }));
    setGuestVehicleResults(matchedGuests);

    // Search via API for accurate results across all vehicles
    const doSearch = async () => {
      try {
        const res = await apiRequest<{ vehicles: any[] }>(`/api/vehicles/search?q=${encodeURIComponent(searchQuery)}`);
        const mapped: Vehicle[] = (res.vehicles || []).map((v: any) => ({
          id: v.id,
          ownerId: v.user_id,
          ownerName: v.owner_name || '',
          ownerPhone: v.owner_phone || '',
          apartment: v.apartment || '',
          address: v.address || '',
          plateNumber: v.plate_number,
          brand: v.brand || '',
          model: v.model || '',
          color: v.color || '',
          year: v.year || undefined,
          type: (v.vehicle_type || 'car') as Vehicle['type'],
          ownerType: (v.owner_type || 'individual') as Vehicle['ownerType'],
          companyName: v.company_name || undefined,
          parkingSpot: v.parking_spot || undefined,
          notes: v.notes || undefined,
          createdAt: v.created_at,
          updatedAt: v.updated_at || undefined,
        }));

        setFilteredVehicles(mapped);
        setHasSearched(true);

        if (mapped.length === 1 && matchedGuests.length === 0) {
          setSearchResult(mapped[0]);
        } else {
          setSearchResult(null);
        }
      } catch {
        // Fallback to local search
        const filtered = vehicles.filter(v => {
          const cleanPlate = v.plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
          return cleanPlate.includes(searchQuery);
        });
        setFilteredVehicles(filtered);
        setHasSearched(true);
        if (filtered.length === 1 && matchedGuests.length === 0) {
          setSearchResult(filtered[0]);
        } else {
          setSearchResult(null);
        }
      }
    };

    // Debounce search
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [searchPlateParts, vehicles, guestAccessCodes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!validatePlateNumber(plateParts, selectedOwnerType)) {
      setPlateError(language === 'ru' ? 'Заполните все поля номера' : 'Barcha maydonlarni to\'ldiring');
      return;
    }

    const plateNumber = combinePlateNumber(plateParts, selectedOwnerType);

    // Determine owner info based on type
    let ownerName = user.name;
    let ownerPhone = user.phone;
    let apartment = '';
    let address = language === 'ru' ? 'Служебный автомобиль' : 'Xizmat avtomobili';
    let ownerId = user.id;

    if (selectedOwnerType === 'service') {
      ownerName = formData.companyName || (language === 'ru' ? 'Служебный' : 'Xizmat');
    } else if (selectedOwnerType === 'resident' && selectedResidentUser) {
      ownerId = selectedResidentUser.id;
      ownerName = selectedResidentUser.name || '';
      ownerPhone = selectedResidentUser.phone || '';
      apartment = selectedResidentUser.apartment || '';
      address = selectedResidentUser.address || '';
    } else if (selectedOwnerType === 'legal_entity') {
      ownerName = formData.companyName || user.name;
    }

    const vehicleData = {
      ownerId,
      ownerName,
      ownerPhone,
      apartment,
      address,
      plateNumber,
      brand: formData.brand,
      model: formData.model,
      color: formData.color,
      year: formData.year ? parseInt(formData.year) : undefined,
      type: formData.type,
      ownerType: selectedOwnerType === 'resident' ? 'individual' as VehicleOwnerType : selectedOwnerType,
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


  const getOwnerTypeIcon = (type?: VehicleOwnerType) => {
    if (!type) return <User className="w-4 h-4" />;
    switch (type) {
      case 'individual': return <User className="w-4 h-4" />;
      case 'resident': return <User className="w-4 h-4" />;
      case 'legal_entity': return <Building2 className="w-4 h-4" />;
      case 'service': return <Car className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold flex items-center gap-3">
          <Search className="w-7 h-7 text-primary-500" />
          {language === 'ru' ? 'Поиск автомобилей' : 'Avtomobil qidirish'}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {language === 'ru' ? 'Всего:' : 'Jami:'} {vehicles.length}
          </span>
          {isManager && (
            <button
              onClick={() => handleOpenModal()}
              className="btn-primary flex items-center gap-2 min-h-[44px] touch-manipulation"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">
                {language === 'ru' ? 'Автомобиль' : 'Avtomobil'}
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
                setGuestVehicleResults([]);
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
                  {/* ФИО владельца квартиры скрыто от security/executor ради
                      приватности жителей — им достаточно номера квартиры,
                      чтобы связаться с управляющей. */}
                  {isManager && (
                    <p className="text-sm font-medium text-gray-600">{vehicle.ownerName}</p>
                  )}
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

      {/* Guest Vehicle Results */}
      {hasSearched && guestVehicleResults.length > 0 && (
        <div className="glass-card p-4 border-2 border-amber-200 bg-amber-50/50">
          <h3 className="font-medium text-amber-700 mb-3 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-500" />
            {language === 'ru' ? 'Гостевые авто (по пропускам)' : 'Mehmon avtolari (ruxsatnomalar bo\'yicha)'}
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 text-sm">
              {guestVehicleResults.length}
            </span>
          </h3>
          <div className="space-y-2">
            {guestVehicleResults.map((g, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-amber-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Car className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 tracking-wider">{formatPlateDisplay(g.plateNumber)}</p>
                    <p className="text-xs text-amber-700 font-medium">
                      {language === 'ru' ? 'Гость' : 'Mehmon'} • {new Date(g.validUntil) > new Date()
                        ? (language === 'ru' ? '✓ Активен' : '✓ Faol')
                        : (language === 'ru' ? '✗ Истёк' : '✗ Tugagan')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-600" title={g.residentName}>{formatName(g.residentName)}</p>
                  {g.residentApartment && (
                    <p className="text-xs text-gray-400">
                      {language === 'ru' ? 'Кв.' : 'Kv.'} {g.residentApartment}
                    </p>
                  )}
                  {g.residentPhone && (
                    <a href={`tel:${g.residentPhone}`} className="text-xs text-primary-600 hover:underline">
                      {g.residentPhone}
                    </a>
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
                          ? (VEHICLE_OWNER_TYPE_LABELS[searchResult.ownerType]?.label ?? searchResult.ownerType)
                          : (VEHICLE_OWNER_TYPE_LABELS[searchResult.ownerType]?.labelUz ?? searchResult.ownerType)}
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
                            ? (VEHICLE_TYPE_LABELS[searchResult.type]?.label ?? searchResult.type)
                            : (VEHICLE_TYPE_LABELS[searchResult.type]?.labelUz ?? searchResult.type)}
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
                  {/* Owner Name — hidden from security/executor for privacy.
                      Non-management see "Собственник квартиры" label instead
                      of the actual FIO. */}
                  {isManager ? (
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Владелец' : 'Egasi'}</p>
                        <p className="font-medium text-lg">{searchResult.ownerName || (language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">{language === 'ru' ? 'Владелец' : 'Egasi'}</p>
                        <p className="font-medium text-sm text-gray-400">
                          {language === 'ru' ? 'Скрыто' : 'Yashirilgan'}
                        </p>
                      </div>
                    </div>
                  )}

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
      {hasSearched && filteredVehicles.length === 0 && guestVehicleResults.length === 0 && (searchPlateParts.region || searchPlateParts.digits) && (
        <EmptyState
          icon={<Car className="w-12 h-12" />}
          title={language === 'ru' ? 'Автомобиль не найден' : 'Avtomobil topilmadi'}
          description={language === 'ru'
            ? 'По введённым данным автомобиль не найден в системе'
            : 'Kiritilgan ma\'lumotlar bo\'yicha avtomobil topilmadi'}
        />
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
        <EmptyState
          icon={<Car className="w-12 h-12" />}
          title={language === 'ru' ? 'Нет зарегистрированных автомобилей' : 'Ro\'yxatga olingan avtomobillar yo\'q'}
          description={language === 'ru'
            ? 'Жители еще не добавили свои автомобили в систему'
            : 'Aholi hali avtomobillarini tizimga qo\'shmagan'}
          action={isManager ? {
            label: language === 'ru' ? 'Добавить автомобиль' : 'Avtomobil qo\'shish',
            onClick: () => handleOpenModal(),
          } : undefined}
        />
      )}

      {/* Add/Edit Modal */}
      {/* TODO: migrate to <Modal> component */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[85dvh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-base sm:text-lg font-bold">
                {editingVehicle
                  ? (language === 'ru' ? 'Редактировать авто' : 'Avtoni tahrirlash')
                  : (language === 'ru' ? 'Добавить автомобиль' : 'Avtomobil qo\'shish')}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
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

                {selectedOwnerType !== 'resident' ? (
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
                ) : (
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === 'ru' ? 'Выберите жителя' : 'Yashovchini tanlang'}
                    </label>
                    {selectedResidentUser ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary-300 bg-primary-50">
                        <User className="w-4 h-4 text-primary-600 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-sm text-gray-900">{selectedResidentUser.name}</span>
                          {selectedResidentUser.apartment && (
                            <span className="text-xs text-gray-500 ml-2">{language === 'ru' ? 'кв.' : 'xon.'} {selectedResidentUser.apartment}</span>
                          )}
                        </div>
                        <button type="button" onClick={() => { setSelectedResidentUser(null); setResidentSearch(''); }} className="p-1 hover:bg-primary-100 rounded">
                          <X className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <input
                            type="text"
                            value={residentSearch}
                            onChange={(e) => setResidentSearch(e.target.value)}
                            placeholder={language === 'ru' ? 'Поиск по ФИО, квартире, телефону...' : "FISh, xonadon, telefon bo'yicha qidirish..."}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none text-sm"
                          />
                          {residentSearchLoading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            </div>
                          )}
                        </div>
                        {residentResults.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                            {residentResults.map(r => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setSelectedResidentUser(r);
                                  setResidentSearch('');
                                  setResidentResults([]);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center gap-2 text-sm border-b border-gray-50 last:border-0"
                              >
                                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-gray-900 truncate" title={r.name}>{r.name ? formatName(r.name) : (language === 'ru' ? 'Без имени' : 'Ismsiz')}</div>
                                  <div className="text-xs text-gray-500">
                                    {r.apartment && <span>{language === 'ru' ? 'кв.' : 'xon.'} {r.apartment}</span>}
                                    {r.phone && (
                                      <a
                                        href={`tel:${r.phone}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="ml-2 hover:text-primary-600 active:text-primary-700 touch-manipulation"
                                      >
                                        {r.phone}
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Plate Number */}
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                  {language === 'ru' ? 'Номер автомобиля' : 'Avtomobil raqami'}
                </label>
                <PlateNumberInput
                  ownerType={selectedOwnerType}
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
      {/* TODO: migrate to <Modal> component */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-center mb-2">
              {language === 'ru' ? 'Удалить автомобиль?' : 'Avtomobilni o\'chirish?'}
            </h3>
            <p className="text-gray-500 text-center text-sm mb-6">
              {language === 'ru' ? 'Это действие нельзя отменить' : 'Bu amalni bekor qilib bo\'lmaydi'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 px-4 min-h-[44px] rounded-lg sm:rounded-xl font-medium bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-3 px-4 min-h-[44px] rounded-lg sm:rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-colors touch-manipulation"
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
