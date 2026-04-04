import { FileText, Upload, X } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { useToastStore } from '../../../stores/toastStore';
import {
  Tenant, TenantFormData,
  BASE_DOMAIN, AVAILABLE_FEATURES, PLAN_FEATURES,
} from './types';

interface TenantFormModalProps {
  editingTenant: Tenant | null;
  formData: TenantFormData;
  setFormData: React.Dispatch<React.SetStateAction<TenantFormData>>;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function TenantFormModal({
  editingTenant, formData, setFormData, error,
  onSubmit, onClose,
}: TenantFormModalProps) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);

  const handleFeatureToggle = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature],
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      addToast('warning', 'Максимальный размер логотипа: 2 МБ');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({ ...prev, logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleContractTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      addToast('warning', 'Максимальный размер шаблона: 5 МБ');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({ ...prev, contract_template: reader.result as string, contract_template_name: file.name }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
        <div className="p-4 sm:p-6 border-b">
          <h2 className="text-lg sm:text-xl font-bold">
            {editingTenant ? 'Редактировать УК' : 'Создать УК'}
          </h2>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Название *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slug *</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => {
                  const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  setFormData({
                    ...formData,
                    slug,
                    url: `https://${slug}.${BASE_DOMAIN}`,
                    admin_url: `https://${slug}.${BASE_DOMAIN}/admin`
                  });
                }}
                className="w-full px-3 py-2 border rounded-lg"
                pattern="[a-z0-9-]+"
                placeholder="my-uk"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">URL (генерируется автоматически)</label>
            <input
              type="text"
              value={formData.url}
              className="w-full px-3 py-2 border rounded-lg bg-gray-50"
              readOnly
            />
            <p className="text-xs text-gray-500 mt-1">
              Домен будет доступен по адресу: {formData.slug ? `${formData.slug}.${BASE_DOMAIN}` : '(введите slug)'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Логотип</label>
            <div className="flex items-center gap-4">
              {formData.logo ? (
                <div className="relative">
                  <img
                    src={formData.logo}
                    alt="Logo"
                    className="w-16 h-16 rounded-lg object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, logo: '' }))}
                    className="absolute -top-2 -right-2 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                </label>
              )}
              <div className="text-xs text-gray-500">
                PNG, JPG до 2 МБ
              </div>
            </div>
          </div>

          {/* Contract Template Upload */}
          <div>
            <label className="block text-sm font-medium mb-1">Шаблон договора (.docx)</label>
            <div className="flex items-center gap-3">
              {formData.contract_template ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700">{formData.contract_template_name || 'Шаблон загружен'}</span>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, contract_template: '', contract_template_name: '' }))}
                    className="p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors">
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Загрузить шаблон</span>
                  <input
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleContractTemplateChange}
                    className="hidden"
                  />
                </label>
              )}
              <div className="text-xs text-gray-500">
                DOCX до 5 МБ
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Основной цвет</label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Вторичный цвет</label>
              <input
                type="color"
                value={formData.color_secondary}
                onChange={(e) => setFormData({ ...formData, color_secondary: e.target.value })}
                className="w-full h-10 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Тариф' : 'Tarif'}</label>
              <select
                value={formData.plan}
                onChange={(e) => {
                  const plan = e.target.value as 'basic' | 'pro' | 'enterprise';
                  setFormData({ ...formData, plan, features: PLAN_FEATURES[plan] || PLAN_FEATURES.basic });
                }}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Email администратора' : 'Adminstrator emali'}</label>
              <input
                type="email"
                value={formData.admin_email}
                onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Телефон администратора' : 'Administrator telefoni'}</label>
              <input
                type="tel"
                value={formData.admin_phone}
                onChange={(e) => setFormData({ ...formData, admin_phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                maxLength={13}
              />
            </div>
          </div>

          {/* Director credentials - only for creating new tenant */}
          {!editingTenant && (
            <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg space-y-3">
              <label className="block text-sm font-semibold text-primary-800">Первый директор (будет создан автоматически)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-primary-700 mb-1">ФИО *</label>
                  <input
                    type="text"
                    value={formData.director_name}
                    onChange={(e) => setFormData({ ...formData, director_name: e.target.value })}
                    className="w-full px-3 py-2 border border-primary-200 rounded-lg text-sm"
                    placeholder="Иванов И.И."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-primary-700 mb-1">Логин *</label>
                  <input
                    type="text"
                    value={formData.director_login}
                    onChange={(e) => setFormData({ ...formData, director_login: e.target.value })}
                    className="w-full px-3 py-2 border border-primary-200 rounded-lg text-sm"
                    placeholder="director"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-primary-700 mb-1">Пароль *</label>
                  <input
                    type="text"
                    value={formData.director_password}
                    onChange={(e) => setFormData({ ...formData, director_password: e.target.value })}
                    className="w-full px-3 py-2 border border-primary-200 rounded-lg text-sm"
                    placeholder="password123"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">{language === 'ru' ? 'Доступные функции' : 'Mavjud imkoniyatlar'}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_FEATURES.map((feature) => (
                <label key={feature.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.features.includes(feature.value)}
                    onChange={() => handleFeatureToggle(feature.value)}
                    className="rounded"
                  />
                  <span className="text-sm">{language === 'ru' ? feature.labelRu : feature.labelUz}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
            >
              {editingTenant ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
