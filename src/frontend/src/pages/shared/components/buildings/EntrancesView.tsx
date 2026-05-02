import {
  Loader2, Zap, Home, DoorOpen, Users, Hash,
} from 'lucide-react';
import type { Apartment, Entrance } from './types';
import { getAptStatus, getStatusStyle, getStatusLabel, getBuildingColor } from './types';
import type { BuildingFull } from '../../../../types';

interface EntrancesViewProps {
  entrances: Entrance[];
  apartments: Apartment[];
  selectedBuilding: BuildingFull | null;
  selectedApartment: Apartment | null;
  isLoadingEntrances: boolean;
  isLoadingApartments: boolean;
  isGenerating: boolean;
  language: string;
  user: { role: string } | null;
  sortedEntrances: Entrance[];
  entranceMap: Map<string, Apartment[]>;
  floors: number[];
  onApartmentClick: (apt: Apartment) => void;
  onEditEntrance: (ent: Entrance) => void;
  onGenerateApartments: () => void;
}

export function EntrancesView({
  entrances,
  apartments,
  selectedBuilding,
  selectedApartment,
  isLoadingEntrances,
  isLoadingApartments,
  isGenerating,
  language,
  user,
  sortedEntrances,
  entranceMap,
  floors,
  onApartmentClick,
  onEditEntrance,
  onGenerateApartments,
}: EntrancesViewProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    <div className="flex-1 overflow-auto p-5">
      {(isLoadingEntrances || isLoadingApartments) ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : entrances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <DoorOpen className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-600 font-bold">{t('Подъезды не добавлены', "Podyezdlar qo'shilmagan")}</p>
          <p className="text-gray-400 text-sm mt-1">{t('Сначала добавьте подъезды', "Avval podyezdlarni qo'shing")}</p>
        </div>
      ) : apartments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          {/* Entrance chips — clickable for management roles */}
          {user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) && (
            <div className="mb-6">
              <p className="text-xs text-gray-400 mb-3">{t('Нажмите на подъезд для редактирования параметров', 'Parametrlarni tahrirlash uchun podyezdni bosing')}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {entrances.map(ent => (
                  <button
                    key={ent.id}
                    onClick={() => onEditEntrance(ent)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-b from-gray-600 to-gray-800 text-white shadow-md hover:from-orange-500 hover:to-orange-700 transition-all"
                  >
                    <DoorOpen className="w-4 h-4 opacity-80" />
                    <span className="text-[13px] font-bold">{t('Подъезд', 'Podyezd')} {ent.number}</span>
                    <span className="text-xs opacity-60 ml-1">{ent.apartments_from}–{ent.apartments_to}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Home className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-600 font-bold">{t('Квартиры не добавлены', "Xonadonlar qo'shilmagan")}</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">{t('Сгенерируйте квартиры из подъездов', 'Podyezdlardan xonadonlarni yarating')}</p>
          <button
            onClick={onGenerateApartments}
            disabled={isGenerating}
            className="px-5 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center gap-2 hover:bg-orange-600 transition-all disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {t('Сгенерировать квартиры', 'Xonadonlarni yaratish')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full h-full overflow-auto py-4">
          {/* Each entrance as a separate building */}
          <div className="flex gap-6 items-end flex-wrap justify-center">
            {sortedEntrances.map(ent => {
              const aptsInEnt = entranceMap.get(ent.id) || [];
              const resCount = aptsInEnt.reduce((sum, a) => sum + (a.resident_count || 0), 0);
              const maxAptsPerFloor = Math.max(...floors.map(f => aptsInEnt.filter(a => a.floor === f).length), 1);
              const buildingColor = getBuildingColor(`${selectedBuilding?.name || ''}-${ent.number}`);

              return (
                <div key={ent.id} className="flex flex-col items-center">
                  {/* Entrance info */}
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-b from-gray-600 to-gray-800 text-white shadow-md ${user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) ? 'cursor-pointer hover:from-orange-500 hover:to-orange-700 transition-all' : ''}`}
                      onClick={() => { if (user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role)) onEditEntrance(ent); }}
                      title={user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) ? (language === 'ru' ? 'Редактировать параметры подъезда' : 'Podyezd parametrlarini tahrirlash') : undefined}
                    >
                      <DoorOpen className="w-4 h-4 opacity-80" />
                      <span className="text-[13px] font-bold">{t('Подъезд', 'Podyezd')} {ent.number}</span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Home className="w-3 h-3" />{aptsInEnt.length}
                      {resCount > 0 && <><span className="mx-0.5">·</span><Users className="w-3 h-3 text-green-600" /><span className="font-bold text-green-600">{resCount}</span></>}
                    </div>
                  </div>

                  {/* Building body — the wall wrapping the apartments */}
                  <div className="relative" style={{ borderRadius: '8px 8px 0 0', overflow: 'hidden' }}>
                    {/* Roof */}
                    <div className="h-3 rounded-t-lg" style={{ background: buildingColor, marginLeft: -4, marginRight: -4, position: 'relative', zIndex: 2 }}>
                      <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: `${buildingColor}88` }} />
                    </div>

                    {/* Wall with apartments as windows */}
                    <div className="relative" style={{ background: buildingColor, padding: '6px 10px 8px', marginLeft: -4, marginRight: -4 }}>
                      {floors.map((floor) => {
                        const aptsOnFloor = aptsInEnt
                          .filter(a => a.floor === floor)
                          .sort((a, b) => parseInt(a.number) - parseInt(b.number));

                        return (
                          <div key={floor} className="flex items-center mb-[4px]">
                            {/* Floor number on the wall */}
                            <div className="w-8 flex-shrink-0 text-right pr-2">
                              <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,.5)' }}>
                                {floor}
                              </span>
                            </div>

                            <div className="flex gap-[5px]" style={{ minWidth: maxAptsPerFloor * 66, minHeight: 46 }}>
                              {aptsOnFloor.length > 0 ? aptsOnFloor.map(apt => {
                                const status = getAptStatus(apt);
                                const isSelected = selectedApartment?.id === apt.id;
                                const style = getStatusStyle(status);
                                const hasResidents = (apt.resident_count || 0) > 0;
                                return (
                                  <button
                                    key={apt.id}
                                    onClick={() => onApartmentClick(apt)}
                                    title={`${t('Кв', 'Xn')}. ${apt.number} — ${getStatusLabel(status, language)}${hasResidents ? ` (${apt.resident_count} ${t('чел.', 'kishi')})` : ''}`}
                                    className="relative flex items-center justify-center rounded-lg text-[13px] font-bold transition-all hover:scale-105 hover:shadow-lg hover:z-10"
                                    style={{
                                      width: 60, height: 42,
                                      background: isSelected ? '#FF6B35' : style.background,
                                      color: isSelected ? '#fff' : style.color,
                                      border: isSelected ? '2px solid #FF6B35' : '1px solid rgba(255,255,255,.15)',
                                      boxShadow: isSelected
                                        ? '0 0 0 3px rgba(255,107,53,.3), 0 4px 12px rgba(255,107,53,.4)'
                                        : 'inset 0 1px 2px rgba(0,0,0,.06)',
                                      ...(isSelected ? { transform: 'scale(1.1)', zIndex: 20 } : {}),
                                    }}
                                  >
                                    {apt.number}
                                    {hasResidents && !isSelected && (
                                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] rounded-full bg-green-500 border-2 border-white text-white text-[10px] font-bold flex items-center justify-center px-0.5">
                                        {apt.resident_count}
                                      </span>
                                    )}
                                  </button>
                                );
                              }) : (
                                /* Empty floor — show dim window placeholders */
                                Array.from({ length: maxAptsPerFloor }, (_, i) => (
                                  <div key={i} className="rounded-md" style={{ width: 60, height: 42, background: 'rgba(255,255,255,.08)', border: '1px dashed rgba(255,255,255,.12)' }} />
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Door at bottom */}
                      <div className="flex justify-center mt-1">
                        <div className="rounded-t-lg" style={{ width: 28, height: 18, background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.15)' }} />
                      </div>
                    </div>
                  </div>

                  {/* Ground */}
                  <div className="h-2 rounded-b-sm" style={{ width: 'calc(100% + 8px)', background: '#94A3B8' }} />
                </div>
              );
            })}
          </div>

          {/* Quick help hint */}
          <div className="mt-4 flex items-center gap-2 text-[12px] text-gray-400">
            <Hash className="w-3.5 h-3.5" />
            {t('Нажмите на квартиру для просмотра · Зелёный бейдж = кол-во жителей', 'Xonadonni bosing · Yashil belgi = yashovchilar soni')}
          </div>
        </div>
      )}
    </div>
  );
}
