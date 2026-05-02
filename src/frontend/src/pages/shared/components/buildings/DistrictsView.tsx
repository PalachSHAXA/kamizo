import {
  Plus, Trash2, MapPin, Home, Users, Building2,
} from 'lucide-react';
import type { Branch } from './types';

interface DistrictsViewProps {
  branches: Branch[];
  allDistricts: string[];
  noBranchDistrict: boolean;
  language: string;
  user: { role: string } | null;
  onDistrictClick: (district: string) => void;
  onDeleteDistrictConfirm: (district: string) => void;
  onShowAddDistrictModal: () => void;
}

export function DistrictsView({
  branches,
  allDistricts,
  noBranchDistrict,
  language,
  user,
  onDistrictClick,
  onDeleteDistrictConfirm,
  onShowAddDistrictModal,
}: DistrictsViewProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10 overflow-y-auto">
      {branches.length > 0 ? (
        <>
          <div className="text-center">
            <h1 className="text-[28px] font-black tracking-tight">{t('Выберите район', 'Tumanni tanlang')}</h1>
            <p className="text-[14px] text-gray-400 mt-2">{t('Нажмите на район чтобы перейти к комплексам', "Komplekslarga o'tish uchun tumanni bosing")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] w-full">
            {allDistricts.map(district => {
              const dBranches = branches.filter(b => b.district === district);
              const totalBuildings = dBranches.reduce((s, b) => s + (b.buildings_count || 0), 0);
              const totalResidents = dBranches.reduce((s, b) => s + (b.residents_count || 0), 0);
              return (
                <div key={district}
                  className="bg-white rounded-2xl border-2 border-gray-200 cursor-pointer transition-all hover:border-orange-400 hover:-translate-y-1 hover:shadow-lg overflow-hidden relative group/district"
                  onClick={() => onDistrictClick(district)}>
                  <div className="h-20 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A4F4F 0%, #1A6B3A 100%)' }}>
                    <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] px-6">
                      {[4,7,5,9,6,8,3,7,5,10,4,6,8,5,7].map((h, i) => (
                        <div key={i} className="rounded-t-[2px]" style={{ width: 12, height: h * 3, background: 'rgba(255,255,255,.12)' }} />
                      ))}
                    </div>
                    <div className="absolute top-3 left-4 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-white/80" />
                      <span className="text-white font-extrabold text-[15px] tracking-tight">{district}</span>
                    </div>
                    {user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) && (
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteDistrictConfirm(district); }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/20 hover:bg-red-500/80 flex items-center justify-center opacity-0 group-hover/district:opacity-100 transition-all"
                        title={language === 'ru' ? 'Удалить район' : 'Tumanni o\'chirish'}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                    )}
                  </div>
                  <div className="p-4 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><Home className="w-4 h-4 text-blue-600" /></div>
                      <div><div className="text-[18px] font-extrabold text-blue-600 leading-tight">{dBranches.length}</div><div className="text-xs text-gray-400 uppercase tracking-wide">{t('Комплексов', 'Komplekslar')}</div></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center"><Building2 className="w-4 h-4 text-green-600" /></div>
                      <div><div className="text-[18px] font-extrabold text-green-600 leading-tight">{totalBuildings}</div><div className="text-xs text-gray-400 uppercase tracking-wide">{t('Домов', 'Uylar')}</div></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center"><Users className="w-4 h-4 text-orange-500" /></div>
                      <div><div className="text-[18px] font-extrabold text-orange-500 leading-tight">{totalResidents}</div><div className="text-xs text-gray-400 uppercase tracking-wide">{t('Жителей', 'Yashovchilar')}</div></div>
                    </div>
                  </div>
                </div>
              );
            })}
            {noBranchDistrict && (
              <div onClick={() => onDistrictClick('')}
                className="bg-white rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer transition-all hover:border-orange-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="p-5 text-center">
                  <p className="text-[14px] font-semibold text-gray-400">{t('Без района', 'Tumansiz komplekslar')}</p>
                  <p className="text-[12px] text-gray-300 mt-1">{branches.filter(b => !b.district).length} {t('Комплексов', 'Komplekslar')}</p>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center">
          <MapPin className="w-14 h-14 mx-auto mb-4 text-gray-200" />
          <h2 className="text-[20px] font-bold text-gray-700 mb-2">{t('Нет районов', "Tumanlar yo'q")}</h2>
          <p className="text-gray-400 mb-6">{t('Добавьте первый район чтобы начать работу', "Boshlash uchun birinchi tumanni qo'shing")}</p>
          <button onClick={onShowAddDistrictModal}
            className="px-6 py-3 rounded-xl bg-orange-500 text-white font-bold flex items-center gap-2 mx-auto hover:bg-orange-600 transition-all">
            <Plus className="w-4 h-4" />
            {t('Добавить район', "Tuman qo'shish")}
          </button>
        </div>
      )}
    </div>
  );
}
