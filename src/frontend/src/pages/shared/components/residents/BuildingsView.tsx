import {
  Building2, MapPin, ChevronRight, Home, DoorOpen, ArrowLeft
} from 'lucide-react';
import type { Branch, BuildingFull } from './types';

interface BuildingsViewProps {
  selectedBranch: Branch;
  filteredBuildings: BuildingFull[];
  onBuildingClick: (building: BuildingFull) => void;
  onBack: () => void;
  language: string;
}

export function BuildingsView({
  selectedBranch,
  filteredBuildings,
  onBuildingClick,
  onBack,
  language,
}: BuildingsViewProps) {
  return (
    <div>
      {/* Branch Header */}
      <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">{selectedBranch.code}</span>
          </div>
          <div>
            <h2 className="font-semibold">{selectedBranch.name}</h2>
            <p className="text-sm text-gray-500">{language === 'ru' ? 'Выберите дом' : 'Uyni tanlang'}</p>
          </div>
        </div>
      </div>

      {filteredBuildings.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Дома не найдены' : 'Uylar topilmadi'}</h3>
          <p className="text-gray-400 mt-1">
            {language === 'ru' ? 'Добавьте дома в этот комплекс в разделе "Комплексы"' : 'Bu kompleksga "Komplekslar" bo\'limida uylar qo\'shing'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBuildings.map((building) => (
            <button
              key={building.id}
              onClick={() => onBuildingClick(building)}
              className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl text-left hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                    <Home className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{language === 'ru' ? 'Дом' : 'Uy'} {building.buildingNumber || building.name}</h3>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="w-3 h-3" />
                      {building.address}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors" />
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Home className="w-4 h-4 text-gray-400" />
                  <span>{building.totalApartments} {language === 'ru' ? 'кв.' : 'xon.'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <DoorOpen className="w-4 h-4 text-gray-400" />
                  <span>{building.entrances} {language === 'ru' ? 'подъездов' : 'podyezd'}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
