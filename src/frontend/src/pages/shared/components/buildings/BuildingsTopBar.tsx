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
    <div className="h-[52px] bg-white border-b border-gray-200 flex items-center px-5 gap-3 flex-shrink-0">
      {viewLevel !== 'branches' && (
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-gray-400">
        <button
          onClick={onBreadcrumbBranches}
          className={`hover:text-orange-500 transition-colors ${viewLevel === 'branches' ? 'text-gray-900 font-bold' : ''}`}
        >
          {t('Комплексы', 'Komplekslar')}
        </button>
        {selectedBranch && (
          <>
            <ChevronRight className="w-3 h-3 text-gray-300" />
            <button
              onClick={onBreadcrumbBuildings}
              className={`hover:text-orange-500 transition-colors ${viewLevel === 'buildings' ? 'text-gray-900 font-bold' : ''}`}
            >
              {selectedBranch.name}
            </button>
          </>
        )}
        {selectedBuilding && (
          <>
            <ChevronRight className="w-3 h-3 text-gray-300" />
            <span className="text-gray-900 font-bold">{selectedBuilding.name}</span>
          </>
        )}
      </div>

      {/* Right buttons */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onRefresh}
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {viewLevel === 'entrances' && apartments.length === 0 && entrances.length > 0 && (
          <button
            onClick={onGenerateApartments}
            disabled={isGenerating}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-orange-400 hover:text-orange-500 transition-all disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {t('Сгенерировать', 'Yaratish')}
          </button>
        )}

        {viewLevel === 'entrances' && apartments.length > 0 && (
          <button
            onClick={onAddApartment}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-orange-400 hover:text-orange-500 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Добавить кв.', "Xonadon qo'shish")}
          </button>
        )}

        {canManageImportExport && (viewLevel === 'branches' || viewLevel === 'buildings') && (
          <>
            {viewLevel === 'buildings' && selectedBranch && (
              <button
                onClick={(e) => onExportBranch(selectedBranch, e)}
                disabled={exportingBranchId === selectedBranch.id}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-green-400 hover:text-green-600 transition-all disabled:opacity-50"
              >
                {exportingBranchId === selectedBranch.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                {t('Экспорт', 'Eksport')}
              </button>
            )}
            <button
              onClick={onOpenImport}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-blue-400 hover:text-blue-500 transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('Импорт', 'Import')}
            </button>
          </>
        )}

        <button
          onClick={onAdd}
          className="px-3.5 py-1.5 rounded-lg bg-orange-500 text-white text-[13px] font-bold flex items-center gap-1.5 hover:bg-orange-600 transition-all"
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
