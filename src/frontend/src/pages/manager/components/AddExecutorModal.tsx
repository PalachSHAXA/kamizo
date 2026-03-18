import { useState } from 'react';
import { X, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { SPECIALIZATION_LABELS } from '../../../types';
import type { ExecutorSpecialization } from '../../../types';
import type { AddExecutorModalProps } from './types';

// Add Executor Modal
export function AddExecutorModal({
  onClose,
  onAdd
}: AddExecutorModalProps) {
  const { language } = useLanguageStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [specialization, setSpecialization] = useState<ExecutorSpecialization>('plumber');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
    setShowPassword(true);
  };

  const generateLogin = () => {
    const prefix = specialization.slice(0, 3);
    const num = Math.floor(Math.random() * 900) + 100;
    setLogin(`${prefix}${num}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !phone || !login || !password) {
      setError(language === 'ru' ? 'Заполните все поля' : 'Barcha maydonlarni to\'ldiring');
      return;
    }

    onAdd({ name, phone, login, password, specialization });
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-md mx-3 md:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Добавить исполнителя' : 'Ijrochi qo\'shish'}</h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО' : 'F.I.O.'}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === 'ru' ? 'Иванов Иван Иванович' : 'Ismingizni kiriting'}
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 XXX XX XX"
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Специализация' : 'Mutaxassislik'}</label>
            <select
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value as ExecutorSpecialization)}
              className="glass-input text-sm md:text-base"
            >
              {Object.entries(SPECIALIZATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Логин' : 'Login'}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="plumber001"
                className="glass-input flex-1 text-sm md:text-base"
                required
              />
              <button type="button" onClick={generateLogin} className="btn-secondary px-2 md:px-4 min-h-[44px] text-xs md:text-sm touch-manipulation active:scale-[0.98]">
                <span className="hidden sm:inline">{language === 'ru' ? 'Сгенерировать' : 'Yaratish'}</span>
                <span className="sm:hidden">{language === 'ru' ? 'Ген.' : 'Yar.'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Пароль' : 'Parol'}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="glass-input pr-10 text-sm md:text-base"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 touch-manipulation"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button type="button" onClick={generatePassword} className="btn-secondary px-2 md:px-4 min-h-[44px] text-xs md:text-sm touch-manipulation active:scale-[0.98]">
                <span className="hidden sm:inline">{language === 'ru' ? 'Сгенерировать' : 'Yaratish'}</span>
                <span className="sm:hidden">{language === 'ru' ? 'Ген.' : 'Yar.'}</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 md:p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs md:text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
