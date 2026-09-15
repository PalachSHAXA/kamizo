import {
  Plus, ChevronRight, Loader2, RefreshCw,
  ArrowLeft, Zap, Download, Upload,
} from 'lucide-react';
import type { Branch, Apartment, Entrance, ViewLevel } from './types';
import { STATUS_CONFIG, getAptStatus } from './types';
import type { BuildingFull } from '../../../../types';

interface BuildingsTopBarProps {
  viewLevel: ViewLevel;
  selectedDistrict: string | null;
  selectedBranch: Branch | null;
  selectedBuilding: BuildingFull | null;
  apartments: Apartment[];
  entrances: Entrance[];
  isGenerating: boolean;
  exportingBranchId: string | null;
  canManageImportExport: boolean;
  language: string;
  onBack: () => void;
  onBreadcrumbDistricts: () => void;
  onBreadcrumbBranches: () => void;
  onBreadcrumbBuildings: () => void;
  onRefresh: () => void;
  onGenerateApartments: () => void;
  onAddApartment: () => void;
  onExportBranch: (branch: Branch, e: React.MouseEvent) => void;
  onOpenImport: () => void;
  onAdd: () => void;
}

export function BuildingsTopBar({
  viewLevel,
  selectedBranch,
  selectedBuilding,
  apartments,
  entrances,
  isGenerating,
  exportingBranchId,
  canManageImportExport,
  language,
  onBack,
  onBreadcrumbBranches,
  onBreadcrumbBuildings,
  onRefresh,
  onGenerateApartments,
  onAddApartment,
  onExportBranch,
  onOpenImport,
  onAdd,
}: BuildingsTopBarProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    <div className="bg-white border-b border-gray-200 flex-shrink-0 px-3 sm:px-5 py-2 sm:py-0 sm:h-[52px] flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      {/* Row 1 (mobile) / left (desktop): back + breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 sm:flex-initial">
        {viewLevel !== 'branches' && (
          <button
            onClick={onBack}
            aria-label={t('Назад', 'Orqaga')}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {/* Breadcrumb — truncate on narrow, no per-letter break */}
        <div className="flex items-center gap-1.5 text-[13px] text-gray-400 min-w-0 flex-1 sm:flex-initial overflow-hidden">
          <button
            onClick={onBreadcrumbBranches}
            className={`hover:text-orange-500 transition-colors whitespace-nowrap flex-shrink-0 ${viewLevel === 'branches' ? 'text-gray-900 font-bold' : ''}`}
          >
            {t('Комплексы', 'Komplekslar')}
          </button>
          {selectedBranch && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
              <button
                onClick={onBreadcrumbBuildings}
                className={`hover:text-orange-500 transition-colors truncate min-w-0 ${viewLevel === 'buildings' ? 'text-gray-900 font-bold' : ''}`}
              >
                {selectedBranch.name}
              </button>
            </>
          )}
          {selectedBuilding && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
              <span className="text-gray-900 font-bold truncate min-w-0">{selectedBuilding.name}</span>
            </>
          )}
        </div>
      </div>

      {/* Row 2 (mobile) / right (desktop): action buttons — nowrap, icon-only add on narrow */}
      <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
        <button
          onClick={onRefresh}
          aria-label={t('Обновить', 'Yangilash')}
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {viewLevel === 'entrances' && apartments.length === 0 && entrances.length > 0 && (
          <button
            onClick={onGenerateApartments}
            disabled={isGenerating}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-orange-400 hover:text-orange-500 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            <span className="hidden min-[400px]:inline">{t('Сгенерировать', 'Yaratish')}</span>
          </button>
        )}

        {viewLevel === 'entrances' && apartments.length > 0 && (
          <button
            onClick={onAddApartment}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-orange-400 hover:text-orange-500 transition-all whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden min-[400px]:inline">{t('Добавить кв.', "Xonadon qo'shish")}</span>
          </button>
        )}

        {canManageImportExport && (viewLevel === 'branches' || viewLevel === 'buildings') && (
          <>
            {viewLevel === 'buildings' && selectedBranch && (
              <button
                onClick={(e) => onExportBranch(selectedBranch, e)}
                disabled={exportingBranchId === selectedBranch.id}
                aria-label={t('Экспорт', 'Eksport')}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-green-400 hover:text-green-600 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {exportingBranchId === selectedBranch.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                <span className="hidden min-[400px]:inline">{t('Экспорт', 'Eksport')}</span>
              </button>
            )}
            <button
              onClick={onOpenImport}
              aria-label={t('Импорт', 'Import')}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-blue-400 hover:text-blue-500 transition-all whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden min-[400px]:inline">{t('Импорт', 'Import')}</span>
            </button>
          </>
        )}

        <button
          onClick={onAdd}
          className="px-3 sm:px-3.5 py-1.5 rounded-lg bg-orange-500 text-white text-[13px] font-bold flex items-center gap-1.5 hover:bg-orange-600 transition-all whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          {viewLevel === 'branches' && t('Комплекс', 'Kompleks')}
          {viewLevel === 'buildings' && t('Дом', 'Uy')}
          {viewLevel === 'entrances' && t('Подъезд', 'Podyezd')}
        </button>
      </div>
    </div>
  );
}

interface LegendBarProps {
  apartments: Apartment[];
  language: string;
}

export function LegendBar({ apartments, language }: LegendBarProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const statusCounts = { occupied: 0, vacant: 0, commercial: 0, rented: 0, renovation: 0 };
  apartments.forEach(apt => {
    const s = getAptStatus(apt);
    if (s in statusCounts) statusCounts[s as keyof typeof statusCounts]++;
  });

  return (
    <div className="h-10 bg-white border-b border-gray-200 flex items-center px-5 gap-5 flex-shrink-0">
      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5 text-[12px] text-gray-400">
          <div className="w-3 h-3 rounded-[3px]" style={{ background: cfg.bg }} />
          {language === 'ru' ? cfg.label_ru : cfg.label_uz}
          <span className="font-bold text-gray-900">{statusCounts[key as keyof typeof statusCounts] || 0}</span>
        </div>
      ))}
      <div className="ml-auto text-[12px] text-gray-400">
        {t('Всего квартир', 'Jami xonadonlar')}: <span className="font-bold text-gray-900">{apartments.length}</span>
      </div>
    </div>
  );
}
