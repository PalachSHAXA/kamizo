import { useRef, useCallback } from 'react';
import {
  Search, X, Check, ChevronRight, Wrench, Zap, ShieldCheck, Sparkles,
  ArrowUpDown, Phone, Trash2, Flame, Snowflake, ClipboardList, ArrowRight
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SERVICE_CATEGORIES } from '../../../types';
import type { ServiceBottomSheetProps } from './types';

/* Service Icons & Color Maps */
const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  plumber: Wrench,
  electrician: Zap,
  security: ShieldCheck,
  cleaning: Sparkles,
  elevator: ArrowUpDown,
  intercom: Phone,
  trash: Trash2,
  boiler: Flame,
  ac: Snowflake,
  gardener: Sparkles,
  other: ClipboardList,
};

const SERVICE_CAT_COLORS: Record<string, { color: string; bg: string }> = {
  plumber: { color: '#FF6B35', bg: '#FFF0EB' },
  electrician: { color: '#FF9500', bg: '#FFF8E0' },
  security: { color: '#FF3B30', bg: '#FFF0EF' },
  cleaning: { color: '#30D158', bg: '#E8FAF0' },
  elevator: { color: '#0A84FF', bg: '#E8F4FF' },
  intercom: { color: '#BF5AF2', bg: '#F5EEFF' },
  trash: { color: '#30D158', bg: '#E8FAF0' },
  boiler: { color: '#FF6B35', bg: '#FFF0EB' },
  ac: { color: '#0A84FF', bg: '#E8F4FF' },
  gardener: { color: '#34C759', bg: '#E8F8ED' },
  other: { color: '#BF5AF2', bg: '#F5F0FF' },
};

const SERVICE_CAT_MAP: Record<string, string> = {
  plumber: 'repair', electrician: 'repair', boiler: 'repair', ac: 'repair',
  cleaning: 'clean', trash: 'clean',
  security: 'safety', intercom: 'safety',
  elevator: 'other', gardener: 'other', other: 'other',
};

export function ServiceBottomSheet({
  language, serviceSearch, setServiceSearch, serviceCatFilter, setServiceCatFilter,
  selectedServiceId, setSelectedServiceId, onClose, onSubmit,
}: ServiceBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; currentY: number; isDragging: boolean }>({ startY: 0, currentY: 0, isDragging: false });

  const catTabs = language === 'ru'
    ? [{ id: 'all', label: 'Все' }, { id: 'repair', label: '🔧 Ремонт' }, { id: 'clean', label: '🧹 Уборка' }, { id: 'safety', label: '🛡 Охрана' }, { id: 'other', label: '⚙️ Прочее' }]
    : [{ id: 'all', label: 'Hammasi' }, { id: 'repair', label: '🔧 Ta\'mir' }, { id: 'clean', label: '🧹 Tozalash' }, { id: 'safety', label: '🛡 Xavfsizlik' }, { id: 'other', label: '⚙️ Boshqa' }];

  const searchVal = serviceSearch.toLowerCase();
  const filteredCategories = SERVICE_CATEGORIES.filter(c => {
    const matchesCat = serviceCatFilter === 'all' || SERVICE_CAT_MAP[c.id] === serviceCatFilter;
    const matchesSearch = !searchVal || (language === 'ru' ? c.name : c.nameUz).toLowerCase().includes(searchVal);
    return matchesCat && matchesSearch;
  });
  const mainGrid = filteredCategories.filter(c => c.id !== 'other');
  const otherItem = filteredCategories.find(c => c.id === 'other');
  const selectedCat = selectedServiceId ? SERVICE_CATEGORIES.find(c => c.id === selectedServiceId) : null;
  const selectedColors = selectedServiceId ? SERVICE_CAT_COLORS[selectedServiceId] : null;

  // Swipe-to-close handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const scrollArea = sheet.querySelector('[data-scroll]') as HTMLElement;
    if (scrollArea && scrollArea.contains(target) && scrollArea.scrollTop > 0) return;
    dragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, isDragging: true };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.isDragging || !sheetRef.current) return;
    const deltaY = e.touches[0].clientY - dragRef.current.startY;
    dragRef.current.currentY = e.touches[0].clientY;
    if (deltaY > 0) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.isDragging || !sheetRef.current) return;
    const deltaY = dragRef.current.currentY - dragRef.current.startY;
    dragRef.current.isDragging = false;
    sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(.32,.72,0,1)';
    if (deltaY > 120) {
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(onClose, 300);
    } else {
      sheetRef.current.style.transform = 'translateY(0)';
    }
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[28px] flex flex-col animate-[slide-up_0.44s_cubic-bezier(.32,.72,0,1)]"
        style={{ maxHeight: '90vh', boxShadow: '0 -4px 40px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-0 flex-shrink-0">
          <h3 className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">
            {language === 'ru' ? 'Новая заявка' : 'Yangi ariza'}
          </h3>
          <p className="text-[13px] text-gray-400 font-medium mt-1">
            {language === 'ru' ? 'Выберите тип услуги' : 'Xizmat turini tanlang'}
          </p>
        </div>

        {/* Search */}
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-gray-50 rounded-[13px] px-3.5 py-2.5 flex-shrink-0">
          <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <input
            type="text"
            placeholder={language === 'ru' ? 'Поиск услуги...' : 'Xizmatni qidirish...'}
            value={serviceSearch}
            onChange={e => setServiceSearch(e.target.value)}
            className="flex-1 bg-transparent text-[14px] text-gray-900 font-medium outline-none placeholder:text-gray-300"
            aria-label={language === 'ru' ? 'Поиск услуги' : 'Xizmatni qidirish'}
          />
          {serviceSearch && (
            <button onClick={() => setServiceSearch('')} className="p-0.5">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div data-scroll className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-2" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {/* Category filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {catTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setServiceCatFilter(tab.id)}
                className={`px-3.5 py-[7px] rounded-full text-[12px] font-bold whitespace-nowrap flex-shrink-0 transition-all duration-200 touch-manipulation ${
                  serviceCatFilter === tab.id
                    ? 'text-white shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]'
                    : 'bg-gray-50 text-gray-500'
                }`}
                style={serviceCatFilter === tab.id ? { background: `rgb(var(--brand-rgb))` } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Section label */}
          <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2.5">
            {language === 'ru'
              ? (serviceCatFilter === 'all' ? 'Все услуги' : catTabs.find(t => t.id === serviceCatFilter)?.label || 'Услуги')
              : (serviceCatFilter === 'all' ? 'Barcha xizmatlar' : catTabs.find(t => t.id === serviceCatFilter)?.label || 'Xizmatlar')
            }
          </div>

          {/* Services grid */}
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            {mainGrid.map(category => {
              const colors = SERVICE_CAT_COLORS[category.id] || { color: '#8E8E93', bg: '#F2F2F7' };
              const isSelected = selectedServiceId === category.id;
              const IconComponent = SERVICE_ICON_MAP[category.id] || Wrench;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedServiceId(isSelected ? null : category.id)}
                  className={`relative flex flex-col items-center gap-2 p-3.5 rounded-[18px] border-2 transition-all duration-200 touch-manipulation select-none ${
                    isSelected
                      ? 'bg-white shadow-[0_6px_20px_rgba(0,0,0,0.08)]'
                      : 'border-transparent bg-gray-50 active:scale-[0.91]'
                  }`}
                  style={isSelected ? { borderColor: colors.color } : undefined}
                >
                  {/* Check badge */}
                  <div
                    className={`absolute top-[7px] right-[7px] w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all duration-200 ${
                      isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
                    }`}
                    style={{ background: colors.color }}
                  >
                    <Check className="w-[10px] h-[10px] text-white" strokeWidth={3} />
                  </div>

                  {/* Icon */}
                  <div
                    className={`w-[50px] h-[50px] rounded-[15px] flex items-center justify-center transition-transform duration-200 ${
                      isSelected ? 'scale-110 -rotate-[6deg]' : ''
                    }`}
                    style={{
                      background: isSelected ? colors.color : colors.bg,
                      boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.1)' : undefined,
                    }}
                  >
                    <IconComponent
                      className="w-[24px] h-[24px]"
                      style={{ color: isSelected ? '#fff' : colors.color }}
                      strokeWidth={2}
                    />
                  </div>

                  {/* Name */}
                  <span
                    className="text-[11px] font-bold text-center leading-tight"
                    style={{ color: isSelected ? colors.color : '#1C1C1E' }}
                  >
                    {language === 'ru' ? category.name : category.nameUz}
                  </span>
                </button>
              );
            })}
          </div>

          {/* "Other" wide item */}
          {otherItem && (() => {
            const colors = SERVICE_CAT_COLORS.other;
            const isSelected = selectedServiceId === 'other';
            return (
              <button
                onClick={() => setSelectedServiceId(isSelected ? null : 'other')}
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-[16px] border-2 transition-all duration-200 touch-manipulation mb-1 ${
                  isSelected
                    ? 'bg-white shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                    : 'bg-gray-50 border-transparent active:scale-[0.98]'
                }`}
                style={isSelected ? { borderColor: colors.color } : undefined}
              >
                <div
                  className="w-[44px] h-[44px] rounded-[13px] flex items-center justify-center flex-shrink-0"
                  style={{ background: isSelected ? colors.color : colors.bg }}
                >
                  <ClipboardList
                    className="w-[22px] h-[22px]"
                    style={{ color: isSelected ? '#fff' : colors.color }}
                    strokeWidth={2}
                  />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[14px] font-bold text-gray-900">
                    {language === 'ru' ? 'Другое' : 'Boshqa'}
                  </div>
                  <div className="text-[12px] text-gray-400 font-medium mt-0.5">
                    {language === 'ru' ? 'Опишите проблему своими словами' : 'Muammoni o\'z so\'zlaringiz bilan tasvirlab bering'}
                  </div>
                </div>
                <ChevronRight className="w-[14px] h-[14px] text-gray-300 flex-shrink-0" />
              </button>
            );
          })()}
        </div>

        {/* CTA Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white rounded-b-none px-4 pt-2.5" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {/* Selected tag */}
          <div className="flex items-center gap-2 min-h-[30px] mb-2.5 flex-wrap">
            {selectedCat && selectedColors ? (
              <div
                className="flex items-center gap-1.5 py-1 px-2.5 rounded-full animate-[popIn_0.22s_cubic-bezier(.34,1.46,.64,1)_both]"
                style={{ background: selectedColors.bg }}
              >
                <span className="text-[12px] font-bold" style={{ color: selectedColors.color }}>
                  {language === 'ru' ? selectedCat.name : selectedCat.nameUz}
                </span>
                <button
                  onClick={() => setSelectedServiceId(null)}
                  className="p-0 leading-none text-[15px] opacity-70"
                  style={{ color: selectedColors.color }}
                >×</button>
              </div>
            ) : (
              <span className="text-[13px] text-gray-300 font-medium">
                {language === 'ru' ? 'Услуга не выбрана' : 'Xizmat tanlanmagan'}
              </span>
            )}
          </div>

          {/* Submit button */}
          <button
            disabled={!selectedServiceId}
            onClick={() => { if (selectedServiceId) onSubmit(selectedServiceId); }}
            className={`w-full py-[15px] rounded-[16px] text-[16px] font-extrabold flex items-center justify-center gap-2.5 transition-all duration-200 touch-manipulation ${
              selectedServiceId
                ? 'text-white shadow-[0_6px_20px_rgba(var(--brand-rgb),0.35)] active:scale-[0.97]'
                : 'bg-gray-100 text-gray-300 cursor-default'
            }`}
            style={selectedServiceId ? { background: `linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.85))` } : undefined}
          >
            <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.5} />
            {selectedServiceId && selectedCat
              ? (language === 'ru' ? `Далее — ${selectedCat.name}` : `Davom — ${selectedCat.nameUz}`)
              : (language === 'ru' ? 'Выбрать услугу' : 'Xizmatni tanlang')
            }
          </button>
        </div>
      </div>
    </div>
  );
}
