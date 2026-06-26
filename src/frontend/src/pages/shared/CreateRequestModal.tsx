// Sprint 29: extracted from shared/RequestsPage.tsx. The modal that
// managers and admins use to create a new request on a resident's
// behalf (trash pickup, repair, etc). Owns its own form state +
// branch/building/resident search; the parent only opens it and
// receives the final payload via onSubmit.

import { useState, useEffect } from 'react';
import { X, ChevronRight, User, Building2, GitBranch, MapPin } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useModalPresence } from '../../stores/modalStore';
import { branchesApi, buildingsApi, usersApi } from '../../services/api';
import { formatAddress } from '../../utils/formatAddress';
import type { ExecutorSpecialization, RequestPriority } from '../../types';
import { SPECIALIZATION_LABELS } from '../../types';

interface Branch {
  id: string;
  code: string;
  name: string;
}

interface Building {
  id: string;
  name: string;
  address: string;
  branch_code: string;
}

interface Resident {
  id: string;
  name: string;
  phone: string;
  address: string;
  apartment: string;
  building_id: string;
}

// Create Request Modal for managers/admins
// Trash type options
const TRASH_TYPES = [
  { value: 'construction', label: 'Строительный мусор', icon: '🧱', description: 'Кирпич, бетон, штукатурка' },
  { value: 'furniture', label: 'Старая мебель', icon: '🛋️', description: 'Диваны, шкафы, кровати' },
  { value: 'household', label: 'Бытовой мусор', icon: '🗑️', description: 'Обычные бытовые отходы' },
  { value: 'appliances', label: 'Бытовая техника', icon: '📺', description: 'Холодильники, стиральные машины' },
  { value: 'garden', label: 'Садовый мусор', icon: '🌿', description: 'Ветки, листья, трава' },
  { value: 'mixed', label: 'Смешанный', icon: '📦', description: 'Разные виды мусора' },
];

// Trash volume options
const TRASH_VOLUME = [
  { value: 'small', label: 'До 1 м³', description: '1-2 мешка, небольшие предметы', icon: '📦' },
  { value: 'medium', label: '1-3 м³', description: 'Несколько мешков, мелкая мебель', icon: '📦📦' },
  { value: 'large', label: '3-5 м³', description: 'Много мусора, крупная мебель', icon: '🚛' },
  { value: 'truck', label: 'Более 5 м³', description: 'Полная машина, капремонт', icon: '🚚' },
];

// Uzbek translations for trash types
const TRASH_TYPES_UZ: Record<string, { label: string; description: string }> = {
  construction: { label: 'Qurilish axlati', description: 'G\'isht, beton, suvoq' },
  furniture: { label: 'Eski mebel', description: 'Divan, shkaf, karavot' },
  household: { label: 'Maishiy axlat', description: 'Oddiy maishiy chiqindilar' },
  appliances: { label: 'Maishiy texnika', description: 'Muzlatgich, kir yuvish mashinalari' },
  garden: { label: 'Bog\' axlati', description: 'Shoxlar, barglar, o\'t' },
  mixed: { label: 'Aralash', description: 'Turli xil axlatlar' },
};

// Uzbek translations for trash volume
const TRASH_VOLUME_UZ: Record<string, { label: string; description: string }> = {
  small: { label: '1 m³ gacha', description: '1-2 qop, kichik narsalar' },
  medium: { label: '1-3 m³', description: 'Bir nechta qop, kichik mebel' },
  large: { label: '3-5 m³', description: 'Ko\'p axlat, katta mebel' },
  truck: { label: '5 m³ dan ko\'p', description: 'To\'liq mashina, kapital ta\'mir' },
};

export function CreateRequestModal({
  onClose,
  onSubmit
}: {
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    category: ExecutorSpecialization;
    priority: RequestPriority;
    residentId: string;
    residentName: string;
    residentPhone: string;
    address: string;
    apartment: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }) => void;
}) {
  const { language } = useLanguageStore();
  // v118.10: hide the floating BottomBar while this modal is open
  // so its sticky action bar (Отмена / Создать заявку) isn't
  // overlapped by the bar. Reuses the same `useModalPresence`
  // counter that the chat dialog, CancelRequestModal,
  // FeatureLockedModal, common/Sheet, etc. already use —
  // BottomBar.tsx reads useModalStore().count > 0 and early-returns
  // null. On unmount the counter pops back and the bar reappears.
  useModalPresence();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExecutorSpecialization>('plumber');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Trash-specific fields
  const [trashType, setTrashType] = useState('');
  const [trashVolume, setTrashVolume] = useState('');
  const [trashDetails, setTrashDetails] = useState('');

  // Reset trash fields when category changes
  useEffect(() => {
    if (category !== 'trash') {
      setTrashType('');
      setTrashVolume('');
      setTrashDetails('');
    }
  }, [category]);

  // Cascading selection state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);

  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);

  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [loadingResidents, setLoadingResidents] = useState(false);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const data = await branchesApi.getAll();
        setBranches(data.branches || []);
      } catch (error) {
        console.error('Failed to load branches:', error);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, []);

  // Load buildings when branch changes
  useEffect(() => {
    if (!selectedBranch) {
      setBuildings([]);
      setSelectedBuilding('');
      setResidents([]);
      setSelectedResident(null);
      return;
    }

    const loadBuildings = async () => {
      setLoadingBuildings(true);
      setSelectedBuilding('');
      setResidents([]);
      setSelectedResident(null);
      try {
        const data = await buildingsApi.getAll();
        const filteredBuildings = (data.buildings || []).filter(
          (b: Building) => b.branch_code === selectedBranch
        );
        setBuildings(filteredBuildings);
      } catch (error) {
        console.error('Failed to load buildings:', error);
      } finally {
        setLoadingBuildings(false);
      }
    };
    loadBuildings();
  }, [selectedBranch]);

  // Load residents when building changes
  useEffect(() => {
    if (!selectedBuilding) {
      setResidents([]);
      setSelectedResident(null);
      return;
    }

    const loadResidents = async () => {
      setLoadingResidents(true);
      setSelectedResident(null);
      try {
        const data = await usersApi.getAll({ role: 'resident', building_id: selectedBuilding, limit: 500 });
        setResidents(data.users || []);
      } catch (error) {
        console.error('Failed to load residents:', error);
      } finally {
        setLoadingResidents(false);
      }
    };
    loadResidents();
  }, [selectedBuilding]);

  const categories: { value: ExecutorSpecialization; label: string }[] = language === 'ru' ? [
    { value: 'plumber', label: 'Сантехник' },
    { value: 'electrician', label: 'Электрик' },
    { value: 'security', label: 'Охрана' },
    { value: 'cleaning', label: 'Уборка' },
    { value: 'elevator', label: 'Лифт' },
    { value: 'intercom', label: 'Домофон' },
    { value: 'trash', label: 'Вывоз мусора' },
    { value: 'boiler', label: 'Котёл' },
    { value: 'ac', label: 'Кондиционер' },
    { value: 'other', label: 'Другое' },
  ] : [
    { value: 'plumber', label: 'Santexnik' },
    { value: 'electrician', label: 'Elektrik' },
    { value: 'security', label: 'Qorovul' },
    { value: 'cleaning', label: 'Tozalash' },
    { value: 'elevator', label: 'Lift' },
    { value: 'intercom', label: 'Domofon' },
    { value: 'trash', label: 'Axlat chiqarish' },
    { value: 'boiler', label: 'Qozon' },
    { value: 'ac', label: 'Konditsioner' },
    { value: 'other', label: 'Boshqa' },
  ];

  const timeSlots = [
    { value: '09:00-11:00', label: '09:00 - 11:00' },
    { value: '11:00-13:00', label: '11:00 - 13:00' },
    { value: '13:00-15:00', label: '13:00 - 15:00' },
    { value: '15:00-17:00', label: '15:00 - 17:00' },
    { value: '17:00-19:00', label: '17:00 - 19:00' },
  ];

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split('T')[0];
  };

  const handleResidentSelect = (residentId: string) => {
    const resident = residents.find(r => r.id === residentId);
    setSelectedResident(resident || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResident) return;

    // For trash category, validate trash-specific fields
    if (category === 'trash') {
      if (!trashType || !trashVolume || !scheduledDate || !scheduledTime) return;
    } else {
      if (!title.trim() || !description.trim()) return;
    }

    setIsSubmitting(true);
    try {
      // Build title and description for trash category
      let finalTitle = title;
      let finalDescription = description;

      if (category === 'trash') {
        const typeInfo = TRASH_TYPES.find(t => t.value === trashType);
        const volumeInfo = TRASH_VOLUME.find(v => v.value === trashVolume);

        finalTitle = `Вывоз мусора: ${typeInfo?.label || trashType}`;
        finalDescription = `Тип мусора: ${typeInfo?.label || trashType}\nОбъём: ${volumeInfo?.label || trashVolume}`;
        if (trashDetails.trim()) {
          finalDescription += `\n\nДополнительно: ${trashDetails.trim()}`;
        }
      }

      await onSubmit({
        title: finalTitle,
        description: finalDescription,
        category,
        priority,
        residentId: selectedResident.id,
        residentName: selectedResident.name,
        residentPhone: selectedResident.phone || (language === 'ru' ? 'Не указан' : 'Ko\'rsatilmagan'),
        address: selectedResident.address || buildings.find(b => b.id === selectedBuilding)?.address || '',
        apartment: selectedResident.apartment || '0',
        scheduledDate: scheduledDate || undefined,
        scheduledTime: scheduledTime || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBranchName = branches.find(b => b.code === selectedBranch)?.name;
  const selectedBuildingData = buildings.find(b => b.id === selectedBuilding);

  return (
    // v118.103 — restructured to true full-screen sheet on mobile so the
    // app's MobileHeader (burger/choko/bell, z-index 10) no longer
    // bleeds through the previous 10dvh transparent strip at the top.
    // Layout now also hides MobileHeader while modalCount > 0, but the
    // sheet itself paints edge-to-edge with its own safe-area-aware
    // pinned header so the title + X never sit under the notch.
    //   - Mobile: h:100dvh + flex column + overflow:hidden + rounded:0,
    //     pinned title row (flex:0 0 auto) with padding-top: env(safe-
    //     area-inset-top), inner scroller wraps the form.
    //   - Desktop (sm:): keeps the original centered card layout via
    //     responsive overrides — max-h:90dvh + rounded:2xl + overflow:y:auto
    //     restored on the content; inner scroller becomes a plain block.
    // v118.106 — two stick-at-bottom fixes for the mobile full-screen
    // sheet shipped in v246:
    //   1. modal-backdrop had `padding: 16px` + safe-area-bottom from
    //      index.css:1281, pushing modal-content's bottom 16-34 px past
    //      the viewport. `!p-0 sm:!p-4` strips that on mobile so the
    //      h-[100dvh] sheet truly matches the viewport; desktop keeps
    //      the 16 px gap.
    //   2. v246's `overflow-hidden` (shorthand) lost the cascade to
    //      .modal-content's base `overflow-y: auto` (longhand) in
    //      index.css:1295, so the OUTER element became a second
    //      scroller — nested scrollers + iOS WKWebView momentum =
    //      dropped up-swipes after hitting the inner bottom. Tailwind
    //      `!` (= !important) forces our override to win:
    //      `!overflow-y-hidden sm:!overflow-y-auto` keeps outer locked
    //      on mobile and restores auto on desktop.
    <div className="modal-backdrop items-end sm:items-center !p-0 sm:!p-4">
      {/* v118.107 — added `!max-h-[100dvh] sm:!max-h-[90dvh]`. The
          base .modal-content CSS at index.css:1293-1294 caps every
          shell-based modal at `max-height: 90vh; max-height: 90dvh;`
          which on this mobile full-screen sheet pinned the sheet's
          top 10 dvh below the viewport top — that empty band showed
          the dark backdrop blur with the underlying "Заявки" page
          bleeding through behind the status bar. Tailwind `!` forces
          our override; desktop keeps the 90 dvh cap via the sm:
          variant. */}
      <div
        className="modal-content w-full max-w-lg sm:mx-4 h-[100dvh] sm:h-auto !max-h-[100dvh] sm:!max-h-[90dvh] flex flex-col sm:block !overflow-y-hidden sm:!overflow-y-auto rounded-none sm:rounded-2xl p-0 sm:p-6"
      >
        {/* Pinned header — flex:0 0 auto on mobile, normal block on desktop.
            v118.107 — tightened top padding from safe-area+14 → safe-area+6
            (matches the v248 chat-header treatment). On iPhone 17 Pro Max
            safe-area ≈ 59 px, so title sits 6 px below the status bar
            instead of 14 px. background covers up to and behind the
            notch because modal-content now fills the full 100 dvh
            (v118.107 max-h override above). */}
        <div
          className="flex items-center justify-between border-b border-gray-100 sm:border-0 sm:mb-6"
          style={{
            flex: '0 0 auto',
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)',
            paddingLeft: 16, paddingRight: 16, paddingBottom: 14,
            background: 'var(--surface, #fff)',
          }}
        >
          <h2 className="text-lg sm:text-xl font-bold">{language === 'ru' ? 'Создать заявку' : 'Ariza yaratish'}</h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation active:scale-95 hover:bg-gray-100 rounded-lg" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inner scroller — flex:1 1 auto on mobile, normal block on desktop */}
        <div
          className="flex-1 min-h-0 sm:min-h-fit overflow-y-auto sm:overflow-visible px-4 pt-4 pb-4 sm:p-0"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Категория' : 'Kategoriya'} *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExecutorSpecialization)}
              className="glass-input w-full"
              required
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Conditional fields based on category */}
          {category === 'trash' ? (
            <>
              {/* Trash Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Тип мусора' : 'Axlat turi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setTrashType(type.value)}
                      className={`p-3 rounded-xl text-left transition-all border ${
                        trashType === type.value
                          ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{type.icon}</span>
                        <div>
                          <div className="font-medium text-sm">{language === 'ru' ? type.label : (TRASH_TYPES_UZ[type.value]?.label || type.label)}</div>
                          <div className="text-xs text-gray-500">{language === 'ru' ? type.description : (TRASH_TYPES_UZ[type.value]?.description || type.description)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trash Volume Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Объём мусора' : 'Axlat hajmi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_VOLUME.map((vol) => (
                    <button
                      key={vol.value}
                      type="button"
                      onClick={() => setTrashVolume(vol.value)}
                      className={`p-3 rounded-xl text-left transition-all border ${
                        trashVolume === vol.value
                          ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{vol.icon}</span>
                        <div>
                          <div className="font-medium text-sm">{language === 'ru' ? vol.label : (TRASH_VOLUME_UZ[vol.value]?.label || vol.label)}</div>
                          <div className="text-xs text-gray-500">{language === 'ru' ? vol.description : (TRASH_VOLUME_UZ[vol.value]?.description || vol.description)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Details for Trash */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Дополнительная информация' : 'Qo\'shimcha ma\'lumot'}
                </label>
                <textarea
                  value={trashDetails}
                  onChange={(e) => setTrashDetails(e.target.value)}
                  className="glass-input w-full min-h-[80px] resize-none"
                  placeholder={language === 'ru' ? 'Особые указания, этаж, подъезд и т.д.' : 'Maxsus ko\'rsatmalar, qavat, kirish va h.k.'}
                />
              </div>
            </>
          ) : (
            <>
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Заголовок' : 'Sarlavha'} *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="glass-input w-full"
                  placeholder={language === 'ru' ? 'Кратко опишите проблему' : 'Muammoni qisqacha tavsiflang'}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Описание' : 'Tavsif'} *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="glass-input w-full min-h-[100px] resize-none"
                  placeholder={language === 'ru' ? 'Подробное описание проблемы' : 'Muammoning batafsil tavsifi'}
                  required
                />
              </div>
            </>
          )}

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Приоритет' : 'Ustuvorlik'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'urgent'] as RequestPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    priority === p
                      ? p === 'urgent' ? 'bg-red-500 text-white' :
                        p === 'high' ? 'bg-orange-500 text-white' :
                        p === 'medium' ? 'bg-amber-500 text-white' :
                        'bg-gray-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p === 'low'
                    ? (language === 'ru' ? 'Низкий' : 'Past')
                    : p === 'medium'
                    ? (language === 'ru' ? 'Средний' : 'O\'rta')
                    : p === 'high'
                    ? (language === 'ru' ? 'Высокий' : 'Yuqori')
                    : (language === 'ru' ? 'Срочный' : 'Shoshilinch')}
                </button>
              ))}
            </div>
          </div>

          {/* Resident Selection - Cascading */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              {language === 'ru' ? 'Выбор жителя' : 'Yashovchini tanlash'}
            </h3>

            {/* Branch Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <GitBranch className="w-4 h-4" />
                {language === 'ru' ? 'Филиал' : 'Filial'} *
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="glass-input w-full"
                disabled={loadingBranches}
              >
                <option value="">
                  {loadingBranches
                    ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                    : (language === 'ru' ? 'Выберите филиал' : 'Filialni tanlang')}
                </option>
                {branches.map(branch => (
                  <option key={branch.code} value={branch.code}>{branch.name}</option>
                ))}
              </select>
            </div>

            {/* Building Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                {language === 'ru' ? 'Дом' : 'Uy'} *
              </label>
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
                className="glass-input w-full"
                disabled={!selectedBranch || loadingBuildings}
              >
                <option value="">
                  {loadingBuildings
                    ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                    : !selectedBranch
                    ? (language === 'ru' ? 'Сначала выберите филиал' : 'Avval filialni tanlang')
                    : (language === 'ru' ? 'Выберите дом' : 'Uyni tanlang')}
                </option>
                {buildings.map(building => (
                  <option key={building.id} value={building.id}>
                    {building.name} - {building.address}
                  </option>
                ))}
              </select>
            </div>

            {/* Resident Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <User className="w-4 h-4" />
                {language === 'ru' ? 'Житель' : 'Yashovchi'} *
              </label>
              <select
                value={selectedResident?.id || ''}
                onChange={(e) => handleResidentSelect(e.target.value)}
                className="glass-input w-full"
                disabled={!selectedBuilding || loadingResidents}
              >
                <option value="">
                  {loadingResidents
                    ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                    : !selectedBuilding
                    ? (language === 'ru' ? 'Сначала выберите дом' : 'Avval uyni tanlang')
                    : (language === 'ru' ? 'Выберите жителя' : 'Yashovchini tanlang')}
                </option>
                {residents.map(resident => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} {resident.apartment ? `- ${language === 'ru' ? 'кв.' : 'kv.'} ${resident.apartment}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Resident Info */}
            {selectedResident && (
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mt-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{selectedResident.name}</p>
                    <p className="text-sm text-gray-600">
                      {selectedResident.phone || (language === 'ru' ? 'Телефон не указан' : 'Telefon ko\'rsatilmagan')}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {selectedBuildingData?.address || selectedResident.address}
                      {selectedResident.apartment && `, ${language === 'ru' ? 'кв.' : 'kv.'} ${selectedResident.apartment}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Selection Path Display */}
            {(selectedBranchName || selectedBuildingData) && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-2 flex-wrap">
                {selectedBranchName && (
                  <>
                    <span className="bg-gray-100 px-2 py-1 rounded">{selectedBranchName}</span>
                    {selectedBuildingData && <ChevronRight className="w-3 h-3" />}
                  </>
                )}
                {selectedBuildingData && (
                  <>
                    <span className="bg-gray-100 px-2 py-1 rounded">{selectedBuildingData.name}</span>
                    {selectedResident && <ChevronRight className="w-3 h-3" />}
                  </>
                )}
                {selectedResident && (
                  <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded">
                    {selectedResident.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium text-gray-900 mb-3">
              {category === 'trash'
                ? (language === 'ru' ? 'Дата и время вывоза *' : 'Chiqarish sanasi va vaqti *')
                : (language === 'ru' ? 'Желаемое время (опционально)' : 'Istalgan vaqt (ixtiyoriy)')}
            </h3>
            {/* v118.5: arbitrary `grid-cols-[repeat(2,minmax(0,1fr))]`
                to escape the global mobile override at src/index.css:
                1614-1624 which forces every .grid-cols-2 / .grid-cols-3
                / .grid-cols-4 to `repeat(2, 1fr) !important` at ≤640 px,
                dropping the `minmax(0, 1fr)` shrink-below-content
                behavior. Without minmax(0, 1fr) the native
                <input type="date"> and <select> push their grid tracks
                to their UA-defined min-content widths (date-picker
                arrows + select dropdown), which on a phone exceeds
                half the modal width — and the two boxes overlap.
                Children get `min-w-0` so they're allowed to actually
                shrink to their track size (grid items default to
                `min-width: auto` which alone still blocks shrinking
                even with minmax). */}
            {/* v118.6: gap-3 (12 px) rendered cleanly but read as
                "flush" at iPhone Retina scale because the modal bg +
                .glass-input's 0.8-alpha white + thin gray border
                offer too little contrast across 12 px. Bumped to
                gap-4 (16 px) for a clearly visible breathing strip
                between the date input and the time select on every
                iPhone width. v118.5 grid + min-w-0 unchanged. */}
            {/* v118.8: items-start aligns the two columns to the top
                of the row track explicitly (CSS Grid's default
                align-items: normal resolves to stretch but the
                stretching interacts with children's content sizing
                in subtle ways — being explicit removes ambiguity).
                Both inputs gain h-11 (44 px) below so they render
                pixel-for-pixel the same height; `.glass-input`'s
                min-height:44px alone allows ≥44 px which lets iOS
                UA paint them slightly differently between a
                <select> and <input type="date">. */}
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 items-start">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Дата' : 'Sana'} {category === 'trash' && <span className="text-red-500">*</span>}
                </label>
                {/* v118.104 — bumped 44 → 48 px (h-11 → h-12) and added
                    line-height: 1.4. The previous h-11 forced exact
                    44 px with .glass-input's 12 px vertical padding +
                    1.5 px border (top+bot 3 px) → ~17 px content area.
                    iOS WKWebView's native <select> chrome added vertical
                    insets on top of that, clipping "Любое время" (and
                    the date value descenders) at the bottom. 48 px
                    gives ~21 px content area and matches the larger
                    glass-input rhythm used elsewhere on the form. */}
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="glass-input w-full h-12"
                  style={{ lineHeight: 1.4 }}
                  min={getMinDate()}
                  max={getMaxDate()}
                  required={category === 'trash'}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Время' : 'Vaqt'} {category === 'trash' && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="glass-input w-full h-12"
                  style={{ lineHeight: 1.4 }}
                  required={category === 'trash'}
                >
                  <option value="">{category === 'trash'
                    ? (language === 'ru' ? 'Выберите время' : 'Vaqtni tanlang')
                    : (language === 'ru' ? 'Любое время' : 'Istalgan vaqt')}</option>
                  {timeSlots.map(slot => (
                    <option key={slot.value} value={slot.value}>{slot.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Actions — sticky at bottom so always visible */}
          {/* v118.11: action buttons sit IN-FLOW at the end of the
              scrollable form content — no longer sticky-pinned to
              the modal viewport bottom. User scrolls the form to
              the last field and the buttons appear right after, as
              part of normal content. Sticky bg, negative margin, and
              bottom-0 anchor all dropped — they were only needed for
              the sticky variant. The pb-[max(0.5rem,env(safe-area-
              inset-bottom))] STAYS so when the buttons ARE scrolled
              into view, they clear the iOS home indicator (modal's
              own p-4 adds another 16 px below — acceptable).
              v118.10 useModalPresence (hides BottomBar while modal
              is open) is unchanged. */}
          <div className="flex gap-3 pt-4 border-t pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !selectedResident ||
                (category === 'trash'
                  ? !trashType || !trashVolume || !scheduledDate || !scheduledTime
                  : !title.trim() || !description.trim())
              }
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? (language === 'ru' ? 'Создание...' : 'Yaratilmoqda...')
                : (language === 'ru' ? 'Создать заявку' : 'Ariza yaratish')}
            </button>
          </div>
        </form>
        </div>{/* /inner scroller */}
      </div>
    </div>
  );
}
