import { useState } from 'react';
import { X, Eye, EyeOff, AlertCircle, MapPin } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useToastStore } from '../../../stores/toastStore';
import { BRANCHES } from './types';
import type { AddResidentModalProps } from './types';

// Add Resident Modal
export function AddResidentModal({ onClose }: AddResidentModalProps) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('YS');
  const [building, setBuilding] = useState('');
  const [apartment, setApartment] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { addMockUser } = useAuthStore.getState();

  // Auto-generate credentials when building/apartment changes
  const generateCredentials = () => {
    if (!building || !apartment) {
      setError(language === 'ru' ? 'Сначала укажите дом и квартиру' : 'Avval uy va kvartirani ko\'rsating');
      return;
    }
    // Login: branch_building_apartment (e.g., YS_8A_23)
    const generatedLogin = `${branch}_${building}_${apartment}`.toUpperCase();
    setLogin(generatedLogin);
    // Password: BRANCH/BUILDING/APT (e.g., YS/8A/23)
    const generatedPassword = `${branch}/${building}/${apartment}`.toUpperCase();
    setPassword(generatedPassword);
    setShowPassword(true);
  };

  // Update login/password when branch/building/apartment changes if already generated
  const updateCredentialsIfNeeded = () => {
    if (login && password && building && apartment) {
      const expectedLogin = `${branch}_${building}_${apartment}`.toUpperCase();
      const expectedPassword = `${branch}/${building}/${apartment}`.toUpperCase();
      setLogin(expectedLogin);
      setPassword(expectedPassword);
    }
  };

  // Generate address from branch
  const getAddress = () => {
    const branchInfo = BRANCHES.find(b => b.code === branch);
    return branchInfo ? `${branchInfo.name}, ${language === 'ru' ? 'дом' : 'uy'} ${building}` : `${language === 'ru' ? 'Дом' : 'Uy'} ${building}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !phone || !building || !apartment || !login || !password) {
      setError(language === 'ru' ? 'Заполните все обязательные поля' : 'Barcha majburiy maydonlarni to\'ldiring');
      return;
    }

    const address = getAddress();

    addMockUser(login, password, {
      id: `resident_${Date.now()}`,
      phone,
      name,
      login,
      role: 'resident',
      address,
      apartment,
      branch,
      building
    });

    addToast('success', language === 'ru'
      ? `Житель добавлен! Логин: ${login}, Пароль: ${password}`
      : `Yashovchi qo'shildi! Login: ${login}, Parol: ${password}`
    );
    onClose();
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-md mx-3 md:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Добавить жителя' : 'Yashovchi qo\'shish'}</h2>
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

          {/* Location: Branch / Building / Apartment */}
          <div className="border-t pt-3 md:pt-4">
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-2">{language === 'ru' ? 'Расположение' : 'Joylashuv'}</label>
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 xl:gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Филиал' : 'Filial'}</label>
                <select
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    updateCredentialsIfNeeded();
                  }}
                  className="glass-input text-sm md:text-base py-2"
                >
                  {BRANCHES.map(b => (
                    <option key={b.code} value={b.code}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дом' : 'Uy'}</label>
                <input
                  type="text"
                  value={building}
                  onChange={(e) => {
                    setBuilding(e.target.value.toUpperCase());
                    updateCredentialsIfNeeded();
                  }}
                  placeholder="8A"
                  className="glass-input text-sm md:text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Кв.' : 'Kv.'}</label>
                <input
                  type="text"
                  value={apartment}
                  onChange={(e) => {
                    setApartment(e.target.value);
                    updateCredentialsIfNeeded();
                  }}
                  placeholder="23"
                  className="glass-input text-sm md:text-base"
                  required
                />
              </div>
            </div>
            {/* Preview address */}
            {building && (
              <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {getAddress()}, {language === 'ru' ? 'кв.' : 'kv.'} {apartment || '...'}
              </div>
            )}
          </div>

          {/* Login credentials */}
          <div className="border-t pt-3 md:pt-4">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-xs md:text-sm font-medium text-gray-700">{language === 'ru' ? 'Данные для входа' : 'Kirish ma\'lumotlari'}</span>
              <button type="button" onClick={generateCredentials} className="btn-secondary text-xs md:text-sm min-h-[44px] py-1 px-2 md:px-3 touch-manipulation active:scale-[0.98]">
                {language === 'ru' ? 'Сгенерировать' : 'Yaratish'}
              </button>
            </div>

            {/* Hint about password format */}
            <div className="mb-2 p-2 bg-primary-50 border border-primary-100 rounded-lg text-xs text-primary-600">
              {language === 'ru' ? 'Пароль будет в формате:' : 'Parol formatda bo\'ladi:'} <span className="font-mono font-bold">{language === 'ru' ? 'ФИЛИАЛ/ДОМ/КВАРТИРА' : 'FILIAL/UY/KVARTIRA'}</span>
              <br />
              {language === 'ru' ? 'Например:' : 'Masalan:'} <span className="font-mono">YS/8A/23</span>
            </div>

            <div className="space-y-2 md:space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Логин' : 'Login'}</label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="YS_8A_23"
                  className="glass-input text-sm md:text-base font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Пароль' : 'Parol'}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="YS/8A/23"
                    className="glass-input pr-10 text-sm md:text-base font-mono"
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
              </div>
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
