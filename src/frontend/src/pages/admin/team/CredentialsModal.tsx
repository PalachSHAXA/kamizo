import { Check, Copy } from 'lucide-react';

// Sprint 17: extracted from TeamPage. Shown once after an admin creates
// a new staff member — displays the generated login + password with
// copy-to-clipboard buttons. The password is plaintext only at this
// moment; subsequent reads from the API are encrypted.

interface CredentialsModalProps {
  credentials: { login: string; password: string };
  language: string;
  onClose: () => void;
  copiedField: string | null;
  onCopy: (field: 'cred-login' | 'cred-password', value: string) => void;
}

export function CredentialsModal({
  credentials,
  language,
  onClose,
  copiedField,
  onCopy,
}: CredentialsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">
            {language === 'ru' ? 'Сотрудник создан!' : 'Xodim yaratildi!'}
          </h3>
          <p className="text-gray-500 mt-2">
            {language === 'ru' ? 'Сохраните учетные данные для входа' : "Kirish ma'lumotlarini saqlang"}
          </p>
        </div>

        <div className="space-y-4 bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{language === 'ru' ? 'Логин' : 'Login'}</span>
            <div className="flex items-center gap-2">
              <code className="bg-white px-3 py-1.5 rounded-lg text-sm font-mono font-medium">
                {credentials.login}
              </code>
              <button
                onClick={() => onCopy('cred-login', credentials.login)}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {copiedField === 'cred-login' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{language === 'ru' ? 'Пароль' : 'Parol'}</span>
            <div className="flex items-center gap-2">
              <code className="bg-white px-3 py-1.5 rounded-lg text-sm font-mono font-medium">
                {credentials.password}
              </code>
              <button
                onClick={() => onCopy('cred-password', credentials.password)}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {copiedField === 'cred-password' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
          <p className="text-sm text-yellow-800">
            {language === 'ru'
              ? '⚠️ Сохраните эти данные! Пароль показывается только один раз.'
              : "⚠️ Bu ma'lumotlarni saqlang! Parol faqat bir marta ko'rsatiladi."}
          </p>
        </div>

        <button onClick={onClose} className="btn-primary w-full mt-6">
          {language === 'ru' ? 'Готово' : 'Tayyor'}
        </button>
      </div>
    </div>
  );
}
