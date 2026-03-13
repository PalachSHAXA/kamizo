import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';

interface CredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: { login: string; password: string };
}

export function CredentialsModal({ isOpen, onClose, credentials }: CredentialsModalProps) {
  const { language } = useLanguageStore();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyCredentials = () => {
    navigator.clipboard.writeText(`${language === 'ru' ? 'Логин' : 'Login'}: ${credentials.login}\n${language === 'ru' ? 'Пароль' : 'Parol'}: ${credentials.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-md mx-3 md:mx-4 rounded-t-2xl sm:rounded-2xl">
        <div className="text-center mb-4 md:mb-6">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
            <Check className="w-7 h-7 md:w-8 md:h-8 text-green-600" />
          </div>
          <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Исполнитель добавлен!' : 'Ijrochi qo\'shildi!'}</h2>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-sm md:text-base">{language === 'ru' ? 'Сохраните данные для входа' : 'Kirish ma\'lumotlarini saqlang'}</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 md:p-4 space-y-2 md:space-y-3">
          <div>
            <div className="text-xs md:text-sm text-gray-500">{language === 'ru' ? 'Логин' : 'Login'}</div>
            <div className="font-mono text-base md:text-lg font-semibold">{credentials.login}</div>
          </div>
          <div>
            <div className="text-xs md:text-sm text-gray-500">{language === 'ru' ? 'Пароль' : 'Parol'}</div>
            <div className="font-mono text-base md:text-lg font-semibold">{credentials.password}</div>
          </div>
        </div>

        <div className="flex gap-2 md:gap-3 mt-4 md:mt-6">
          <button
            onClick={copyCredentials}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 text-sm touch-manipulation"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? (language === 'ru' ? 'Скопировано!' : 'Nusxalandi!') : (language === 'ru' ? 'Копировать' : 'Nusxalash')}
          </button>
          <button onClick={onClose} className="btn-primary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
            {language === 'ru' ? 'Готово' : 'Tayyor'}
          </button>
        </div>
      </div>
    </div>
  );
}
