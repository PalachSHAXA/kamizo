import {
  Plus, Search, Edit, Trash2, Home, Users, Building2,
  Download, Loader2,
} from 'lucide-react';
import type { Branch } from './types';

interface BranchesViewProps {
  searchedBranches: Branch[];
  selectedDistrict: string | null;
  allDistricts: string[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  language: string;
  canManageImportExport: boolean;
  exportingBranchId: string | null;
  onBranchClick: (branch: Branch) => void;
  onEditBranch: (branch: Branch) => void;
  onDeleteBranch: (id: string) => void;
  onExportBranch: (branch: Branch, e: React.MouseEvent) => void;
  onShowAddBranchModal: () => void;
  onDistrictFilter: (district: string) => void;
}

export function BranchesView({
  searchedBranches,
  selectedDistrict,
  allDistricts,
  searchQuery,
  setSearchQuery,
  language,
  canManageImportExport,
  exportingBranchId,
  onBranchClick,
  onEditBranch,
  onDeleteBranch,
  onExportBranch,
  onShowAddBranchModal,
  onDistrictFilter,
}: BranchesViewProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10 overflow-y-auto">
      {searchedBranches.length > 0 || selectedDistrict || searchQuery ? (
        <>
          <div className="text-center">
            <h1 className="text-[28px] font-black tracking-tight">
              {t('Комплексы', 'Komplekslar')}
            </h1>
            <p className="text-[14px] text-gray-400 mt-2">{t('Нажмите на комплекс чтобы перейти к домам', "Uylarga o'tish uchun kompleksni bosing")}</p>
          </div>
          <div className="w-full max-w-[700px] flex flex-col sm:flex-row items-center gap-3">
            {allDistricts.length > 0 && (
              <select
                value={selectedDistrict || ''}
                onChange={(e) => onDistrictFilter(e.target.value)}
                className="w-full sm:w-auto min-w-[180px] px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] font-semibold focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
              >
                <option value="">{t('Все районы', 'Barcha tumanlar')}</option>
                {allDistricts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
            <div className="flex-1 w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
              <Search className="w-4 h-4 text-gray-300" />
              <input type="text" placeholder={t('Поиск по комплексам...', "Komplekslar bo'yicha qidirish...")}
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-[13px]" aria-label={t('Поиск по комплексам', "Komplekslar bo'yicha qidirish")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] w-full">
            {searchedBranches.map(branch => (
              <div key={branch.id} onClick={() => onBranchClick(branch)}
                className="bg-white rounded-2xl border-2 border-gray-200 cursor-pointer transition-all hover:border-orange-400 hover:-translate-y-1 hover:shadow-lg group overflow-hidden">
                <div className="h-28 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A2A6C 0%, #2D4A8C 50%, #3D5A9C 100%)' }}>
                  <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] px-6">
                    {[5,8,6,10,7,9,4,8,6,11,5,7,9,6,8,5,10,7].map((h, i) => (
                      <div key={i} className="rounded-t-[2px]" style={{ width: 12, height: h * 3.5, background: 'rgba(255,255,255,.1)' }} />
                    ))}
                  </div>
                  <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    {canManageImportExport && (
                      <button onClick={(e) => onExportBranch(branch, e)} disabled={exportingBranchId === branch.id}
                        title={t('Экспортировать комплекс', 'Kompleksni eksport qilish')}
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 backdrop-blur hover:bg-green-500/60 disabled:opacity-50">
                        {exportingBranchId === branch.id ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Download className="w-4 h-4 text-white" />}
                      </button>
                    )}
                    <button onClick={() => onEditBranch(branch)} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 backdrop-blur hover:bg-white/40" aria-label="Редактировать">
                      <Edit className="w-4 h-4 text-white" />
                    </button>
                    <button onClick={() => onDeleteBranch(branch.id)} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 backdrop-blur hover:bg-red-400/60" aria-label="Удалить">
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Home className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <div className="text-[17px] font-extrabold truncate">{branch.name}</div>
                  </div>
                  <div className="text-[13px] text-gray-400 mb-4 ml-[24px]">
                    {branch.address || (branch.district || t('Ташкент', 'Toshkent'))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Building2 className="w-4 h-4 text-green-600" /></div>
                      <div><div className="text-[20px] font-extrabold text-green-600 leading-tight">{branch.buildings_count}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('Домов', 'Uylar')}</div></div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Users className="w-4 h-4 text-orange-500" /></div>
                      <div><div className="text-[20px] font-extrabold text-orange-500 leading-tight">{branch.residents_count}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('Жителей', 'Yashovchilar')}</div></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center">
          <Home className="w-14 h-14 mx-auto mb-4 text-gray-200" />
          <h2 className="text-[20px] font-bold text-gray-700 mb-2">{t('Нет комплексов', "Komplekslar yo'q")}</h2>
          <p className="text-gray-400 mb-6">
            {selectedDistrict
              ? t(`В районе "${selectedDistrict}" нет комплексов`, `"${selectedDistrict}" tumanida komplekslar yo'q`)
              : t('Добавьте первый комплекс', "Birinchi kompleksni qo'shing")}
          </p>
          <button onClick={onShowAddBranchModal}
            className="px-6 py-3 rounded-xl bg-orange-500 text-white font-bold flex items-center gap-2 mx-auto hover:bg-orange-600 transition-all">
            <Plus className="w-4 h-4" />
            {t('Добавить комплекс', "Kompleks qo'shish")}
          </button>
        </div>
      )}
    </div>
  );
}
