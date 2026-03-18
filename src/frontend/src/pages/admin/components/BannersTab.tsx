import { useState } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, X, Image } from 'lucide-react';
import { apiRequest } from '../../../services/api';
import { useToastStore } from '../../../stores/toastStore';

interface BannersTabProps {
  banners: any[];
  isLoadingBanners: boolean;
  loadBanners: () => void;
}

export function BannersTab({ banners, isLoadingBanners, loadBanners }: BannersTabProps) {
  const addToast = useToastStore(s => s.addToast);

  const [showBannerModal, setShowBannerModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<any>(null);
  const [bannerForm, setBannerForm] = useState({ title: '', description: '', image_url: '', link_url: '', placement: 'marketplace' as string, is_active: true });

  const handleSaveBanner = async () => {
    if (!bannerForm.title) return;
    try {
      if (editingBanner) {
        await apiRequest(`/api/super-admin/banners/${editingBanner.id}`, { method: 'PATCH', body: JSON.stringify(bannerForm) });
      } else {
        await apiRequest('/api/super-admin/banners', { method: 'POST', body: JSON.stringify(bannerForm) });
      }
      setShowBannerModal(false);
      setEditingBanner(null);
      setBannerForm({ title: '', description: '', image_url: '', link_url: '', placement: 'marketplace', is_active: true });
      loadBanners();
    } catch (err: any) {
      addToast('error', err.message || 'Ошибка');
    }
  };

  const handleToggleBanner = async (banner: any) => {
    try {
      await apiRequest(`/api/super-admin/banners/${banner.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !banner.is_active }) });
      loadBanners();
    } catch (err: any) {
      addToast('error', err.message || 'Ошибка');
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Удалить баннер?')) return;
    try {
      await apiRequest(`/api/super-admin/banners/${id}`, { method: 'DELETE' });
      loadBanners();
    } catch (err: any) {
      addToast('error', err.message || 'Ошибка');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Баннеры</h2>
          <p className="text-sm text-gray-500">Баннеры для маркетплейса и полезных контактов</p>
        </div>
        <button
          onClick={() => { setEditingBanner(null); setBannerForm({ title: '', description: '', image_url: '', link_url: '', placement: 'marketplace', is_active: true }); setShowBannerModal(true); }}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Добавить баннер
        </button>
      </div>

      {isLoadingBanners ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Image className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Баннеров пока нет</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map((banner: any) => (
            <div key={banner.id} className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${banner.is_active ? 'border-green-200' : 'border-gray-200 opacity-60'}`}>
              {banner.image_url && (
                <img src={banner.image_url} alt={banner.title} className="w-full h-40 object-cover" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{banner.title}</h3>
                    {banner.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{banner.description}</p>}
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0 ${
                    banner.placement === 'marketplace' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {banner.placement === 'marketplace' ? 'Маркет для дома' : 'Полезные контакты'}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => handleToggleBanner(banner)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${banner.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${banner.is_active ? 'left-[26px]' : 'left-0.5'}`} />
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingBanner(banner);
                        setBannerForm({
                          title: banner.title || '',
                          description: banner.description || '',
                          image_url: banner.image_url || '',
                          link_url: banner.link_url || '',
                          placement: banner.placement || 'marketplace',
                          is_active: Boolean(banner.is_active),
                        });
                        setShowBannerModal(true);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => handleDeleteBanner(banner.id)} className="p-2 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Banner Modal */}
      {showBannerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingBanner ? 'Редактировать баннер' : 'Новый баннер'}</h2>
              <button onClick={() => { setShowBannerModal(false); setEditingBanner(null); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Название *</label>
              <input type="text" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Скидки для резидентов" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Описание</label>
              <textarea value={bannerForm.description} onChange={(e) => setBannerForm({ ...bannerForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={2} placeholder="Особые условия у проверенных партнёров" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">URL изображения</label>
              <input type="text" value={bannerForm.image_url} onChange={(e) => setBannerForm({ ...bannerForm, image_url: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="https://..." />
              {bannerForm.image_url && (
                <img src={bannerForm.image_url} alt="Preview" className="mt-2 h-24 rounded-lg object-cover" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Ссылка (при нажатии)</label>
              <input type="text" value={bannerForm.link_url} onChange={(e) => setBannerForm({ ...bannerForm, link_url: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="https://..." />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Размещение</label>
              <div className="flex gap-2">
                {[
                  { value: 'marketplace', label: 'Маркет для дома' },
                  { value: 'useful-contacts', label: 'Полезные контакты' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBannerForm({ ...bannerForm, placement: opt.value })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      bannerForm.placement === opt.value ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Активен</label>
              <button
                type="button"
                onClick={() => setBannerForm({ ...bannerForm, is_active: !bannerForm.is_active })}
                className={`relative w-12 h-6 rounded-full transition-colors ${bannerForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${bannerForm.is_active ? 'left-[26px]' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowBannerModal(false); setEditingBanner(null); }} className="flex-1 px-4 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">Отмена</button>
              <button onClick={handleSaveBanner} className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium">{editingBanner ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
