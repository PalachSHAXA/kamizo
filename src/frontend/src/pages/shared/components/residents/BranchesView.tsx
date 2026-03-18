import {
  Building2, Users, Search, MapPin, Loader2, GitBranch
} from 'lucide-react';
import type { Branch } from './types';

interface BranchesViewProps {
  branches: Branch[];
  isLoadingBranches: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onBranchClick: (branch: Branch) => void;
  language: string;
}

export function BranchesView({
  branches,
  isLoadingBranches,
  searchQuery,
  setSearchQuery,
  onBranchClick,
  language,
}: BranchesViewProps) {
  return (
    <div className="flex-1 flex flex-col items-center gap-6 pt-6">
      {isLoadingBranches ? (
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
          <p className="text-gray-500">{language === 'ru' ? 'Загрузка филиалов...' : 'Filiallar yuklanmoqda...'}</p>
        </div>
      ) : branches.length === 0 ? (
        <div className="text-center">
          <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Филиалы не найдены' : 'Filiallar topilmadi'}</h3>
          <p className="text-gray-400 mt-1">
            {language === 'ru' ? 'Добавьте филиалы в разделе "Дома/Объекты"' : '"Uylar/Obyektlar" bo\'limida filiallar qo\'shing'}
          </p>
        </div>
      ) : (
        <>
          <div className="text-center">
            <h1 className="text-[28px] font-black tracking-tight">{language === 'ru' ? 'Выберите филиал' : 'Filialni tanlang'}</h1>
            <p className="text-[14px] text-gray-400 mt-2">{language === 'ru' ? 'Нажмите на филиал чтобы перейти к жителям' : "Yashovchilarga o'tish uchun filialni bosing"}</p>
          </div>

          {/* Search */}
          <div className="w-full max-w-[700px]">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl">
              <Search className="w-4 h-4 text-gray-300" />
              <input
                type="text"
                placeholder={language === 'ru' ? 'Поиск по филиалам...' : "Filiallar bo'yicha qidirish..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-[13px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] w-full">
            {branches.filter(b => !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.code.toLowerCase().includes(searchQuery.toLowerCase())).map((branch) => (
              <div
                key={branch.id}
                onClick={() => onBranchClick(branch)}
                className="bg-white rounded-2xl border-2 border-gray-200 cursor-pointer transition-all hover:border-orange-400 hover:-translate-y-1 hover:shadow-lg group overflow-hidden"
              >
                {/* Branch header with gradient */}
                <div className="h-28 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A2A6C 0%, #2D4A8C 50%, #3D5A9C 100%)' }}>
                  {/* Mini cityscape silhouette */}
                  <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] px-6">
                    {[5,8,6,10,7,9,4,8,6,11,5,7,9,6,8,5,10,7].map((h, i) => (
                      <div key={i} className="rounded-t-[2px]" style={{ width: 12, height: h * 3.5, background: 'rgba(255,255,255,.1)' }} />
                    ))}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <MapPin className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <div className="text-[17px] font-extrabold truncate">{branch.name}</div>
                  </div>
                  <div className="text-[13px] text-gray-400 mb-4 ml-[24px]">
                    {branch.address || (language === 'ru' ? 'Ташкент' : 'Toshkent')}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                        <Building2 className="w-4.5 h-4.5 text-green-600" />
                      </div>
                      <div>
                        <div className="text-[20px] font-extrabold text-green-600 leading-tight">{branch.buildings_count}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">{language === 'ru' ? 'Домов' : 'Uylar'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                        <Users className="w-4.5 h-4.5 text-orange-500" />
                      </div>
                      <div>
                        <div className="text-[20px] font-extrabold text-orange-500 leading-tight">{branch.residents_count}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">{language === 'ru' ? 'Жителей' : 'Yashovchilar'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
