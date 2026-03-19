import { Loader2, AlertCircle } from 'lucide-react';
import { Modal } from '../../../../components/common';
import type { Branch } from './types';

interface DeleteDistrictConfirmProps {
  districtName: string;
  branches: Branch[];
  isDeletingDistrict: boolean;
  cascadeConfirmChecked: boolean;
  setCascadeConfirmChecked: (checked: boolean) => void;
  language: string;
  onClose: () => void;
  onDelete: (districtName: string) => void;
}

export function DeleteDistrictConfirm({
  districtName,
  branches,
  isDeletingDistrict,
  cascadeConfirmChecked,
  setCascadeConfirmChecked,
  language,
  onClose,
  onDelete,
}: DeleteDistrictConfirmProps) {
  const dBranches = branches.filter(b => b.district === districtName);
  const totalBuildings = dBranches.reduce((s, b) => s + (b.buildings_count || 0), 0);
  const totalResidents = dBranches.reduce((s, b) => s + (b.residents_count || 0), 0);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={language === 'ru' ? `Удалить район «${districtName}»?` : `«${districtName}» tumani o'chirilsinmi?`}
      size="sm"
    >
        <div className="flex items-center justify-center w-14 h-14 rounded-full mx-auto mb-4 bg-red-100">
          <AlertCircle className="w-7 h-7 text-red-600" />
        </div>
        <div className="space-y-2 mb-4">
          <p className="text-sm text-center text-red-700 bg-red-50 rounded-xl p-3">
            {language === 'ru'
              ? `Будут безвозвратно удалены: ${dBranches.length} комплексов, ${totalBuildings} домов, ${totalResidents} жит. и все связанные данные.`
              : `Butunlay o'chiriladi: ${dBranches.length} kompleks, ${totalBuildings} uy, ${totalResidents} yashovchi va barcha bog'liq ma'lumotlar.`
            }
          </p>
        </div>
        <label className="flex items-start gap-3 mb-5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={cascadeConfirmChecked}
            onChange={e => setCascadeConfirmChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-red-500 shrink-0"
          />
          <span className="text-sm text-gray-700">
            {language === 'ru'
              ? 'Я понимаю, что все данные будут удалены без возможности восстановления'
              : 'Barcha ma\'lumotlar tiklab bo\'lmas tarzda o\'chirilishini tushunaman'}
          </span>
        </label>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm"
          >
            {language === 'ru' ? 'Отмена' : 'Bekor'}
          </button>
          <button
            onClick={() => onDelete(districtName)}
            disabled={isDeletingDistrict || !cascadeConfirmChecked}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeletingDistrict && <Loader2 className="w-4 h-4 animate-spin" />}
            {language === 'ru' ? 'Удалить всё' : 'Hammasini o\'chirish'}
          </button>
        </div>
    </Modal>
  );
}
