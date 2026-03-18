import { Loader2, CheckCircle } from 'lucide-react';
import type { BuildingFull } from './types';

interface ProgressIndicatorProps {
  isCreating: boolean;
  isDeleting: boolean;
  progressMessage: string;
}

export function ProgressIndicator({
  isCreating,
  isDeleting,
  progressMessage,
}: ProgressIndicatorProps) {
  if (!isCreating && !isDeleting && !progressMessage) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 glass-card p-4 max-w-sm shadow-xl animate-fade-in">
      <div className="flex items-center gap-3">
        {(isCreating || isDeleting) && (
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
          </div>
        )}
        {!isCreating && !isDeleting && progressMessage && (
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
        )}
        <div className="flex-1">
          <p className="font-medium text-gray-900">{progressMessage}</p>
        </div>
      </div>
    </div>
  );
}

interface CreatedAccountsNotificationProps {
  createdAccounts: { login: string; name: string }[];
  progressMessage: string;
  selectedBuilding: BuildingFull | null;
  defaultPassword: string;
  onDismiss: () => void;
  language: string;
}

export function CreatedAccountsNotification({
  createdAccounts,
  progressMessage,
  selectedBuilding,
  defaultPassword,
  onDismiss,
  language,
}: CreatedAccountsNotificationProps) {
  if (createdAccounts.length === 0 || progressMessage) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 glass-card p-4 max-w-sm shadow-xl animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-green-800">
            {language === 'ru'
              ? `Обработано ${createdAccounts.length} аккаунтов`
              : `${createdAccounts.length} ta akkaunt qayta ishlandi`}
          </h4>
          <p className="text-sm text-gray-600 mt-1">
            {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber ? (
              <>{language === 'ru' ? 'Формат пароля' : 'Parol formati'}: <code className="bg-gray-100 px-1 rounded">{selectedBuilding.branchCode}/{selectedBuilding.buildingNumber}/{language === 'ru' ? '[кв]' : '[xon]'}</code></>
            ) : (
              <>{language === 'ru' ? 'Пароль по умолчанию' : 'Standart parol'}: <code className="bg-gray-100 px-1 rounded">{defaultPassword}</code></>
            )}
          </p>
          <button
            onClick={onDismiss}
            className="text-sm text-primary-600 hover:text-primary-700 mt-2"
          >
            {language === 'ru' ? 'Понятно' : 'Tushunarli'}
          </button>
        </div>
      </div>
    </div>
  );
}
