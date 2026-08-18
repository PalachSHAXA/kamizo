import { Check, Copy } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';

// Shown once after staff creation or password reset. Plaintext credentials
// exist only for this lifecycle and are never read back from the API.
interface CredentialsModalProps {
  credentials: { login: string; password: string };
  mode: 'create' | 'reset';
  language: string;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  copiedField: string | null;
  onCopy: (field: 'cred-login' | 'cred-password', value: string) => void;
}

export function CredentialsModal({
  credentials,
  mode,
  language,
  onClose,
  returnFocus,
  copiedField,
  onCopy,
}: CredentialsModalProps) {
  const title = mode === 'reset'
    ? language === 'ru' ? 'Пароль сброшен!' : 'Parol tiklandi!'
    : language === 'ru' ? 'Сотрудник создан!' : 'Xodim yaratildi!';

  return (
    <Modal
      open
      onClose={onClose}
      returnFocus={returnFocus}
      title={title}
      hideCloseButton
      size="md"
      panelClassName="max-h-[100dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col"
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-gray-500">
            {mode === 'reset'
              ? language === 'ru' ? 'Сохраните новый временный пароль для входа' : 'Kirish uchun yangi vaqtinchalik parolni saqlang'
              : language === 'ru' ? 'Сохраните учетные данные для входа' : "Kirish ma'lumotlarini saqlang"}
          </p>
        </div>

        <div className="space-y-4 bg-gray-50 rounded-xl p-4">
          {([
            ['login', language === 'ru' ? 'Логин' : 'Login', credentials.login, 'cred-login'],
            ['password', language === 'ru' ? 'Пароль' : 'Parol', credentials.password, 'cred-password'],
          ] as const).map(([key, label, value, field]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-sm text-gray-600">{label}</span>
              <div className="flex items-center gap-2 min-w-0">
                <code className="bg-white px-3 py-1.5 rounded-lg text-sm font-mono font-medium break-all min-w-0 flex-1">
                  {value}
                </code>
                <button
                  type="button"
                  onClick={() => onCopy(field, value)}
                  aria-label={language === 'ru' ? `Копировать ${key === 'login' ? 'логин' : 'пароль'}` : key === 'login' ? 'Loginni nusxalash' : 'Parolni nusxalash'}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-200 rounded-lg transition-colors shrink-0"
                >
                  {copiedField === field
                    ? <Check className="w-4 h-4 text-green-500" />
                    : <Copy className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
          <p className="text-sm text-yellow-800">
            {language === 'ru'
              ? 'Сохраните эти данные! Пароль показывается только один раз.'
              : "Bu ma'lumotlarni saqlang! Parol faqat bir marta ko'rsatiladi."}
          </p>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-gray-100 px-4 pt-3 sm:px-6 sm:pt-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <button onClick={onClose} className="btn-primary w-full min-h-[44px]">
          {language === 'ru' ? 'Готово' : 'Tayyor'}
        </button>
      </div>
    </Modal>
  );
}
