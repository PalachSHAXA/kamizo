import { X } from 'lucide-react';
import type { BuildingFull } from './types';

interface ManualForm {
  fullName: string;
  phone: string;
  address: string;
  personalAccount: string;
}

interface AddResidentModalProps {
  manualForm: ManualForm;
  setManualForm: (form: ManualForm) => void;
  selectedBuilding: BuildingFull | null;
  defaultPassword: string;
  onClose: () => void;
  onSubmit: () => void;
  language: string;
}

export function AddResidentModal({
  manualForm,
  setManualForm,
  selectedBuilding,
  defaultPassword,
  onClose,
  onSubmit,
  language,
}: AddResidentModalProps) {
  return (
    <div className="modal-backdrop items-end sm:items-center">
      <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-bold">{language === 'ru' ? 'Добавить жителя' : 'Yashovchi qo\'shish'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/30 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Л/С (Лицевой счет)' : 'Sh/H (Shaxsiy hisob)'}</label>
            <input
              type="text"
              value={manualForm.personalAccount}
              onChange={(e) => setManualForm({...manualForm, personalAccount: e.target.value})}
              className="input-field"
              placeholder="12345678"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО абонента *' : 'Abonent F.I.O. *'}</label>
            <input
              type="text"
              value={manualForm.fullName}
              onChange={(e) => setManualForm({...manualForm, fullName: e.target.value})}
              className="input-field"
              placeholder={language === 'ru' ? 'Иванов Иван Иванович' : 'Ivanov Ivan Ivanovich'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Адрес' : 'Manzil'}</label>
            <input
              type="text"
              value={manualForm.address}
              onChange={(e) => setManualForm({...manualForm, address: e.target.value})}
              className="input-field"
              placeholder={language === 'ru' ? 'ул. Мустакиллик, 15, кв. 42' : 'Mustaqillik ko\'ch., 15, xon. 42'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}</label>
            <input
              type="tel"
              value={manualForm.phone}
              onChange={(e) => setManualForm({...manualForm, phone: e.target.value})}
              className="input-field"
              placeholder="+998 90 123 45 67"
              maxLength={13}
            />
          </div>

          <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
            <strong>{language === 'ru' ? 'Пароль' : 'Parol'}:</strong> {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber
              ? `${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/${language === 'ru' ? '[кв]' : '[xon]'}`
              : defaultPassword}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
          </button>
          <button
            onClick={onSubmit}
            disabled={!manualForm.fullName}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {language === 'ru' ? 'Создать аккаунт' : 'Akkaunt yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}
