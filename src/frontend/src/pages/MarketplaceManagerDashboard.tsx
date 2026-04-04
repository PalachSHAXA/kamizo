import { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Edit2, Trash2, Search,
  X, TrendingUp, AlertTriangle, BarChart3, ImagePlus, Upload, Link
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { apiRequest } from '../services/api';
import { useToastStore } from '../stores/toastStore';

// Types for API responses (snake_case from backend)
interface MarketplaceCategoryAPI {
  id: string;
  name_ru: string;
  name_uz: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface MarketplaceProductAPI {
  id: string;
  category_id: string;
  name_ru: string;
  name_uz: string;
  description_ru?: string;
  description_uz?: string;
  price: number;
  old_price?: number;
  unit: string;
  stock_quantity: number;
  image_url?: string;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  cat_groceries: '🛒',
  cat_dairy: '🥛',
  cat_meat: '🥩',
  cat_bakery: '🍞',
  cat_fruits: '🍎',
  cat_beverages: '🥤',
  cat_household: '🧹',
  cat_personal: '🧴',
  cat_baby: '👶',
  cat_pets: '🐾',
  cat_frozen: '❄️',
  cat_snacks: '🍿',
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  cat_groceries: 'from-amber-400 to-orange-500',
  cat_beverages: 'from-cyan-400 to-blue-500',
  cat_household: 'from-violet-400 to-purple-500',
  cat_personal: 'from-pink-400 to-rose-500',
};

const PRODUCT_EMOJI: Record<string, string> = {
  'соль': '🧂', 'сахар': '🍬', 'масло': '🫒', 'рис': '🍚', 'макарон': '🍝',
  'мука': '🌾', 'чай': '🍵', 'вода': '💧', 'сок': '🍊', 'молоко': '🥛',
  'шампунь': '🧴', 'гель': '🚿', 'мыло': '🧼', 'зубн': '🪥', 'дезодорант': '✨',
  'бумаг': '🧻', 'посуд': '🍽️', 'стирал': '👕', 'пол': '🧹', 'стёкол': '🪟',
  'мусор': '🗑️', 'губк': '🧽', 'перчатк': '🧤', 'смесител': '🚰', 'подводк': '🔧',
  'выключател': '⚡', 'ламп': '💡',
};

function getProductEmoji(name: string, categoryId: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(PRODUCT_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return CATEGORY_ICONS[categoryId] || '📦';
}

function ProductCardPlaceholder({ name, categoryId, size = 'sm' }: { name: string; categoryId: string; size?: 'xs' | 'sm' | 'md' }) {
  const gradient = CATEGORY_GRADIENTS[categoryId] || 'from-gray-400 to-gray-500';
  const emoji = getProductEmoji(name, categoryId);
  const emojiSize = { xs: 'text-lg', sm: 'text-xl', md: 'text-2xl' }[size];
  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, white 0%, transparent 50%)' }} />
      <span className={`${emojiSize} drop-shadow-md relative z-10`}>{emoji}</span>
    </div>
  );
}

export function MarketplaceManagerDashboard() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);

  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'stock'>('products');
  const [products, setProducts] = useState<MarketplaceProductAPI[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategoryAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarketplaceProductAPI | null>(null);
  const [productForm, setProductForm] = useState({
    category_id: '',
    name_ru: '',
    name_uz: '',
    description_ru: '',
    description_uz: '',
    price: '',
    old_price: '',
    unit: 'шт',
    stock_quantity: '',
    image_url: '',
    is_featured: false,
  });

  // Stock update modal
  const [showStockModal, setShowStockModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<MarketplaceProductAPI | null>(null);
  const [stockQuantity, setStockQuantity] = useState('');

  // Image upload
  const [imageMode, setImageMode] = useState<'url' | 'file'>('url');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Handle image file upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      addToast('warning', language === 'ru'
        ? 'Неверный формат файла. Разрешены: JPEG, PNG, GIF, WEBP'
        : 'Noto\'g\'ri fayl formati. Ruxsat etilgan: JPEG, PNG, GIF, WEBP');
      return;
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      addToast('warning', language === 'ru'
        ? 'Файл слишком большой. Максимум: 5МБ'
        : 'Fayl juda katta. Maksimum: 5MB');
      return;
    }

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append('image', file);

      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/marketplace/admin/upload-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      setProductForm({ ...productForm, image_url: result.image_url });
    } catch (error) {
      console.error('Image upload error:', error);
      addToast('error', language === 'ru'
        ? 'Ошибка загрузки изображения'
        : 'Rasm yuklashda xato');
    } finally {
      setUploadingImage(false);
    }
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [productsRes, categoriesRes] = await Promise.all([
        apiRequest<{ products: MarketplaceProductAPI[] }>('/api/marketplace/admin/products'),
        apiRequest<{ categories: MarketplaceCategoryAPI[] }>('/api/marketplace/categories'),
      ]);

      setProducts(productsRes?.products || []);
      setCategories(categoriesRes?.categories || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save product
  const saveProduct = async () => {
    try {
      const data = {
        ...productForm,
        price: parseFloat(productForm.price),
        old_price: productForm.old_price ? parseFloat(productForm.old_price) : null,
        stock_quantity: parseInt(productForm.stock_quantity) || 0,
        image_url: productForm.image_url || null,
      };

      if (editingProduct) {
        await apiRequest(`/api/marketplace/admin/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } else {
        await apiRequest('/api/marketplace/admin/products', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      }

      await fetchData();
      setShowProductModal(false);
      resetProductForm();
    } catch (error) {
      console.error('Error saving product:', error);
    }
  };

  // Update stock
  const updateStock = async () => {
    if (!stockProduct) return;
    try {
      await apiRequest(`/api/marketplace/admin/products/${stockProduct.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stock_quantity: parseInt(stockQuantity) || 0 }),
      });
      await fetchData();
      setShowStockModal(false);
      setStockProduct(null);
      setStockQuantity('');
    } catch (error) {
      console.error('Error updating stock:', error);
    }
  };

  // Delete product with confirmation state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteProduct = async (productId: string) => {
    setPendingDeleteId(productId);
  };
  const confirmDeleteProduct = async () => {
    if (!pendingDeleteId) return;
    try {
      await apiRequest(`/api/marketplace/admin/products/${pendingDeleteId}`, { method: 'DELETE' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting product:', error);
    } finally {
      setPendingDeleteId(null);
    }
    setDeleteConfirmId(null);
  };

  // Edit product
  const editProduct = (product: MarketplaceProductAPI) => {
    setEditingProduct(product);
    // Set image mode based on whether it's a data URL or external URL
    setImageMode(product.image_url?.startsWith('data:') ? 'file' : 'url');
    setProductForm({
      category_id: product.category_id,
      name_ru: product.name_ru,
      name_uz: product.name_uz,
      description_ru: product.description_ru || '',
      description_uz: product.description_uz || '',
      price: product.price.toString(),
      old_price: product.old_price?.toString() || '',
      unit: product.unit || 'шт',
      stock_quantity: product.stock_quantity?.toString() || '0',
      image_url: product.image_url || '',
      is_featured: product.is_featured || false,
    });
    setShowProductModal(true);
  };

  const resetProductForm = () => {
    setEditingProduct(null);
    setImageMode('url');
    setProductForm({
      category_id: '',
      name_ru: '',
      name_uz: '',
      description_ru: '',
      description_uz: '',
      price: '',
      old_price: '',
      unit: 'шт',
      stock_quantity: '',
      image_url: '',
      is_featured: false,
    });
  };

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    const matchesSearch = !searchQuery ||
      product.name_ru.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.name_uz.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Low stock products (less than 10)
  const lowStockProducts = products.filter(p => p.stock_quantity < 10 && p.stock_quantity > 0);
  const outOfStockProducts = products.filter(p => p.stock_quantity === 0);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU').format(price) + ' сум';
  };

  const tabs = [
    { id: 'products' as const, label: language === 'ru' ? 'Товары' : 'Mahsulotlar', icon: Package, count: products.length },
    { id: 'stock' as const, label: language === 'ru' ? 'Склад' : 'Ombor', icon: BarChart3, count: lowStockProducts.length + outOfStockProducts.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delete confirmation modal */}
      {pendingDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold mb-2">{language === 'ru' ? 'Удалить товар?' : 'Mahsulotni o\'chirmoqchimisiz?'}</h3>
            <p className="text-sm text-gray-500 mb-4">{language === 'ru' ? 'Это действие нельзя отменить' : 'Bu amalni qaytarib bo\'lmaydi'}</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingDeleteId(null)} className="btn-secondary flex-1 min-h-[44px]">{language === 'ru' ? 'Отмена' : 'Bekor'}</button>
              <button onClick={confirmDeleteProduct} className="flex-1 min-h-[44px] bg-red-500 text-white rounded-xl font-semibold active:scale-95">{language === 'ru' ? 'Удалить' : 'O\'chirish'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">
          {language === 'ru' ? 'Управление товарами' : 'Mahsulotlarni boshqarish'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {language === 'ru' ? 'Добро пожаловать,' : 'Xush kelibsiz,'} {user?.name}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 sm:p-4">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Package className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{products.length}</p>
              <p className="text-xs text-gray-500">{language === 'ru' ? 'Товаров' : 'Mahsulot'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{lowStockProducts.length}</p>
              <p className="text-xs text-gray-500">{language === 'ru' ? 'Мало' : 'Kam'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 rounded-lg">
              <TrendingUp className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{outOfStockProducts.length}</p>
              <p className="text-xs text-gray-500">{language === 'ru' ? 'Нет' : 'Yo\'q'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="flex overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-0 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-sm font-medium truncate">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  tab.id === 'stock' ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-24">
        {/* Products Tab */}
        {activeTab === 'products' && (
          <div>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder={language === 'ru' ? 'Поиск товаров...' : 'Mahsulot qidirish...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={() => {
                  resetProductForm();
                  setShowProductModal(true);
                }}
                className="px-4 py-2.5 min-h-[44px] touch-manipulation active:scale-95 bg-primary-600 text-white rounded-lg sm:rounded-xl font-medium flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Category filter */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
                  categoryFilter === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {language === 'ru' ? 'Все' : 'Hammasi'}
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap flex items-center gap-1 ${
                    categoryFilter === cat.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span>{CATEGORY_ICONS[cat.id] || '📦'}</span>
                  <span>{language === 'ru' ? cat.name_ru : cat.name_uz}</span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredProducts.map(product => (
                <div key={product.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ProductCardPlaceholder name={language === 'ru' ? product.name_ru : product.name_uz} categoryId={product.category_id} size="sm" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 line-clamp-1">
                        {language === 'ru' ? product.name_ru : product.name_uz}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {categories.find(c => c.id === product.category_id)?.[language === 'ru' ? 'name_ru' : 'name_uz']}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-bold text-primary-600">{formatPrice(product.price)}</span>
                        {product.old_price && (
                          <span className="text-xs text-gray-400 line-through">{formatPrice(product.old_price)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          product.stock_quantity > 10
                            ? 'bg-green-100 text-green-700'
                            : product.stock_quantity > 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {product.stock_quantity} {product.unit}
                        </span>
                        {product.is_featured && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            {language === 'ru' ? 'Хит' : 'Hit'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => editProduct(product)}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(product.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredProducts.length === 0 && (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {language === 'ru' ? 'Товаров нет' : 'Mahsulotlar yo\'q'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stock Tab */}
        {activeTab === 'stock' && (
          <div className="space-y-4">
            {/* Out of stock */}
            {outOfStockProducts.length > 0 && (
              <div>
                <h3 className="font-bold text-red-600 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  {language === 'ru' ? 'Нет в наличии' : 'Mavjud emas'}
                </h3>
                <div className="space-y-2">
                  {outOfStockProducts.map(product => (
                    <div key={product.id} className="bg-red-50 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{CATEGORY_ICONS[product.category_id] || '📦'}</span>
                        <div>
                          <p className="font-medium text-gray-900">
                            {language === 'ru' ? product.name_ru : product.name_uz}
                          </p>
                          <p className="text-sm text-red-600">0 {product.unit}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setStockProduct(product);
                          setStockQuantity(product.stock_quantity.toString());
                          setShowStockModal(true);
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium"
                      >
                        {language === 'ru' ? 'Пополнить' : 'To\'ldirish'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Low stock */}
            {lowStockProducts.length > 0 && (
              <div>
                <h3 className="font-bold text-yellow-600 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  {language === 'ru' ? 'Заканчивается' : 'Tugab qolmoqda'}
                </h3>
                <div className="space-y-2">
                  {lowStockProducts.map(product => (
                    <div key={product.id} className="bg-yellow-50 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{CATEGORY_ICONS[product.category_id] || '📦'}</span>
                        <div>
                          <p className="font-medium text-gray-900">
                            {language === 'ru' ? product.name_ru : product.name_uz}
                          </p>
                          <p className="text-sm text-yellow-600">{product.stock_quantity} {product.unit}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setStockProduct(product);
                          setStockQuantity(product.stock_quantity.toString());
                          setShowStockModal(true);
                        }}
                        className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg text-sm font-medium"
                      >
                        {language === 'ru' ? 'Пополнить' : 'To\'ldirish'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All products stock */}
            <div>
              <h3 className="font-bold text-gray-900 mb-3">
                {language === 'ru' ? 'Все товары' : 'Barcha mahsulotlar'}
              </h3>
              <div className="space-y-2">
                {products.filter(p => p.stock_quantity >= 10).map(product => (
                  <div key={product.id} className="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{CATEGORY_ICONS[product.category_id] || '📦'}</span>
                      <div>
                        <p className="font-medium text-gray-900">
                          {language === 'ru' ? product.name_ru : product.name_uz}
                        </p>
                        <p className="text-sm text-green-600">{product.stock_quantity} {product.unit}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setStockProduct(product);
                        setStockQuantity(product.stock_quantity.toString());
                        setShowStockModal(true);
                      }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
                    >
                      {language === 'ru' ? 'Изменить' : 'O\'zgartirish'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {products.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  {language === 'ru' ? 'Нет товаров' : 'Mahsulotlar yo\'q'}
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 border-b flex items-center justify-between z-10">
              <h2 className="font-bold text-lg">
                {editingProduct
                  ? (language === 'ru' ? 'Редактировать товар' : 'Mahsulotni tahrirlash')
                  : (language === 'ru' ? 'Добавить товар' : 'Mahsulot qo\'shish')}
              </h2>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Категория' : 'Kategoriya'} *
                </label>
                <select
                  value={productForm.category_id}
                  onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                  className="w-full p-3 border rounded-xl"
                  required
                >
                  <option value="">{language === 'ru' ? 'Выберите категорию' : 'Kategoriya tanlang'}</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {CATEGORY_ICONS[cat.id] || '📦'} {language === 'ru' ? cat.name_ru : cat.name_uz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <ImagePlus className="w-4 h-4 inline mr-1" />
                  {language === 'ru' ? 'Изображение товара' : 'Mahsulot rasmi'}
                </label>

                {/* Mode toggle */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setImageMode('file')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border transition-colors ${
                      imageMode === 'file'
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">{language === 'ru' ? 'Загрузить файл' : 'Fayl yuklash'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode('url')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border transition-colors ${
                      imageMode === 'url'
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Link className="w-4 h-4" />
                    <span className="text-sm">{language === 'ru' ? 'URL ссылка' : 'URL havola'}</span>
                  </button>
                </div>

                {/* File upload */}
                {imageMode === 'file' && (
                  <div className="space-y-2">
                    <label className="block w-full">
                      <div className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                        uploadingImage
                          ? 'border-primary-300 bg-primary-50'
                          : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50'
                      }`}>
                        {uploadingImage ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                            <span className="text-sm text-primary-600">
                              {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Upload className="w-8 h-8 text-gray-400" />
                            <span className="text-sm text-gray-600">
                              {language === 'ru' ? 'Нажмите для выбора файла' : 'Fayl tanlash uchun bosing'}
                            </span>
                            <span className="text-xs text-gray-400">
                              JPEG, PNG, GIF, WEBP (max 5MB)
                            </span>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploadingImage}
                      />
                    </label>
                  </div>
                )}

                {/* URL input */}
                {imageMode === 'url' && (
                  <input
                    type="url"
                    value={productForm.image_url}
                    onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full p-3 border rounded-xl"
                  />
                )}

                {/* Image preview */}
                {productForm.image_url && (
                  <div className="mt-3 relative inline-block">
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 border">
                      <img src={productForm.image_url} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setProductForm({ ...productForm, image_url: '' })}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Name RU */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Название (RU)' : 'Nomi (RU)'} *
                </label>
                <input
                  type="text"
                  value={productForm.name_ru}
                  onChange={(e) => setProductForm({ ...productForm, name_ru: e.target.value })}
                  className="w-full p-3 border rounded-xl"
                  required
                />
              </div>

              {/* Name UZ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Название (UZ)' : 'Nomi (UZ)'} *
                </label>
                <input
                  type="text"
                  value={productForm.name_uz}
                  onChange={(e) => setProductForm({ ...productForm, name_uz: e.target.value })}
                  className="w-full p-3 border rounded-xl"
                  required
                />
              </div>

              {/* Description RU */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Описание (RU)' : 'Tavsif (RU)'}
                </label>
                <textarea
                  value={productForm.description_ru}
                  onChange={(e) => setProductForm({ ...productForm, description_ru: e.target.value })}
                  className="w-full p-3 border rounded-xl resize-none"
                  rows={2}
                />
              </div>

              {/* Description UZ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Описание (UZ)' : 'Tavsif (UZ)'}
                </label>
                <textarea
                  value={productForm.description_uz}
                  onChange={(e) => setProductForm({ ...productForm, description_uz: e.target.value })}
                  className="w-full p-3 border rounded-xl resize-none"
                  rows={2}
                />
              </div>

              {/* Price & Old Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Цена (сум)' : 'Narxi (so\'m)'} *
                  </label>
                  <input
                    type="number"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    className="w-full p-3 border rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Старая цена' : 'Eski narx'}
                  </label>
                  <input
                    type="number"
                    value={productForm.old_price}
                    onChange={(e) => setProductForm({ ...productForm, old_price: e.target.value })}
                    className="w-full p-3 border rounded-xl"
                  />
                </div>
              </div>

              {/* Unit & Stock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Единица' : 'Birlik'}
                  </label>
                  <select
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    className="w-full p-3 border rounded-xl"
                  >
                    <option value="шт">шт</option>
                    <option value="кг">кг</option>
                    <option value="л">л</option>
                    <option value="уп">уп</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'На складе' : 'Omborda'}
                  </label>
                  <input
                    type="number"
                    value={productForm.stock_quantity}
                    onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })}
                    className="w-full p-3 border rounded-xl"
                  />
                </div>
              </div>

              {/* Featured */}
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={productForm.is_featured}
                  onChange={(e) => setProductForm({ ...productForm, is_featured: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300"
                />
                <span className="text-gray-700">
                  {language === 'ru' ? 'Хит продаж (показывать первым)' : 'Hit mahsulot (birinchi ko\'rsatish)'}
                </span>
              </label>

              {/* Save Button */}
              <button
                onClick={saveProduct}
                disabled={!productForm.category_id || !productForm.name_ru || !productForm.name_uz || !productForm.price}
                className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {editingProduct
                  ? (language === 'ru' ? 'Сохранить изменения' : 'O\'zgarishlarni saqlash')
                  : (language === 'ru' ? 'Добавить товар' : 'Mahsulot qo\'shish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Update Modal */}
      {showStockModal && stockProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">
                {language === 'ru' ? 'Обновить склад' : 'Omborni yangilash'}
              </h2>
              <button
                onClick={() => {
                  setShowStockModal(false);
                  setStockProduct(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <span className="text-2xl">{CATEGORY_ICONS[stockProduct.category_id] || '📦'}</span>
                <div>
                  <p className="font-medium text-gray-900">
                    {language === 'ru' ? stockProduct.name_ru : stockProduct.name_uz}
                  </p>
                  <p className="text-sm text-gray-500">
                    {language === 'ru' ? 'Текущий остаток:' : 'Joriy qoldiq:'} {stockProduct.stock_quantity} {stockProduct.unit}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Новое количество' : 'Yangi miqdor'}
                </label>
                <input
                  type="number"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="w-full p-3 border rounded-xl text-center text-xl font-bold"
                  min="0"
                />
              </div>

              <button
                onClick={updateStock}
                className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium"
              >
                {language === 'ru' ? 'Сохранить' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="font-semibold text-gray-800 mb-1 text-lg">
              {language === 'ru' ? 'Удалить товар?' : "Mahsulotni o'chirasizmi?"}
            </p>
            <p className="text-sm text-gray-500 mb-5">
              {language === 'ru' ? 'Это действие нельзя отменить.' : "Bu amalni bekor qilib bo'lmaydi."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 touch-manipulation">
                {language === 'ru' ? 'Отмена' : 'Bekor'}
              </button>
              <button onClick={() => deleteProduct(deleteConfirmId)}
                className="flex-1 py-2.5 min-h-[44px] bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 touch-manipulation">
                {language === 'ru' ? 'Удалить' : "O'chirish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
