import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Car, Plus, X, Edit2, Trash2, AlertCircle, Search, MapPin, Calendar, Building2, User, Phone, Home, MoreHorizontal } from 'lucide-react';
import { ConfirmDialog } from '../components/common';
import { EmptyState } from '../components/common';
import { useAuthStore } from '../stores/authStore';
import { useDataStore, useVehicleStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Vehicle, VehicleType, VehicleOwnerType } from '../types';
import { VEHICLE_TYPE_LABELS, VEHICLE_OWNER_TYPE_LABELS } from '../types';
import { SearchPlateInput, PlateNumberInput, UZFlag, parsePlateNumber, combinePlateNumber, validatePlateNumber, formatPlateDisplay } from './vehicles';

// "Recent searches" persist across sessions in localStorage. Capped at 5
// entries to keep the list scannable. We store the plate exactly as the
// user typed it (raw, not formatted) plus whether it resolved to a match.
type RecentSearch = { plate: string; found: boolean; at: number };
const RECENT_SEARCHES_KEY = 'kamizo:vehicle-recent-searches';
const RECENT_SEARCHES_MAX = 5;

function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_SEARCHES_MAX) : [];
  } catch { return []; }
}

function saveRecentSearch(entry: RecentSearch): RecentSearch[] {
  const list = loadRecentSearches().filter(r => r.plate !== entry.plate);
  list.unshift(entry);
  const trimmed = list.slice(0, RECENT_SEARCHES_MAX);
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
  return trimmed;
}

function timeAgo(ts: number, lang: 'ru' | 'uz'): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === 'ru' ? 'только что' : 'hozir';
  if (mins < 60) return lang === 'ru' ? `${mins} мин назад` : `${mins} daq oldin`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ru' ? `${hrs} ч назад` : `${hrs} soat oldin`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return lang === 'ru' ? 'вчера' : 'kecha';
  if (days < 7) return lang === 'ru' ? `${days} дн назад` : `${days} kun oldin`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return lang === 'ru' ? `${weeks} нед назад` : `${weeks} hafta oldin`;
  return new Date(ts).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' });
}

// Render a license plate with the same chunked spacing as formatPlateDisplay
// but with the digits group highlighted in brand orange — matches the design's
// "01 В 333 ВА" hero where 333 stands out.
function PlateBig({ plate, accent = false }: { plate: string; accent?: boolean }) {
  const formatted = formatPlateDisplay(plate);
  const parts = formatted.split(' ');
  return (
    <span className="font-mono tracking-wider tabular-nums">
      {parts.map((part, i) => {
        const isDigitGroup = /^\d{3,}$/.test(part);
        return (
          <span
            key={i}
            className={i > 0 ? 'ml-2' : ''}
            style={accent && isDigitGroup ? { color: '#FCD34D' } : undefined}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}


export function ResidentVehiclesPage() {
  const { user } = useAuthStore();
  const { addVehicle, updateVehicle, deleteVehicle, fetchVehicles, searchVehiclesByPlate } = useDataStore();
  const { language } = useLanguageStore();
  const [searchParams] = useSearchParams();

  // Fetch vehicles from D1 database on mount (run once using ref to prevent duplicates)
  // Only fetch when user is authenticated to prevent 401 errors
  const hasFetched = useRef(false);
  useEffect(() => {
    if (!hasFetched.current && user) {
      hasFetched.current = true;
      fetchVehicles();
    }
  }, [fetchVehicles, user]);

  // Honour ?tab=search URL param so links from the home tab carousel
  // (Найти авто card) land directly on the search tab. Default is
  // 'my_vehicles' for the regular drawer link.
  const initialTab = searchParams.get('tab') === 'search' ? 'search' : 'my_vehicles';
  const [activeTab, setActiveTab] = useState<'my_vehicles' | 'search'>(initialTab);
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
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => { setRecentSearches(loadRecentSearches()); }, []);

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
  const vehiclesData = useVehicleStore(state => state.vehicles);
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
        const results = await searchVehiclesByPlate(searchPattern);
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
      apartment: user.apartment || '',
      address: user.address || 'ул. Мустакиллик, 15',
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const ownerTypes: VehicleOwnerType[] = ['individual', 'legal_entity'];

  // Primary vehicle for the hero card — first registered (oldest) wins,
  // matching the "это моя основная машина" mental model. Falls back to
  // first in the list if createdAt is missing.
  const primaryVehicle = useMemo(() => {
    if (vehicles.length === 0) return null;
    return [...vehicles].sort((a, b) =>
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    )[0];
  }, [vehicles]);

  const garageLabel = (() => {
    // Short address chip for hero header — "ДОМ 12А" feel. Falls back to
    // user.address truncated, or generic "Гараж" when nothing's set.
    const addr = (user?.address || '').trim();
    if (!addr) return language === 'ru' ? 'ГАРАЖ' : 'GARAJ';
    // Try to extract "ДОМ X" if address contains it; otherwise show address tail
    const houseMatch = addr.match(/(дом|d\.|uy)\s*[№#]?\s*(\S+)/i);
    if (houseMatch) {
      return language === 'ru' ? `ГАРАЖ · ДОМ ${houseMatch[2].toUpperCase()}` : `GARAJ · ${houseMatch[2].toUpperCase()}-UY`;
    }
    const short = addr.length > 22 ? addr.slice(0, 22) + '…' : addr;
    return language === 'ru' ? `ГАРАЖ · ${short.toUpperCase()}` : `GARAJ · ${short.toUpperCase()}`;
  })();

  const handleSubmitSearch = async () => {
    const cleanedPlate = searchPattern;
    if (!cleanedPlate || cleanedPlate.length < 2) return;
    setIsSearching(true);
    try {
      const results = await searchVehiclesByPlate(cleanedPlate);
      setApiSearchResults(results);
      if (results.length === 1) setManuallySelectedResult(results[0]);
      const formatted = formatPlateDisplay(cleanedPlate);
      setRecentSearches(saveRecentSearch({ plate: formatted, found: results.length > 0, at: Date.now() }));
    } finally {
      setIsSearching(false);
    }
  };

  const handleClickRecent = (entry: RecentSearch) => {
    const cleaned = entry.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    setSearchPlateParts(parsePlateNumber(cleaned, 'individual'));
  };

  return (
    <div className="space-y-4 md:space-y-5 pb-24 md:pb-0">
      {/* Hero — dark card with grid background. Houses both the address chip
          + featured primary vehicle (or search prompt) AND the segmented tab
          control as a single visual block. */}
      <div className="px-3 md:px-0">
        <div
          className="relative rounded-[20px] overflow-hidden p-5 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
          style={{
            background: '#161922',
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
              radial-gradient(ellipse 80% 60% at 100% 0%, rgba(var(--brand-rgb),0.18), transparent 70%)
            `,
            backgroundSize: '24px 24px, 24px 24px, 100% 100%',
          }}
        >
          {/* Address chip */}
          <div className="text-center mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
              {garageLabel}
            </span>
          </div>

          {/* Tab content — primary vehicle when on Garage, search prompt when on Search */}
          {activeTab === 'my_vehicles' ? (
            primaryVehicle ? (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'rgb(var(--brand-rgb))' }}>
                  {language === 'ru' ? 'Основной автомобиль' : 'Asosiy avtomobil'}
                </div>
                <div className="text-[34px] sm:text-[40px] leading-none font-extrabold text-white mb-3">
                  <PlateBig plate={primaryVehicle.plateNumber} accent />
                </div>
                <div className="text-[14px] font-semibold text-white/90">
                  {primaryVehicle.brand} {primaryVehicle.model}
                  {primaryVehicle.year && <span className="text-white/55 font-medium"> · {primaryVehicle.year}</span>}
                  {primaryVehicle.color && <span className="text-white/55 font-medium"> · {primaryVehicle.color}</span>}
                </div>
                <div className="text-[12px] text-white/55 mt-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {primaryVehicle.parkingSpot
                    ? (language === 'ru' ? `Парковка ${primaryVehicle.parkingSpot}` : `Avtoturargoh ${primaryVehicle.parkingSpot}`)
                    : (language === 'ru' ? 'В гараже' : 'Garajda')}
                </div>
              </>
            ) : (
              <div className="text-center py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'rgb(var(--brand-rgb))' }}>
                  {language === 'ru' ? 'Гараж пуст' : 'Garaj bo\'sh'}
                </div>
                <div className="text-[20px] leading-tight font-extrabold text-white">
                  {language === 'ru' ? 'Добавьте первый автомобиль' : 'Birinchi avtomobilni qo\'shing'}
                </div>
                <div className="text-[12px] text-white/60 mt-1">
                  {language === 'ru' ? 'Сосед сможет найти вас по номеру' : 'Qo\'shni sizni raqam bo\'yicha topishi mumkin'}
                </div>
              </div>
            )
          ) : (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'rgb(var(--brand-rgb))' }}>
                {language === 'ru' ? 'Найти владельца' : 'Egasini topish'}
              </div>
              <div className="text-[24px] sm:text-[28px] leading-tight font-extrabold text-white">
                {language === 'ru' ? 'Чьё это авто во дворе?' : 'Bu hovlidagi kimning avtomobili?'}
              </div>
              <div className="text-[13px] text-white/65 mt-1.5 leading-snug">
                {language === 'ru'
                  ? 'Введите номер — найдём соседа среди жителей вашего дома.'
                  : 'Raqamni kiriting — biz uy aholisi orasidan qo\'shnini topamiz.'}
              </div>
            </div>
          )}

          {/* Tab pills inside hero */}
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => {
                setActiveTab('my_vehicles');
                setSearchPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
                setManuallySelectedResult(null);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full text-[13px] font-bold transition-all touch-manipulation ${
                activeTab === 'my_vehicles'
                  ? 'bg-white text-gray-900'
                  : 'bg-white/8 text-white/80 hover:bg-white/14 border border-white/10'
              }`}
            >
              {language === 'ru' ? 'Мой гараж' : 'Mening garajim'}
              {vehicles.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                  activeTab === 'my_vehicles' ? 'bg-gray-900/10 text-gray-700' : 'bg-white/15 text-white/70'
                }`}>
                  {vehicles.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full text-[13px] font-bold transition-all touch-manipulation flex-1 justify-center ${
                activeTab === 'search'
                  ? 'text-white shadow-[0_4px_12px_rgba(var(--brand-rgb),0.4)]'
                  : 'bg-white/8 text-white/80 hover:bg-white/14 border border-white/10'
              }`}
              style={activeTab === 'search'
                ? { background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb),0.85))' }
                : undefined}
            >
              <Search className="w-4 h-4" />
              {language === 'ru' ? 'Поиск' : 'Qidiruv'}
            </button>
          </div>
        </div>
      </div>

      {/* My Vehicles Tab */}
      {activeTab === 'my_vehicles' && (
        <div className="space-y-3 px-3 md:px-0">
          {/* Section header */}
          <div className="flex items-end justify-between px-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              {language === 'ru' ? 'Все автомобили' : 'Barcha avtomobillar'}
              {vehicles.length > 0 && <span className="text-gray-400"> · {vehicles.length}</span>}
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="text-[13px] font-bold flex items-center gap-1 active:opacity-70 transition-opacity touch-manipulation min-h-[36px]"
              style={{ color: 'rgb(var(--brand-rgb))' }}
            >
              <Plus className="w-4 h-4" />
              {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
            </button>
          </div>

          {/* Vehicles List */}
          {vehicles.length === 0 ? (
            <EmptyState
              icon={<Car className="w-12 h-12" />}
              title={language === 'ru' ? 'Нет зарегистрированных авто' : 'Ro\'yxatdan o\'tgan avtomobillar yo\'q'}
              description={language === 'ru'
                ? 'Добавьте свой автомобиль кнопкой выше'
                : 'Yuqoridagi tugma orqali avtomobilingizni qo\'shing'}
              action={{
                label: language === 'ru' ? 'Добавить первый авто' : 'Birinchi avtoni qo\'shish',
                onClick: () => handleOpenModal(),
              }}
            />
          ) : (
            <div className="space-y-2.5">
              {vehicles.map((vehicle) => {
                const isPrimary = primaryVehicle?.id === vehicle.id;
                const formatted = formatPlateDisplay(vehicle.plateNumber);
                return (
                  <div key={vehicle.id} className="bg-white rounded-[16px] p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] relative">
                    {/* Plate display block — black border like the design */}
                    <button
                      onClick={() => handleOpenModal(vehicle)}
                      className="w-full text-left active:scale-[0.99] transition-transform touch-manipulation"
                    >
                      <div className="flex items-stretch border-2 border-gray-900 rounded-[10px] overflow-hidden">
                        <div className="flex-1 px-3 py-2.5 flex items-center justify-center">
                          <span className="font-mono tracking-wider text-[20px] sm:text-[22px] font-extrabold text-gray-900 tabular-nums">
                            {formatted}
                          </span>
                        </div>
                        <div className="flex flex-col items-center justify-center px-2 border-l-2 border-gray-900 bg-white">
                          <UZFlag className="w-7 h-4" />
                          <span className="text-[8px] font-bold text-gray-700 leading-none mt-0.5">UZ</span>
                        </div>
                      </div>
                    </button>

                    {/* Bottom row: model + meta + ⋯ menu */}
                    <div className="flex items-center justify-between mt-2.5 px-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[14px] text-gray-900 truncate">
                            {vehicle.brand} {vehicle.model}
                          </span>
                          {isPrimary && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                              style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'rgb(var(--brand-rgb))' }}
                            >
                              {language === 'ru' ? 'Основной' : 'Asosiy'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate mt-0.5">
                          {vehicle.year && `${vehicle.year} · `}
                          {vehicle.color}
                          {vehicle.parkingSpot && ` · ${language === 'ru' ? 'парк.' : 'avt.'} ${vehicle.parkingSpot}`}
                        </div>
                      </div>

                      <button
                        onClick={() => setOpenMenuId(openMenuId === vehicle.id ? null : vehicle.id)}
                        className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-500 active:scale-[0.95] transition-all touch-manipulation shrink-0"
                        aria-label={language === 'ru' ? 'Меню действий' : 'Amallar menyusi'}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Action menu popover */}
                    {openMenuId === vehicle.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                          aria-hidden
                        />
                        <div className="absolute right-3 bottom-12 z-20 bg-white rounded-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-gray-100 py-1 min-w-[160px]">
                          <button
                            onClick={() => { setOpenMenuId(null); handleOpenModal(vehicle); }}
                            className="w-full text-left px-3 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2 touch-manipulation min-h-[44px]"
                          >
                            <Edit2 className="w-4 h-4 text-gray-400" />
                            {language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); setDeleteConfirm(vehicle.id); }}
                            className="w-full text-left px-3 py-2.5 text-[13px] font-medium text-red-600 hover:bg-red-50 active:bg-red-100 flex items-center gap-2 touch-manipulation min-h-[44px]"
                          >
                            <Trash2 className="w-4 h-4" />
                            {language === 'ru' ? 'Удалить' : 'O\'chirish'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Add another vehicle */}
              <button
                onClick={() => handleOpenModal()}
                className="w-full bg-white rounded-[16px] py-4 px-4 flex items-center justify-center gap-2 text-gray-500 font-medium text-[14px] border-2 border-dashed border-gray-200 hover:border-gray-300 active:bg-gray-50 transition-colors touch-manipulation min-h-[56px]"
              >
                <Plus className="w-4 h-4" />
                {language === 'ru' ? 'Добавить ещё одно авто' : 'Yana avto qo\'shish'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-3 px-3 md:px-0">
          {/* Plate input + CTA card */}
          <div className="bg-white rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)] relative z-10 overflow-visible">
            <div className="flex flex-col items-center relative">
              <SearchPlateInput
                value={searchPlateParts}
                onChange={setSearchPlateParts}
                language={language}
                onSearch={handleSubmitSearch}
              />
              <div className="text-[11px] text-gray-400 mt-2">
                {language === 'ru' ? 'Введите любую часть номера' : 'Raqamning istalgan qismini kiriting'}
              </div>
            </div>

            <button
              onClick={handleSubmitSearch}
              disabled={!hasSearchInput || isSearching}
              className="w-full mt-3 py-3.5 min-h-[48px] rounded-[14px] font-bold text-white text-[14px] active:scale-[0.98] transition-all touch-manipulation flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb),0.85))',
                boxShadow: hasSearchInput && !isSearching ? '0 6px 18px rgba(var(--brand-rgb),0.4)' : 'none',
              }}
            >
              {isSearching
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {language === 'ru' ? 'Поиск...' : 'Qidirilmoqda...'}</>
                : <><Search className="w-4 h-4" /> {language === 'ru' ? 'Найти владельца' : 'Egasini topish'}</>
              }
            </button>

            {(searchPlateParts.region || searchPlateParts.letters1 || searchPlateParts.digits || searchPlateParts.letters2) && (
              <button
                onClick={() => {
                  setSearchPlateParts({ region: '', letters1: '', digits: '', letters2: '' });
                  setManuallySelectedResult(null);
                  setApiSearchResults([]);
                }}
                className="w-full mt-2 py-2 min-h-[36px] text-[12px] text-gray-500 hover:text-gray-700 active:text-gray-900 rounded-lg transition-colors flex items-center justify-center gap-1 touch-manipulation"
              >
                <X className="w-3.5 h-3.5" />
                {language === 'ru' ? 'Очистить' : 'Tozalash'}
              </button>
            )}
          </div>

          {/* Recent searches — show only when nothing's actively typed */}
          {!hasSearchInput && recentSearches.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">
                {language === 'ru' ? 'Недавние поиски' : 'So\'nggi qidiruvlar'}
              </div>
              <div className="bg-white rounded-[14px] divide-y divide-gray-100 overflow-hidden">
                {recentSearches.map((entry) => (
                  <button
                    key={`${entry.plate}-${entry.at}`}
                    onClick={() => handleClickRecent(entry)}
                    className="w-full flex items-center gap-3 p-3 active:bg-gray-50 transition-colors touch-manipulation min-h-[52px] text-left"
                  >
                    <span className="font-mono tracking-wider font-bold text-[14px] text-gray-900 tabular-nums flex-1 truncate">
                      {entry.plate}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      entry.found
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {entry.found
                        ? (language === 'ru' ? 'Найдено' : 'Topildi')
                        : (language === 'ru' ? 'Не найдено' : 'Topilmadi')}
                    </span>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {timeAgo(entry.at, language === 'ru' ? 'ru' : 'uz')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
                      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                        <Car className="w-5 h-5 text-primary-500" />
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
                  <div className="w-16 h-16 rounded-xl bg-primary-100 flex items-center justify-center">
                    <Car className="w-8 h-8 text-primary-500" />
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
                    {/* Владельца рендерим как "Вы" для собственных авто,
                        иначе прячем — чтобы даже при реверсированном поиске
                        (маловероятно, но возможно при багах API) не
                        засветить ФИО другого собственника. */}
                    {searchResult.ownerId === user?.id ? (
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">{language === 'ru' ? 'Владелец' : 'Egasi'}</p>
                          <p className="font-medium">{language === 'ru' ? 'Вы' : 'Siz'}</p>
                        </div>
                      </div>
                    ) : null}
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

              {/* Only show edit button if user owns this vehicle */}
              {user && searchResult.ownerId === user.id && (
                <button
                  onClick={() => handleOpenModal(searchResult)}
                  className="w-full py-3 px-4 rounded-xl font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  {language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                </button>
              )}
            </div>
          )}

          {/* Not Found State — slim banner instead of full empty card */}
          {!isSearching && hasSearched && filteredVehicles.length === 0 && (searchPlateParts.region || searchPlateParts.digits) && (
            <div className="rounded-[14px] p-3 flex items-start gap-2.5 border border-gray-200 bg-gray-50">
              <AlertCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <div className="text-[12px] text-gray-600 leading-snug">
                {language === 'ru'
                  ? 'Авто с таким номером не найдено среди жителей. Попробуйте другой номер или обратитесь на пост охраны.'
                  : 'Bunday raqamli avto aholilar orasida topilmadi. Boshqa raqamni urunib ko\'ring yoki qo\'riqchi postiga murojaat qiling.'}
              </div>
            </div>
          )}

          {/* Static disclaimer — kept visible so residents understand the
              search scope (only their tenant, not city-wide). */}
          <div
            className="rounded-[14px] p-3 flex items-start gap-2.5 border"
            style={{ background: '#FFF9E6', borderColor: '#FDE68A' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#B45309' }} />
            <div className="text-[12px] leading-snug" style={{ color: '#92400E' }}>
              {language === 'ru'
                ? 'Поиск работает только среди машин жителей. Если авто не найдено — обратитесь на пост охраны.'
                : 'Qidiruv faqat aholilar avtomobillari orasida ishlaydi. Agar topilmasa, qo\'riqchi postiga murojaat qiling.'}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal - Mobile full-screen, centered on desktop */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[110] md:flex md:items-center md:justify-center">
          <div className="h-full md:h-auto w-full md:max-w-2xl md:mx-4 bg-white md:rounded-2xl overflow-hidden md:max-h-[85dvh] flex flex-col">
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

      {(() => {
        const target = deleteConfirm ? vehicles.find(v => v.id === deleteConfirm) : null;
        const plate = target?.plateNumber || '';
        const model = target ? `${target.brand || ''} ${target.model || ''}`.trim() : '';
        return (
          <ConfirmDialog
            isOpen={!!deleteConfirm}
            tone="danger"
            title={language === 'ru' ? 'Удалить автомобиль?' : 'Avtomobilni o\'chirish?'}
            description={
              <>
                {(model || plate) && (
                  <div className="mb-2">
                    {model && <div className="text-[15px] font-semibold text-gray-900">{model}</div>}
                    {plate && <div className="text-sm font-mono tracking-wider text-gray-600 mt-0.5">{plate}</div>}
                  </div>
                )}
                <p>{language === 'ru' ? 'Это действие нельзя отменить' : 'Bu amalni bekor qilib bo\'lmaydi'}</p>
              </>
            }
            confirmLabel={language === 'ru' ? 'Удалить' : 'O\'chirish'}
            cancelLabel={language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            onClose={() => setDeleteConfirm(null)}
            onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
          />
        );
      })()}
    </div>
  );
}
