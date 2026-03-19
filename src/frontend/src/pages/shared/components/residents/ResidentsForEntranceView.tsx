import {
  Upload, UserPlus, ChevronRight, ArrowLeft
} from 'lucide-react';
import type { Branch, Entrance, BuildingFull, MappedResident } from './types';
import { ResidentsList } from './ResidentsList';

interface ResidentsForEntranceViewProps {
  selectedBranch: Branch | null;
  selectedBuilding: BuildingFull;
  selectedEntrance: Entrance;
  filteredResidents: MappedResident[];
  isLoadingResidents: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onBack: () => void;
  onNavigateToBranches: () => void;
  onNavigateToBuildings: () => void;
  onShowAddManual: () => void;
  onShowUpload: () => void;
  onResidentClick: (resident: MappedResident) => void;
  onDeleteAllClick: () => void;
  language: string;
}

export function ResidentsForEntranceView({
  selectedBranch,
  selectedBuilding,
  selectedEntrance,
  filteredResidents,
  isLoadingResidents,
  searchQuery,
  setSearchQuery,
  onBack,
  onNavigateToBranches,
  onNavigateToBuildings,
  onShowAddManual,
  onShowUpload,
  onResidentClick,
  onDeleteAllClick,
  language,
}: ResidentsForEntranceViewProps) {
  return (
    <div>
      {/* Entrance Header with Breadcrumb */}
      <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <button
                onClick={onNavigateToBranches}
                className="text-gray-500 hover:text-primary-600"
              >
                {language === 'ru' ? 'Комплексы' : 'Komplekslar'}
              </button>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              <button
                onClick={onNavigateToBuildings}
                className="text-gray-500 hover:text-primary-600"
              >
                {selectedBranch?.name}
              </button>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              <button
                onClick={onBack}
                className="text-gray-500 hover:text-primary-600"
              >
                {language === 'ru' ? 'Дом' : 'Uy'} {selectedBuilding.buildingNumber || selectedBuilding.name}
              </button>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              <span className="font-medium text-gray-900">
                {language === 'ru' ? 'Подъезд' : 'Podyezd'} {selectedEntrance.number}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onShowAddManual}
              className="btn-secondary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'ru' ? 'Добавить' : 'Qo\'shish'}</span>
            </button>
            <button
              onClick={onShowUpload}
              className="btn-primary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>
      </div>

      <ResidentsList
        filteredResidents={filteredResidents}
        isLoadingResidents={isLoadingResidents}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onResidentClick={onResidentClick}
        onDeleteAllClick={onDeleteAllClick}
        language={language}
      />
    </div>
  );
}
