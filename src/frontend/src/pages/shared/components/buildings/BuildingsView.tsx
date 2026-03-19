import {
  Search, Edit, Trash2, Building2,
  Layers, DoorOpen, LayoutGrid,
} from 'lucide-react';
import { EmptyState } from '../../../../components/common';
import { BuildingVisual } from './BuildingVisual';
import { getStatusStyle, getBuildingColor } from './types';
import type { BuildingFull } from '../../../../types';

interface BuildingsViewProps {
  searchedBuildings: BuildingFull[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  language: string;
  onBuildingClick: (building: BuildingFull) => void;
  onEditBuilding: (building: BuildingFull) => void;
  onDeleteBuilding: (id: string) => void;
}

export function BuildingsView({
  searchedBuildings,
  searchQuery,
  setSearchQuery,
  language,
  onBuildingClick,
  onEditBuilding,
  onDeleteBuilding,
}: BuildingsViewProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl mb-5 max-w-md focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
        <Search className="w-4 h-4 text-gray-300" />
        <input
          type="text"
          placeholder={t('Поиск по домам...', "Uylar bo'yicha qidirish ...")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[13px]"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {searchedBuildings.map(building => {
          const color = getBuildingColor(building.name);
          const occupied = Math.min(building.residentsCount || 0, building.totalApartments);
          const vacant = Math.max(0, building.totalApartments - occupied);
          const occupancyPct = building.totalApartments > 0 ? Math.min(100, Math.round((occupied / building.totalApartments) * 100)) : 0;
          return (
            <div
              key={building.id}
              onClick={() => onBuildingClick(building)}
              className="bg-white rounded-2xl border border-gray-200 cursor-pointer transition-all hover:border-orange-300 hover:-translate-y-1 hover:shadow-xl overflow-hidden group"
            >
              <BuildingVisual floors={building.floors || 9} entrances={building.entrances || 4} color={color} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[18px] font-extrabold mb-1.5 truncate">{building.name}</div>
                    <div className="flex items-center gap-2 text-[13px] text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Layers className="w-4 h-4" />
                        {building.floors} {t('эт.', 'qav.')}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="flex items-center gap-1">
                        <DoorOpen className="w-4 h-4" />
                        {building.entrances} {t('подъ.', 'pod.')}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="flex items-center gap-1">
                        <LayoutGrid className="w-4 h-4" />
                        {building.totalApartments} {t('кв.', 'xn.')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onEditBuilding(building)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100" aria-label="Редактировать">
                      <Edit className="w-4 h-4 text-gray-400" />
                    </button>
                    <button onClick={() => onDeleteBuilding(building.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50" aria-label="Удалить">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Occupancy bar */}
                <div className="mt-3 mb-3">
                  <div className="flex justify-between text-[12px] mb-1.5">
                    <span className="text-gray-400">{t('Заселённость', 'Bandlik')}</span>
                    <span className="font-bold text-gray-600">{occupancyPct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${occupancyPct}%`,
                      background: occupancyPct > 80 ? '#16A34A' : occupancyPct > 50 ? '#F59E0B' : '#EF4444',
                    }} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="text-[13px] font-bold px-3 py-1 rounded-full" style={{ ...getStatusStyle('vacant') }}>
                    {vacant} {t('св.', "bo'sh")}
                  </span>
                  <span className="text-[13px] font-bold px-3 py-1 rounded-full" style={{ ...getStatusStyle('occupied') }}>
                    {occupied} {t('зан.', 'band')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {searchedBuildings.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={<Building2 className="w-12 h-12" />}
              title={language === 'ru' ? 'Нет домов' : 'Uylar yo\'q'}
              description={language === 'ru' ? 'Добавьте первый дом в комплекс' : 'Kompleksga birinchi uyni qo\'shing'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
