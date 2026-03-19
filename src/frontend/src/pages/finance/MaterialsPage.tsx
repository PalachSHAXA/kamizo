import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Plus, MinusCircle, Filter, AlertTriangle } from 'lucide-react';
import { useFinanceStore } from '../../stores/financeStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';

const UNITS = ['шт', 'м', 'кг', 'л', 'упак'] as const;

export default function MaterialsPage() {
  const language = useLanguageStore((s) => s.language);
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const materials = useFinanceStore((s) => s.materials);
  const materialsLoading = useFinanceStore((s) => s.materialsLoading);
  const fetchMaterials = useFinanceStore((s) => s.fetchMaterials);
  const createMaterial = useFinanceStore((s) => s.createMaterial);
  const useMaterial = useFinanceStore((s) => s.useMaterial);
  const filters = useFinanceStore((s) => s.filters);
  const setFilters = useFinanceStore((s) => s.setFilters);

  const buildings = useBuildingStore((s) => s.buildings);
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);

  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffItem, setWriteOffItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Add form state
  const [addForm, setAddForm] = useState({
    name: '',
    unit: 'шт',
    quantity: '',
    price_per_unit: '',
    min_quantity: '',
    building_id: '',
  });

  // Write-off form state
  const [writeOffForm, setWriteOffForm] = useState({
    quantity: '',
    description: '',
  });
  const [writeOffError, setWriteOffError] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadError(false);
        await Promise.all([fetchBuildings(), fetchMaterials()]);
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, [fetchBuildings, fetchMaterials]);

  const handleApplyFilter = useCallback(() => {
    setFilters({ building_id: selectedBuilding || undefined });
    fetchMaterials(selectedBuilding || undefined);
  }, [selectedBuilding, setFilters, fetchMaterials]);

  const handleAddSubmit = useCallback(async () => {
    if (!addForm.name || !addForm.unit || !addForm.building_id) return;
    setSubmitting(true);
    try {
      await createMaterial({
        name: addForm.name,
        unit: addForm.unit,
        quantity: Number(addForm.quantity) || 0,
        price_per_unit: Number(addForm.price_per_unit) || 0,
        min_quantity: Number(addForm.min_quantity) || 0,
        building_id: addForm.building_id,
      });
      setAddOpen(false);
      setAddForm({ name: '', unit: 'шт', quantity: '', price_per_unit: '', min_quantity: '', building_id: '' });
      fetchMaterials(selectedBuilding || undefined);
    } finally {
      setSubmitting(false);
    }
  }, [addForm, createMaterial, fetchMaterials, selectedBuilding]);

  const openWriteOff = useCallback((item: any) => {
    setWriteOffItem(item);
    setWriteOffForm({ quantity: '', description: '' });
    setWriteOffError('');
    setWriteOffOpen(true);
  }, []);

  const handleWriteOffSubmit = useCallback(async () => {
    if (!writeOffItem) return;
    const qty = Number(writeOffForm.quantity);
    if (!qty || qty <= 0) {
      setWriteOffError(t('Введите количество', 'Miqdorni kiriting'));
      return;
    }
    if (qty > writeOffItem.quantity) {
      setWriteOffError(t('Нельзя списать больше, чем доступно', 'Mavjuddan ko\'proq hisobdan chiqarib bo\'lmaydi'));
      return;
    }
    setSubmitting(true);
    try {
      await useMaterial(writeOffItem.id, {
        quantity: qty,
        description: writeOffForm.description,
      });
      setWriteOffOpen(false);
      setWriteOffItem(null);
      fetchMaterials(selectedBuilding || undefined);
    } finally {
      setSubmitting(false);
    }
  }, [writeOffItem, writeOffForm, useMaterial, fetchMaterials, selectedBuilding, t]);

  const formatPrice = useCallback((val: number) => {
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' сум';
  }, []);

  const rowClass = useCallback((m: any) => {
    if (m.quantity === 0) return 'bg-red-50';
    if (m.quantity < m.min_quantity && m.quantity > 0) return 'bg-yellow-50';
    return '';
  }, []);

  if (materialsLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          {t('Материалы', 'Materiallar')}
        </h1>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('Добавить материал', 'Material qo\'shish')}
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Комплекс', 'Kompleks')}
            </label>
            <select
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('Все комплексы', 'Barcha komplekslar')}</option>
              {buildings.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleApplyFilter}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            <Filter className="w-4 h-4" />
            {t('Применить', 'Qo\'llash')}
          </button>
        </div>
      </div>

      {/* Table / Empty */}
      {loadError && materials.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12" />}
          title={t('Ошибка загрузки', 'Yuklashda xatolik')}
          description={t('Попробуйте обновить страницу', 'Sahifani yangilang')}
        />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title={t('Нет материалов', 'Materiallar yo\'q')}
          description={t('Добавьте первый материал', 'Birinchi materialni qo\'shing')}
        />
      ) : (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('Название', 'Nomi')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('Ед.', 'Birlik')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('Кол-во', 'Miqdor')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('Цена за ед.', 'Narxi')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('Мин. кол-во', 'Min. miqdor')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('Общая стоимость', 'Umumiy qiymati')}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">{t('Действия', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m: any) => (
                  <tr key={m.id} className={`border-b border-gray-50 ${rowClass(m)}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                    <td className="px-4 py-3 text-gray-600">{m.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{formatPrice(m.quantity)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{formatPrice(m.price_per_unit)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatPrice(m.min_quantity)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatPrice(m.quantity * m.price_per_unit)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openWriteOff(m)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
                      >
                        <MinusCircle className="w-3.5 h-3.5" />
                        {t('Списать', 'Hisobdan chiqarish')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Material Modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={t('Добавить материал', 'Material qo\'shish')} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('Название', 'Nomi')}</label>
            <input
              type="text"
              value={addForm.name}
              onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('Введите название', 'Nomini kiriting')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Единица', 'Birlik')}</label>
              <select
                value={addForm.unit}
                onChange={(e) => setAddForm((p) => ({ ...p, unit: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Количество', 'Miqdor')}</label>
              <input
                type="number"
                min="0"
                value={addForm.quantity}
                onChange={(e) => setAddForm((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Цена за ед.', 'Narxi')}</label>
              <input
                type="number"
                min="0"
                value={addForm.price_per_unit}
                onChange={(e) => setAddForm((p) => ({ ...p, price_per_unit: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Мин. кол-во', 'Min. miqdor')}</label>
              <input
                type="number"
                min="0"
                value={addForm.min_quantity}
                onChange={(e) => setAddForm((p) => ({ ...p, min_quantity: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('Комплекс', 'Kompleks')}</label>
            <select
              value={addForm.building_id}
              onChange={(e) => setAddForm((p) => ({ ...p, building_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('Выберите комплекс', 'Kompleksni tanlang')}</option>
              {buildings.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddSubmit}
            disabled={submitting || !addForm.name || !addForm.building_id}
            className="w-full px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('Сохранение...', 'Saqlanmoqda...') : t('Сохранить', 'Saqlash')}
          </button>
        </div>
      </Modal>

      {/* Write-off Modal */}
      <Modal isOpen={writeOffOpen} onClose={() => setWriteOffOpen(false)} title={t('Списание материала', 'Materialni hisobdan chiqarish')} size="sm">
        <div className="space-y-4">
          {writeOffItem && (
            <p className="text-sm text-gray-500">
              {writeOffItem.name} — {t('доступно', 'mavjud')}: <span className="font-medium text-gray-900">{formatPrice(writeOffItem.quantity)} {writeOffItem.unit}</span>
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('Количество', 'Miqdor')}</label>
            <input
              type="number"
              min="1"
              max={writeOffItem?.quantity ?? 0}
              value={writeOffForm.quantity}
              onChange={(e) => {
                setWriteOffForm((p) => ({ ...p, quantity: e.target.value }));
                setWriteOffError('');
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('Описание', 'Tavsif')}</label>
            <textarea
              value={writeOffForm.description}
              onChange={(e) => setWriteOffForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              placeholder={t('Причина списания', 'Hisobdan chiqarish sababi')}
            />
          </div>
          {writeOffError && (
            <p className="text-sm text-red-600">{writeOffError}</p>
          )}
          <button
            onClick={handleWriteOffSubmit}
            disabled={submitting || !writeOffForm.quantity}
            className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('Списание...', 'Chiqarilmoqda...') : t('Списать', 'Hisobdan chiqarish')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
