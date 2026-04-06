import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Package, Plus, MinusCircle, Filter, AlertTriangle, X, Paperclip } from 'lucide-react';
import { useFinanceStore } from '../../stores/financeStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';

const UNITS = ['шт', 'м', 'кг', 'л', 'упак'] as const;

interface BatchItem {
  name: string;
  unit: string;
  quantity: number;
  price_per_unit: number;
  min_quantity: number;
}

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

  // Batch add state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchBuildingId, setBatchBuildingId] = useState('');
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addForm, setAddForm] = useState({
    name: '',
    unit: 'шт',
    quantity: '',
    price_per_unit: '',
    min_quantity: '',
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

  const handleAddToList = useCallback(() => {
    if (!addForm.name) return;
    setBatchItems(prev => [...prev, {
      name: addForm.name,
      unit: addForm.unit,
      quantity: Number(addForm.quantity) || 0,
      price_per_unit: Number(addForm.price_per_unit) || 0,
      min_quantity: Number(addForm.min_quantity) || 0,
    }]);
    setAddForm({ name: '', unit: 'шт', quantity: '', price_per_unit: '', min_quantity: '' });
  }, [addForm]);

  const removeBatchItem = useCallback((idx: number) => {
    setBatchItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleBatchSubmit = useCallback(async () => {
    if (!batchBuildingId || batchItems.length === 0) return;
    setSubmitting(true);
    try {
      for (const item of batchItems) {
        await createMaterial({
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
          min_quantity: item.min_quantity,
          building_id: batchBuildingId,
        });
      }
      setAddOpen(false);
      setBatchItems([]);
      setBatchBuildingId('');
      setBatchFile(null);
      setAddForm({ name: '', unit: 'шт', quantity: '', price_per_unit: '', min_quantity: '' });
      fetchMaterials(selectedBuilding || undefined);
    } finally {
      setSubmitting(false);
    }
  }, [batchItems, batchBuildingId, createMaterial, fetchMaterials, selectedBuilding]);

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
    <div className="p-4 md:p-6 space-y-4 pb-24 md:pb-0">
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

      {/* Add Material Modal — batch mode */}
      <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setBatchItems([]); setBatchBuildingId(''); setBatchFile(null); setAddForm({ name: '', unit: 'шт', quantity: '', price_per_unit: '', min_quantity: '' }); }} title={t('Добавить материалы', 'Materiallar qo\'shish')} size="lg">
        <div className="flex flex-col" style={{ maxHeight: '75vh' }}>
          {/* TOP — Added items table */}
          {batchItems.length > 0 && (
            <div className="border-b border-gray-100 pb-3 mb-3">
              <p className="text-xs font-medium text-gray-500 mb-2">{t('Добавленные материалы', 'Qo\'shilgan materiallar')} ({batchItems.length})</p>
              <div className="max-h-[200px] overflow-y-auto overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-xs text-gray-500">
                      <th className="text-left px-3 py-1.5 font-medium">№</th>
                      <th className="text-left px-3 py-1.5 font-medium">{t('Название', 'Nomi')}</th>
                      <th className="text-center px-2 py-1.5 font-medium">{t('Ед.', 'Bir.')}</th>
                      <th className="text-right px-2 py-1.5 font-medium">{t('Кол-во', 'Miqd.')}</th>
                      <th className="text-right px-2 py-1.5 font-medium">{t('Цена', 'Narx')}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {batchItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-3 py-1.5 text-gray-900">{item.name}</td>
                        <td className="px-2 py-1.5 text-center text-gray-600">{item.unit}</td>
                        <td className="px-2 py-1.5 text-right text-gray-900">{item.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-gray-900">{item.price_per_unit.toLocaleString()}</td>
                        <td className="px-1 py-1.5">
                          <button onClick={() => removeBatchItem(idx)} className="p-1 text-gray-400 hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BOTTOM — Form (fixed size) */}
          <div className="space-y-3">
            {/* Building — selected once */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Комплекс', 'Kompleks')} *</label>
              <select
                value={batchBuildingId}
                onChange={(e) => setBatchBuildingId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">{t('Выберите комплекс', 'Kompleksni tanlang')}</option>
                {buildings.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Название материала', 'Material nomi')}</label>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder={t('Введите название', 'Nomini kiriting')}
              />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('Единица', 'Birlik')}</label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('Количество', 'Miqdor')}</label>
                <input
                  type="number"
                  min="0"
                  value={addForm.quantity}
                  onChange={(e) => setAddForm((p) => ({ ...p, quantity: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('Цена за ед.', 'Narxi')}</label>
                <input
                  type="number"
                  min="0"
                  value={addForm.price_per_unit}
                  onChange={(e) => setAddForm((p) => ({ ...p, price_per_unit: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('Мин. остаток', 'Min. qoldiq')}</label>
                <input
                  type="number"
                  min="0"
                  value={addForm.min_quantity}
                  onChange={(e) => setAddForm((p) => ({ ...p, min_quantity: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              onClick={handleAddToList}
              disabled={!addForm.name}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('Добавить в список', 'Ro\'yxatga qo\'shish')}
            </button>

            {/* File attachment */}
            <div className="border-t border-gray-100 pt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={(e) => setBatchFile(e.target.files?.[0] || null)}
              />
              {batchFile ? (
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  <Paperclip className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 truncate">{batchFile.name}</span>
                  <button onClick={() => setBatchFile(null)} className="p-1 text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                  {t('Прикрепить документ (счёт-фактура / накладная)', 'Hujjat biriktirish (hisob-faktura / nakladnoy)')}
                </button>
              )}
            </div>

            {/* Submit all */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setAddOpen(false); setBatchItems([]); setBatchBuildingId(''); setBatchFile(null); }}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                {t('Отмена', 'Bekor qilish')}
              </button>
              <button
                onClick={handleBatchSubmit}
                disabled={submitting || !batchBuildingId || batchItems.length === 0}
                className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? t('Сохранение...', 'Saqlanmoqda...') : t(`Сохранить всё (${batchItems.length})`, `Barchasini saqlash (${batchItems.length})`)}
              </button>
            </div>
          </div>
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
