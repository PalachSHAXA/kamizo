import { User, FileText, CheckCircle, Clock } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { ContractQRCode } from '../components/ContractQRCode';
import { StatusBadge } from '../components/common';
import { formatName } from '../utils/formatName';

export function ResidentContractPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-0">
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

      {/* Contract Details — was previously hidden on /contract, forcing residents
          to go to /profile just to see the contract number/type/term. */}
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-600" />
          {language === 'ru' ? 'Детали договора' : 'Shartnoma tafsilotlari'}
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">{language === 'ru' ? 'Статус' : 'Holat'}</span>
            {user.contractSignedAt ? (
              <StatusBadge status="active" size="sm" className="gap-1">
                <CheckCircle className="w-3 h-3" />
                {language === 'ru' ? 'Действующий' : 'Amal qiluvchi'}
              </StatusBadge>
            ) : (
              <StatusBadge status="pending" size="sm" className="gap-1">
                <Clock className="w-3 h-3" />
                {language === 'ru' ? 'Ожидает подписания' : "Imzolash kutilmoqda"}
              </StatusBadge>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'Номер' : 'Raqam'}</span>
            <span className="font-mono font-medium text-gray-900 text-xs sm:text-sm">
              {user.contractNumber || `ДОГ-${new Date().getFullYear()}-${user.login}`}
            </span>
          </div>
          {user.contractType && (
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Тип' : 'Tur'}</span>
              <span className="font-medium text-gray-900">
                {user.contractType === 'standard'
                  ? (language === 'ru' ? 'Стандартный' : 'Standart')
                  : user.contractType === 'commercial'
                    ? (language === 'ru' ? 'Коммерческий' : 'Tijorat')
                    : user.contractType === 'rental'
                      ? (language === 'ru' ? 'Аренда' : 'Ijara')
                      : user.contractType}
              </span>
            </div>
          )}
          {user.contractStartDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Дата начала' : 'Boshlanish sanasi'}</span>
              <span className="font-medium text-gray-900">
                {new Date(user.contractStartDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'Срок действия' : 'Muddat'}</span>
            <span className="font-medium text-gray-900">
              {user.contractEndDate
                ? new Date(user.contractEndDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')
                : (language === 'ru' ? 'Бессрочно' : 'Muddatsiz')}
            </span>
          </div>
          {user.contractSignedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ru' ? 'Подписан' : 'Imzolangan'}</span>
              <span className="font-medium text-gray-900">
                {new Date(user.contractSignedAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* User Info Card */}
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-600" />
          {language === 'ru' ? 'Данные профиля' : 'Profil ma\'lumotlari'}
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{language === 'ru' ? 'ФИО' : 'F.I.O'}</span>
            <span className="font-medium text-gray-900">{formatName(user.name)}</span>
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
