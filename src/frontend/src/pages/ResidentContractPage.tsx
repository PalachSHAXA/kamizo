import { User } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { ContractQRCode } from '../components/ContractQRCode';

export function ResidentContractPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">
          {language === 'ru' ? 'Договор с УК' : 'UK bilan shartnoma'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {language === 'ru' ? 'Ваш договор и уникальный QR-код' : 'Sizning shartnomangiz va noyob QR-kodingiz'}
        </p>
      </div>

      {/* Contract QR Code - uses user from store directly */}
      <ContractQRCode language={language} />

      {/* User Info Card */}
      <div className="glass-card p-4 md:p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-600" />
          {language === 'ru' ? 'Данные профиля' : 'Profil ma\'lumotlari'}
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'ФИО' : 'F.I.O'}</span>
            <span className="font-medium text-gray-900">{user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'Логин' : 'Login'}</span>
            <span className="font-medium text-gray-900">{user.login}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'Телефон' : 'Telefon'}</span>
            <span className="font-medium text-gray-900">{user.phone || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'Адрес' : 'Manzil'}</span>
            <span className="font-medium text-gray-900">{user.address || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'Квартира' : 'Xonadon'}</span>
            <span className="font-medium text-gray-900">{user.apartment || '-'}</span>
          </div>
          {user.branch && (
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Филиал' : 'Filial'}</span>
              <span className="font-medium text-gray-900">{user.branch}</span>
            </div>
          )}
          {user.building && (
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Дом' : 'Uy'}</span>
              <span className="font-medium text-gray-900">{user.building}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
