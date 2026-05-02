import { useState, useEffect } from 'react';
import {
  Plus, AlertCircle,
  FileText, Building2, User,
  Check, X,
  Paperclip, Loader2, Video, MapPin, Link2
} from 'lucide-react';
import { Modal } from '../components/common';
import { uploadApi, branchesApi, buildingsApi } from '../services/api';
import type {
  MeetingFormat, AgendaItemType,
  MeetingOrganizerType, DecisionThreshold
} from '../types';
import { AGENDA_ITEM_TYPES, DECISION_THRESHOLD_LABELS } from '../types';

export interface CreateMeetingWizardProps {
  onClose: () => void;
  onCreate: (data: {
    buildingId: string;
    buildingAddress: string;
    organizerType: MeetingOrganizerType;
    organizerId: string;
    organizerName: string;
    format: MeetingFormat;
    agendaItems: Omit<import('../types').AgendaItem, 'id' | 'votesFor' | 'votesAgainst' | 'votesAbstain' | 'order'>[];
    location?: string;
    description?: string;
    meetingTime?: string;
  }) => void;
  language: string;
  user: { id: string; name: string; role: string; buildingId?: string } | null;
  buildings: { id: string; name: string; address: string }[];
}

export function CreateMeetingWizard({
  onClose,
  onCreate,
  language,
  user,
}: CreateMeetingWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [newCustomItem, setNewCustomItem] = useState<{
    title: string;
    description: string;
    threshold: DecisionThreshold;
    attachments: { name: string; url: string; type: string; size: number }[];
  }>({ title: '', description: '', threshold: 'simple_majority', attachments: [] });
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Cascading: branches -> buildings
  const [branchesList, setBranchesList] = useState<{ id: string; code: string; name: string }[]>([]);
  const [buildingsForBranch, setBuildingsForBranch] = useState<{ id: string; name: string; address: string; branch_code: string }[]>([]);
  const [selectedBranchCode, setSelectedBranchCode] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingBuildings, setLoadingBuildings] = useState(false);

  const [formData, setFormData] = useState({
    buildingId: '',
    buildingAddress: '',
    organizerType: 'management' as MeetingOrganizerType,
    format: 'online' as MeetingFormat,
    agendaItems: [] as AgendaItemType[],
    customItems: [] as { title: string; description: string; threshold: DecisionThreshold; attachments: { name: string; url: string; type: string; size: number }[] }[],
    location: '',
    onlinePlatform: '' as string,
    onlineLink: '',
    description: '', // Повестка дня
    meetingTime: '19:00',
  });

  const ONLINE_PLATFORMS = [
    { value: 'zoom', label: 'Zoom' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'google_meet', label: 'Google Meet' },
    { value: 'skype', label: 'Skype' },
    { value: 'other', label: language === 'ru' ? 'Другое' : 'Boshqa' },
  ];

  // Load branches on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await branchesApi.getAll();
        if (!cancelled && resp.branches) {
          setBranchesList(resp.branches);
          if (resp.branches.length > 0) {
            setSelectedBranchCode(resp.branches[0].code);
          }
        }
      } catch (e) {
        console.error('Failed to load branches:', e);
      } finally {
        if (!cancelled) setLoadingBranches(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load buildings when branch changes
  useEffect(() => {
    if (!selectedBranchCode) return;
    let cancelled = false;
    setLoadingBuildings(true);
    (async () => {
      try {
        const resp = await buildingsApi.getAll();
        if (!cancelled && resp.buildings) {
          const filtered = resp.buildings.filter((b: Record<string, unknown>) => b.branch_code === selectedBranchCode);
          setBuildingsForBranch(filtered);
          // Reset building selection
          setFormData(prev => ({ ...prev, buildingId: '', buildingAddress: '' }));
        }
      } catch (e) {
        console.error('Failed to load buildings:', e);
      } finally {
        if (!cancelled) setLoadingBuildings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBranchCode]);

  const handleBranchChange = (code: string) => {
    setSelectedBranchCode(code);
    setFormData(prev => ({ ...prev, buildingId: '', buildingAddress: '' }));
  };

  const handleBuildingChange = (buildingId: string) => {
    const building = buildingsForBranch.find(b => b.id === buildingId);
    setFormData({
      ...formData,
      buildingId,
      buildingAddress: building?.address || '',
    });
  };

  const handleAddAgendaItem = (type: AgendaItemType) => {
    if (formData.agendaItems.includes(type)) {
      setFormData({ ...formData, agendaItems: formData.agendaItems.filter(t => t !== type) });
    } else {
      setFormData({ ...formData, agendaItems: [...formData.agendaItems, type] });
    }
  };

  const handleCreate = async () => {
    // If no specific building selected, use first building in branch
    const effectiveBuildingId = formData.buildingId || (buildingsForBranch.length > 0 ? buildingsForBranch[0].id : '');
    const effectiveBuildingAddress = formData.buildingAddress || (buildingsForBranch.length > 0 ? buildingsForBranch[0].address : '');
    if (!user || !selectedBranchCode || isSubmitting) return;

    setIsSubmitting(true);

    const agendaItems = [
      ...formData.agendaItems.map(type => ({
        type,
        title: language === 'ru' ? AGENDA_ITEM_TYPES[type].label : AGENDA_ITEM_TYPES[type].labelUz,
        description: language === 'ru' ? AGENDA_ITEM_TYPES[type].description : AGENDA_ITEM_TYPES[type].descriptionUz,
        threshold: AGENDA_ITEM_TYPES[type].defaultThreshold,
        materials: [],
      })),
      ...formData.customItems.map(item => ({
        type: 'other' as AgendaItemType,
        title: item.title,
        description: item.description,
        threshold: item.threshold,
        materials: [],
        attachments: item.attachments,
      })),
    ];

    // Build location string with online info
    let locationStr = formData.location || '';
    if ((formData.format === 'online' || formData.format === 'hybrid') && formData.onlinePlatform) {
      const platform = ONLINE_PLATFORMS.find(p => p.value === formData.onlinePlatform)?.label || formData.onlinePlatform;
      const onlineInfo = formData.onlineLink ? `${platform}: ${formData.onlineLink}` : platform;
      locationStr = locationStr ? `${locationStr} | ${onlineInfo}` : onlineInfo;
    }

    try {
      await onCreate({
        buildingId: effectiveBuildingId,
        buildingAddress: effectiveBuildingAddress,
        organizerType: formData.organizerType,
        organizerId: user.id,
        organizerName: user.name,
        format: formData.format,
        agendaItems,
        location: locationStr || undefined,
        description: formData.description || undefined,
        meetingTime: formData.meetingTime || '19:00',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, label: language === 'ru' ? 'Основное' : 'Asosiy' },
    { num: 2, label: language === 'ru' ? 'Вопросы' : 'Masalalar' },
    { num: 3, label: language === 'ru' ? 'Подтверждение' : 'Tasdiqlash' },
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={language === 'ru' ? 'Назначить собрание' : 'Yig\'ilish tayinlash'}
      size="2xl"
    >
        <p className="text-sm text-gray-500 -mt-2 mb-4">
          {language === 'ru' ? `Шаг ${step} из 3` : `Bosqich ${step} dan 3`}
        </p>

        {/* Progress */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s.num ? 'bg-primary-400 text-gray-900' : 'bg-gray-200 text-gray-500'
                }`}>
                  {s.num}
                </div>
                <span className={`ml-2 text-sm ${step >= s.num ? 'text-gray-900' : 'text-gray-500'}`}>
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-16 h-1 mx-4 rounded ${step > s.num ? 'bg-primary-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {step === 1 && (
            <>
              {/* Cascading: Комплекс -> Дом */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Комплекс' : 'Kompleks'} <span className="text-red-500">*</span>
                </label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                  </div>
                ) : branchesList.length === 0 ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
                    {language === 'ru'
                      ? 'Нет доступных комплексов. Сначала добавьте комплекс в системе.'
                      : 'Mavjud komplekslar yo\'q. Avval tizimda kompleks qo\'shing.'}
                  </div>
                ) : (
                  <select
                    value={selectedBranchCode}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                  >
                    {branchesList.map((branch) => (
                      <option key={branch.id} value={branch.code}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedBranchCode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {language === 'ru' ? 'Дом' : 'Uy'}
                    <span className="text-gray-400 font-normal ml-1 text-xs">
                      ({language === 'ru' ? 'если не выбран — собрание для всего комплекса' : 'tanlanmasa — butun kompleks uchun'})
                    </span>
                  </label>
                  {loadingBuildings ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {language === 'ru' ? 'Загрузка домов...' : 'Uylar yuklanmoqda...'}
                    </div>
                  ) : buildingsForBranch.length === 0 ? (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
                      {language === 'ru' ? 'В этом комплексе нет домов' : 'Bu kompleksda uylar yo\'q'}
                    </div>
                  ) : (
                    <select
                      value={formData.buildingId}
                      onChange={(e) => handleBuildingChange(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                    >
                      <option value="">
                        {language === 'ru' ? '— Весь комплекс —' : '— Butun kompleks —'}
                      </option>
                      {buildingsForBranch.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name} — {building.address}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Organizer Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {language === 'ru' ? 'Организатор' : 'Tashkilotchi'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormData({ ...formData, organizerType: 'management' })}
                    className={`p-4 rounded-xl border-2 transition-colors ${
                      formData.organizerType === 'management'
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Building2 className="w-6 h-6 mb-2 mx-auto text-gray-600" />
                    <div className="text-sm font-medium">
                      {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'}
                    </div>
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, organizerType: 'resident' })}
                    className={`p-4 rounded-xl border-2 transition-colors ${
                      formData.organizerType === 'resident'
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <User className="w-6 h-6 mb-2 mx-auto text-gray-600" />
                    <div className="text-sm font-medium">
                      {language === 'ru' ? 'Житель (инициатива)' : 'Aholi (tashabbusi)'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {language === 'ru' ? 'Формат проведения' : 'O\'tkazish formati'}
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['online', 'offline', 'hybrid'] as MeetingFormat[]).map((format) => (
                    <button
                      key={format}
                      onClick={() => setFormData({ ...formData, format })}
                      className={`p-3 rounded-xl border-2 transition-colors ${
                        formData.format === format
                          ? 'border-primary-400 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium">
                        {format === 'online'
                          ? (language === 'ru' ? 'Онлайн' : 'Onlayn')
                          : format === 'offline'
                          ? (language === 'ru' ? 'Очное' : 'Yuzma-yuz')
                          : (language === 'ru' ? 'Смешанное' : 'Aralash')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Online fields: Platform + Link (for online/hybrid) */}
              {(formData.format === 'online' || formData.format === 'hybrid') && (
                <div className="space-y-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Video className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">
                      {language === 'ru' ? 'Онлайн-подключение' : 'Onlayn ulanish'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {language === 'ru' ? 'Платформа' : 'Platforma'}
                    </label>
                    <select
                      value={formData.onlinePlatform}
                      onChange={(e) => setFormData({ ...formData, onlinePlatform: e.target.value })}
                      className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                    >
                      <option value="">{language === 'ru' ? 'Выберите платформу' : 'Platformani tanlang'}</option>
                      {ONLINE_PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      <div className="flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        {language === 'ru' ? 'Ссылка на конференцию' : 'Konferensiya havolasi'}
                      </div>
                    </label>
                    <input
                      type="url"
                      value={formData.onlineLink}
                      onChange={(e) => setFormData({ ...formData, onlineLink: e.target.value })}
                      className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                      placeholder="https://zoom.us/j/..."
                    />
                  </div>
                </div>
              )}

              {/* Location (for offline/hybrid) */}
              {(formData.format === 'offline' || formData.format === 'hybrid') && (
                <div className="space-y-2 p-4 rounded-xl bg-green-50 border border-green-100">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      {language === 'ru' ? 'Очное присутствие' : 'Yuzma-yuz ishtirok'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {language === 'ru' ? 'Место проведения' : 'O\'tkazish joyi'}
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                      placeholder={language === 'ru' ? 'Офис УК, 2 этаж' : 'UK ofisi, 2-qavat'}
                    />
                  </div>
                </div>
              )}

              {/* Meeting Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Время проведения' : 'O\'tkazish vaqti'}
                </label>
                <input
                  type="time"
                  value={formData.meetingTime}
                  onChange={(e) => setFormData({ ...formData, meetingTime: e.target.value })}
                  className="glass-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {language === 'ru'
                    ? 'Время для всех вариантов дат в голосовании'
                    : 'Ovoz berishdagi barcha sanalar uchun vaqt'}
                </p>
              </div>

              {/* Повестка дня (mandatory) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Повестка дня' : 'Kun tartibi'} <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  {language === 'ru' ? 'Опишите основные вопросы для обсуждения' : 'Muhokama uchun asosiy masalalarni tavsiflang'}
                </p>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="glass-input min-h-[80px] resize-none"
                  placeholder={language === 'ru'
                    ? 'Например: Утверждение сметы расходов на 2026 год, выбор подрядчика для ремонта крыши...'
                    : 'Masalan: 2026 yil uchun xarajatlar smetasini tasdiqlash, tom ta\'mirlash uchun pudratchi tanlash...'}
                  rows={3}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {language === 'ru' ? 'Выберите вопросы повестки' : 'Kun tartibi savollarini tanlang'}
                </label>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(Object.keys(AGENDA_ITEM_TYPES) as AgendaItemType[]).map((type) => {
                    const item = AGENDA_ITEM_TYPES[type];
                    const isSelected = formData.agendaItems.includes(type);

                    return (
                      <button
                        key={type}
                        onClick={() => handleAddAgendaItem(type)}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                          isSelected
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">
                              {language === 'ru' ? item.label : item.labelUz}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {language === 'ru' ? item.description : item.descriptionUz}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                {language === 'ru'
                                  ? DECISION_THRESHOLD_LABELS[item.defaultThreshold].label
                                  : DECISION_THRESHOLD_LABELS[item.defaultThreshold].labelUz}
                              </span>
                              {item.requiresMaterials && (
                                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600">
                                  {language === 'ru' ? 'Нужны материалы' : 'Materiallar kerak'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-primary-400 bg-primary-400' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-4 h-4 text-gray-900" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Items Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {language === 'ru' ? 'Свои вопросы' : 'O\'z savollaringiz'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCustomItemForm(true)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    {language === 'ru' ? 'Добавить вопрос' : 'Savol qo\'shish'}
                  </button>
                </div>

                {/* Custom Items List */}
                {formData.customItems.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {formData.customItems.map((item, index) => (
                      <div key={index} className="p-3 rounded-xl border-2 border-primary-400 bg-primary-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{item.title}</div>
                            {item.description && (
                              <div className="text-sm text-gray-500 mt-1">{item.description}</div>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mt-2 inline-block">
                              {language === 'ru'
                                ? DECISION_THRESHOLD_LABELS[item.threshold].label
                                : DECISION_THRESHOLD_LABELS[item.threshold].labelUz}
                            </span>
                            {item.attachments && item.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {item.attachments.map((att, ai) => (
                                  <div key={ai} className="flex items-center gap-1">
                                    {att.type.startsWith('image/') ? (
                                      <img src={att.url} alt={att.name} className="w-12 h-12 object-cover rounded border border-gray-200" />
                                    ) : (
                                      <div className="flex items-center gap-1 px-2 py-1 bg-white rounded border border-gray-200 text-xs text-gray-600">
                                        <FileText className="w-3 h-3" />
                                        <span className="max-w-[80px] truncate">{att.name}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setFormData({
                              ...formData,
                              customItems: formData.customItems.filter((_, i) => i !== index)
                            })}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Custom Item Form */}
                {showCustomItemForm && (
                  <div className="p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 space-y-3">
                    <input
                      type="text"
                      value={newCustomItem.title}
                      onChange={(e) => setNewCustomItem({ ...newCustomItem, title: e.target.value })}
                      className="glass-input"
                      placeholder={language === 'ru' ? 'Название вопроса *' : 'Savol nomi *'}
                    />
                    <textarea
                      value={newCustomItem.description}
                      onChange={(e) => setNewCustomItem({ ...newCustomItem, description: e.target.value })}
                      className="glass-input min-h-[60px] resize-none"
                      placeholder={language === 'ru' ? 'Описание (необязательно)' : 'Tavsif (ixtiyoriy)'}
                      rows={2}
                    />
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        {language === 'ru' ? 'Порог принятия' : 'Qabul qilish chegarasi'}
                      </label>
                      <select
                        value={newCustomItem.threshold}
                        onChange={(e) => setNewCustomItem({ ...newCustomItem, threshold: e.target.value as DecisionThreshold })}
                        className="glass-input text-sm"
                      >
                        {(Object.keys(DECISION_THRESHOLD_LABELS) as DecisionThreshold[]).map((t) => (
                          <option key={t} value={t}>
                            {language === 'ru' ? DECISION_THRESHOLD_LABELS[t].label : DECISION_THRESHOLD_LABELS[t].labelUz}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Attachments */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">
                        {language === 'ru' ? 'Прикреплённые файлы' : 'Ilova qilingan fayllar'}
                      </label>
                      {/* Attached file previews */}
                      {newCustomItem.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {newCustomItem.attachments.map((att, ai) => (
                            <div key={ai} className="relative group">
                              {att.type.startsWith('image/') ? (
                                <div className="relative">
                                  <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded border border-gray-200" />
                                  <button
                                    type="button"
                                    onClick={() => setNewCustomItem({
                                      ...newCustomItem,
                                      attachments: newCustomItem.attachments.filter((_, i) => i !== ai)
                                    })}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 pl-2 pr-1 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-700">
                                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  <span className="max-w-[100px] truncate">{att.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setNewCustomItem({
                                      ...newCustomItem,
                                      attachments: newCustomItem.attachments.filter((_, i) => i !== ai)
                                    })}
                                    className="ml-1 text-red-400 hover:text-red-600 flex-shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* File input button */}
                      <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors ${uploadingAttachment ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingAttachment ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                        {language === 'ru' ? 'Прикрепить файл' : 'Fayl biriktirish'}
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf,.doc,.docx,.xlsx"
                          disabled={uploadingAttachment}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingAttachment(true);
                            try {
                              const uploaded = await uploadApi.uploadFile(file);
                              setNewCustomItem(prev => ({
                                ...prev,
                                attachments: [...prev.attachments, uploaded]
                              }));
                            } catch {
                              // fallback: use base64 data URL
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const dataUrl = ev.target?.result as string;
                                setNewCustomItem(prev => ({
                                  ...prev,
                                  attachments: [...prev.attachments, {
                                    name: file.name,
                                    url: dataUrl,
                                    type: file.type,
                                    size: file.size,
                                  }]
                                }));
                              };
                              reader.readAsDataURL(file);
                            } finally {
                              setUploadingAttachment(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (newCustomItem.title.trim()) {
                            setFormData({
                              ...formData,
                              customItems: [...formData.customItems, { ...newCustomItem }]
                            });
                            setNewCustomItem({ title: '', description: '', threshold: 'simple_majority', attachments: [] });
                            setShowCustomItemForm(false);
                          }
                        }}
                        disabled={!newCustomItem.title.trim() || uploadingAttachment}
                        className="flex-1 py-2 px-4 bg-primary-400 hover:bg-primary-500 text-gray-900 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomItemForm(false);
                          setNewCustomItem({ title: '', description: '', threshold: 'simple_majority', attachments: [] });
                        }}
                        className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm"
                      >
                        {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formData.agendaItems.length === 0 && formData.customItems.length === 0 && (
                <p className="text-sm text-red-500">
                  {language === 'ru' ? 'Выберите хотя бы один вопрос или добавьте свой' : 'Kamida bitta savol tanlang yoki o\'zingiznikini qo\'shing'}
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              {/* Summary */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-gray-50">
                  <h3 className="font-medium mb-3">
                    {language === 'ru' ? 'Сводка' : 'Xulosa'}
                  </h3>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Комплекс:' : 'Kompleks:'}</span>
                      <span className="font-medium">
                        {branchesList.find(b => b.code === selectedBranchCode)?.name || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Дом:' : 'Uy:'}</span>
                      <span className="font-medium">
                        {formData.buildingId
                          ? (buildingsForBranch.find(b => b.id === formData.buildingId)?.name || formData.buildingAddress)
                          : (language === 'ru' ? 'Весь комплекс' : 'Butun kompleks')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Формат:' : 'Format:'}</span>
                      <span className="font-medium">
                        {formData.format === 'online'
                          ? (language === 'ru' ? 'Онлайн' : 'Onlayn')
                          : formData.format === 'offline'
                          ? (language === 'ru' ? 'Очное' : 'Yuzma-yuz')
                          : (language === 'ru' ? 'Смешанное' : 'Aralash')}
                      </span>
                    </div>
                    {(formData.format === 'online' || formData.format === 'hybrid') && formData.onlinePlatform && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{language === 'ru' ? 'Платформа:' : 'Platforma:'}</span>
                        <span className="font-medium">
                          {ONLINE_PLATFORMS.find(p => p.value === formData.onlinePlatform)?.label}
                        </span>
                      </div>
                    )}
                    {(formData.format === 'offline' || formData.format === 'hybrid') && formData.location && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{language === 'ru' ? 'Место:' : 'Joy:'}</span>
                        <span className="font-medium">{formData.location}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Организатор:' : 'Tashkilotchi:'}</span>
                      <span className="font-medium">
                        {formData.organizerType === 'management'
                          ? (language === 'ru' ? 'УК' : 'UK')
                          : (language === 'ru' ? 'Житель' : 'Aholi')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Вопросов:' : 'Savollar:'}</span>
                      <span className="font-medium">{formData.agendaItems.length + formData.customItems.length}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700">
                      {language === 'ru'
                        ? 'После публикации жильцам будет отправлено уведомление. Они смогут проголосовать за удобную дату проведения собрания.'
                        : 'Nashrdan so\'ng aholiga bildirishnoma yuboriladi. Ular yig\'ilish uchun qulay sanani tanlashlari mumkin bo\'ladi.'}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200">
                  <h4 className="font-medium mb-2">
                    {language === 'ru' ? 'Повестка дня:' : 'Kun tartibi:'}
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {formData.agendaItems.map((type) => (
                      <li key={type}>
                        {language === 'ru'
                          ? AGENDA_ITEM_TYPES[type].label
                          : AGENDA_ITEM_TYPES[type].labelUz}
                      </li>
                    ))}
                    {formData.customItems.map((item, index) => (
                      <li key={`custom-${index}`} className="text-blue-700">
                        {item.title}
                        <span className="text-xs text-gray-500 ml-1">
                          ({language === 'ru' ? 'свой вопрос' : 'o\'z savoli'})
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Повестка дня preview */}
                {formData.description && (
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <h4 className="font-medium mb-2">
                      {language === 'ru' ? 'Повестка дня:' : 'Kun tartibi:'}
                    </h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{formData.description}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {language === 'ru' ? 'Назад' : 'Orqaga'}
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && (!selectedBranchCode || !formData.description.trim())) || (step === 2 && formData.agendaItems.length === 0 && formData.customItems.length === 0)}
              className="flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {language === 'ru' ? 'Далее' : 'Keyingi'}
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={isSubmitting || !selectedBranchCode}
              className="flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? (language === 'ru' ? 'Создание...' : 'Yaratilmoqda...')
                : (language === 'ru' ? 'Опубликовать' : 'Nashr qilish')}
            </button>
          )}
        </div>
    </Modal>
  );
}
