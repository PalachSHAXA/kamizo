import { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Edit2, Trash2, Search, Filter,
  X, TrendingUp, AlertTriangle, BarChart3, ImagePlus
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { apiRequest } from '../services/api';

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

export function MarketplaceManagerDashboard() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

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
  const [stockProduct, setStockProduct] = useState<MarketplaceProductAPI | null>(null);
  const [stockQuantity, setStockQuantity] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [productsRes, categoriesRes] = await Promise.all([
        apiRequest<{ products: MarketplaceProductAPI[] }>('/api/marketplace/admin/products'),
        apiRequest<MarketplaceCategoryAPI[]>('/api/marketplace/categories'),
      ]);

      setProducts(productsRes?.products || []);
      setCategories(categoriesRes || []);
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

  // Delete product
  const deleteProduct = async (productId: string) => {
    if (!confirm(language === 'ru' ? 'Удалить товар?' : 'Mahsulotni o\'chirmoqchimisiz?')) return;
    try {
      await apiRequest(`/api/marketplace/admin/products/${productId}`, { method: 'DELETE' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  // Edit product
  const editProduct = (product: MarketplaceProductAPI) => {
    setEditingProduct(product);
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
    { id: 'categories' as const, label: language === 'ru' ? 'Категории' : 'Kategoriyalar', icon: Filter },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
      <div className="grid grid-cols-3 gap-3 p-4">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Package className="w-4 h-4 text-orange-600" />
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
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-sm font-medium truncate">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  tab.id === 'stock' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-20">
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                onClick={() => {
                  resetProductForm();
                  setShowProductModal(true);
                }}
                className="px-4 py-2.5 bg-orange-600 text-white rounded-xl font-medium flex items-center gap-2"
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
                    ? 'bg-orange-600 text-white'
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
                      ? 'bg-orange-600 text-white'
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
                        <span className="text-2xl">{CATEGORY_ICONS[product.category_id] || '📦'}</span>
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
                        <span className="font-bold text-orange-600">{formatPrice(product.price)}</span>
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
                        className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteProduct(product.id)}
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

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="space-y-3">
            {categories.map(category => (
              <div key={category.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4">
                <span className="text-3xl">{CATEGORY_ICONS[category.id] || '📦'}</span>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">
                    {language === 'ru' ? category.name_ru : category.name_uz}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {products.filter(p => p.category_id === category.id).length} {language === 'ru' ? 'товаров' : 'mahsulot'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  category.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {category.is_active ? (language === 'ru' ? 'Активна' : 'Faol') : (language === 'ru' ? 'Неактивна' : 'Nofaol')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
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

              {/* Image URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <ImagePlus className="w-4 h-4 inline mr-1" />
                  {language === 'ru' ? 'URL изображения' : 'Rasm URL'}
                </label>
                <input
                  type="url"
                  value={productForm.image_url}
                  onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full p-3 border rounded-xl"
                />
                {productForm.image_url && (
                  <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    <img src={productForm.image_url} alt="Preview" className="w-full h-full object-cover" />
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
                className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl">
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
                className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium"
              >
                {language === 'ru' ? 'Сохранить' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
