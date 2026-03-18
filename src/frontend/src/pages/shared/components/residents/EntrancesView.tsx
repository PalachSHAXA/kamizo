import {
  Users, Upload, UserPlus, ChevronRight, Home, DoorOpen,
  Loader2, AlertCircle, ArrowLeft
} from 'lucide-react';
import type { Branch, Entrance, BuildingFull, MappedResident } from './types';
import { ResidentsList } from './ResidentsList';

interface EntrancesViewProps {
  selectedBranch: Branch | null;
  selectedBuilding: BuildingFull;
  entrances: Entrance[];
  isLoadingEntrances: boolean;
  isLoadingResidents: boolean;
  allResidents: MappedResident[];
  filteredResidents: MappedResident[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onEntranceClick: (entrance: Entrance) => void;
  onBack: () => void;
  onNavigateToBranches: () => void;
  onShowAddManual: () => void;
  onShowUpload: () => void;
  onResidentClick: (resident: MappedResident) => void;
  onDeleteAllClick: () => void;
  language: string;
}

export function EntrancesView({
  selectedBranch,
  selectedBuilding,
  entrances,
  isLoadingEntrances,
  isLoadingResidents,
  allResidents,
  filteredResidents,
  searchQuery,
  setSearchQuery,
  onEntranceClick,
  onBack,
  onNavigateToBranches,
  onShowAddManual,
  onShowUpload,
  onResidentClick,
  onDeleteAllClick,
  language,
}: EntrancesViewProps) {
  return (
    <div>
      {/* Building Header with Breadcrumb */}
      <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={onNavigateToBranches}
                className="text-gray-500 hover:text-primary-600"
              >
                {language === 'ru' ? 'Филиалы' : 'Filiallar'}
              </button>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              <button
                onClick={onBack}
                className="text-gray-500 hover:text-primary-600"
              >
                {selectedBranch?.name}
              </button>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              <span className="font-medium text-gray-900">
                {language === 'ru' ? 'Дом' : 'Uy'} {selectedBuilding.buildingNumber || selectedBuilding.name}
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

      {/* Entrance selection or direct residents view */}
      {isLoadingEntrances ? (
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
          <p className="text-gray-500">{language === 'ru' ? 'Загрузка подъездов...' : 'Podyezdlar yuklanmoqda...'}</p>
        </div>
      ) : entrances.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entrances.map((entrance) => {
            const entranceResidents = allResidents.filter(r =>
              r.buildingId === selectedBuilding.id &&
              r.entrance === String(entrance.number)
            );
            return (
              <button
                key={entrance.id}
                onClick={() => onEntranceClick(entrance)}
                className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl text-left hover:shadow-lg transition-shadow group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-teal-500 rounded-xl flex items-center justify-center">
                      <DoorOpen className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{language === 'ru' ? 'Подъезд' : 'Podyezd'} {entrance.number}</h3>
                      <div className="text-sm text-gray-500">
                        {entrance.floors_from && entrance.floors_to && (
                          <span>{language === 'ru' ? 'Этажи' : 'Qavatlar'} {entrance.floors_from}-{entrance.floors_to}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors" />
                </div>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  {entrance.apartments_from && entrance.apartments_to && (
                    <div className="flex items-center gap-1">
                      <Home className="w-4 h-4 text-gray-400" />
                      <span>{language === 'ru' ? 'кв.' : 'xon.'} {entrance.apartments_from}-{entrance.apartments_to}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span>{entranceResidents.length} {language === 'ru' ? 'жителей' : 'yashovchi'}</span>
                  </div>
                </div>
              </button>
            );
          })}
          {/* Show card for residents without entrance */}
          {(() => {
            const unassignedResidents = allResidents.filter(r =>
              r.buildingId === selectedBuilding.id && !r.entrance
            );
            if (unassignedResidents.length === 0) return null;
            return (
              <button
                onClick={() => {
                  onEntranceClick({ id: 'unassigned', building_id: selectedBuilding.id, number: 0 } as Entrance);
                }}
                className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl text-left hover:shadow-lg transition-shadow group border-dashed border-2 border-gray-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-500">{language === 'ru' ? 'Без подъезда' : 'Podyezdsiz'}</h3>
                      <div className="text-sm text-gray-400">{language === 'ru' ? 'Не привязаны к подъезду' : 'Podyezdga biriktirilmagan'}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors" />
                </div>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span>{unassignedResidents.length} {language === 'ru' ? 'жителей' : 'yashovchi'}</span>
                  </div>
                </div>
              </button>
            );
          })()}
        </div>
      ) : (
        // No entrances - show residents directly
        <ResidentsList
          filteredResidents={filteredResidents}
          isLoadingResidents={isLoadingResidents}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onResidentClick={onResidentClick}
          onDeleteAllClick={onDeleteAllClick}
          language={language}
        />
      )}
    </div>
  );
}
