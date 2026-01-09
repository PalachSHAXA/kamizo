import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Megaphone, Users, Briefcase, X, AlertTriangle, AlertCircle, Info, Trash2, Eye, Clock, Building2, Upload, FileSpreadsheet, Target, Filter, Paperclip, File, Image, FileText, Download } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { buildingsApi, uploadApi } from '../services/api';
import type { Announcement, AnnouncementType, AnnouncementPriority, AnnouncementTargetType, AnnouncementTarget, FileAttachment } from '../types';

export function AnnouncementsPage() {
  const { user } = useAuthStore();
  const { announcements, addAnnouncement, deleteAnnouncement, updateAnnouncement, fetchAnnouncements } = useDataStore();
  const { t, language } = useLanguageStore();

  // Only admin, manager, director can create/edit announcements
  const canManageAnnouncements = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'director';

  const [activeTab, setActiveTab] = useState<'residents' | 'employees'>('residents');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    type: 'residents' as AnnouncementType,
    priority: 'normal' as AnnouncementPriority,
    expiresAt: '',
  });

  // Targeting state
  const [targetType, setTargetType] = useState<AnnouncementTargetType>('all');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [customLogins, setCustomLogins] = useState<string[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File attachments state
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Real buildings from API
  const [buildings, setBuildings] = useState<any[]>([]);

  // Fetch buildings on mount
  useEffect(() => {
    const loadBuildings = async () => {
      try {
        const result = await buildingsApi.getAll();
        setBuildings(result.buildings || []);
      } catch (error) {
        console.error('Failed to load buildings:', error);
      }
    };
    loadBuildings();
    fetchAnnouncements(); // Also refresh announcements
  }, [fetchAnnouncements]);

  // Extract unique branches from buildings (using branch_code field)
  const branches = useMemo(() => {
    const branchMap = new Map<string, { id: string; name: string; buildingCount: number }>();
    buildings.forEach(b => {
      const branchCode = b.branch_code || b.branchCode || 'default';
      if (!branchMap.has(branchCode)) {
        branchMap.set(branchCode, {
          id: branchCode,
          name: branchCode === 'default' ? (language === 'ru' ? 'Основной филиал' : 'Asosiy filial') : branchCode,
          buildingCount: 0
        });
      }
      const branch = branchMap.get(branchCode)!;
      branch.buildingCount++;
    });
    return Array.from(branchMap.values());
  }, [buildings, language]);

  // Date filter state
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Filter announcements by type and date
  const filterByDate = (items: typeof announcements) => {
    if (dateFilter === 'all') return items;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    return items.filter(a => {
      const createdAt = new Date(a.createdAt);
      switch (dateFilter) {
        case 'today':
          return createdAt >= today;
        case 'week':
          return createdAt >= weekAgo;
        case 'month':
          return createdAt >= monthAgo;
        default:
          return true;
      }
    });
  };

  const residentAnnouncements = useMemo(() =>
    filterByDate(announcements.filter(a => a.type === 'residents' && a.isActive)),
    [announcements, dateFilter]
  );

  const employeeAnnouncements = useMemo(() =>
    filterByDate(announcements.filter(a => a.type === 'employees' && a.isActive)),
    [announcements, dateFilter]
  );

  const currentAnnouncements = activeTab === 'residents' ? residentAnnouncements : employeeAnnouncements;

  // Handle Excel file upload for custom targeting
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);

    // Lazy load XLSX library
    const XLSX = await import('xlsx');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        // Extract logins from first column (skip header)
        const logins: string[] = [];
        jsonData.slice(1).forEach(row => {
          if (row[0]) {
            const value = String(row[0]).trim();
            if (value) logins.push(value);
          }
        });

        setCustomLogins(logins);
      } catch (err) {
        console.error('Error parsing Excel file:', err);
        alert(language === 'ru' ? 'Ошибка чтения файла' : 'Faylni o\'qishda xato');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Build target object based on selections
  const buildTarget = (): AnnouncementTarget | undefined => {
    if (newAnnouncement.type !== 'residents') return undefined;

    switch (targetType) {
      case 'all':
        return { type: 'all' };
      case 'branch':
        return selectedBranch ? { type: 'branch', branchId: selectedBranch } : undefined;
      case 'building':
        return selectedBuilding ? { type: 'building', buildingId: selectedBuilding } : undefined;
      case 'custom':
        return customLogins.length > 0 ? { type: 'custom', customLogins } : undefined;
      default:
        return { type: 'all' };
    }
  };

  const getTargetDescription = (): string => {
    if (newAnnouncement.type !== 'residents') return '';

    switch (targetType) {
      case 'all':
        return language === 'ru' ? 'Все жители' : 'Barcha aholiga';
      case 'branch':
        const branch = branches.find(b => b.id === selectedBranch);
        return branch ? branch.name : '';
      case 'building':
        const building = buildings.find(b => b.id === selectedBuilding);
        return building ? building.name : '';
      case 'custom':
        return customLogins.length > 0
          ? `${customLogins.length} ${language === 'ru' ? 'получателей' : 'qabul qiluvchi'}`
          : '';
      default:
        return '';
    }
  };

  const resetTargeting = () => {
    setTargetType('all');
    setSelectedBranch('');
    setSelectedBuilding('');
    setCustomLogins([]);
    setUploadedFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle file attachment upload
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingAttachment(true);
    try {
      const newAttachments = await uploadApi.uploadFiles(Array.from(files));
      setAttachments(prev => [...prev, ...newAttachments]);
    } catch (error) {
      console.error('Failed to upload attachments:', error);
      alert(language === 'ru' ? 'Ошибка загрузки файла' : 'Fayl yuklashda xato');
    } finally {
      setIsUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Get file icon based on type
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type.includes('pdf') || type.includes('word') || type.includes('document')) return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAddAnnouncement = async () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim() || !user) return;

    const target = buildTarget();

    await addAnnouncement({
      title: newAnnouncement.title,
      content: newAnnouncement.content,
      type: newAnnouncement.type,
      priority: newAnnouncement.priority,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      expiresAt: newAnnouncement.expiresAt || undefined,
      target,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    setNewAnnouncement({
      title: '',
      content: '',
      type: 'residents',
      priority: 'normal',
      expiresAt: '',
    });
    resetTargeting();
    setAttachments([]);
    setShowAddModal(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm(language === 'ru' ? 'Удалить объявление?' : 'E\'lonni o\'chirishni tasdiqlaysizmi?')) {
      await deleteAnnouncement(id);
    }
  };

  const getPriorityIcon = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'urgent':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'important':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getPriorityBadge = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'important':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('announcements.title')}</h1>
          <p className="text-gray-500">
            {language === 'ru'
              ? (canManageAnnouncements ? 'Создавайте объявления для жителей и сотрудников' : 'Объявления от управляющей компании')
              : (canManageAnnouncements ? 'Aholi va xodimlar uchun e\'lonlar yarating' : 'Boshqaruv kompaniyasidan e\'lonlar')}
          </p>
        </div>
        {/* Only admin, manager, director can create announcements */}
        {canManageAnnouncements && (
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {t('announcements.add')}
          </button>
        )}
      </div>

      {/* Tabs and Date Filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('residents')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'residents'
                ? 'bg-orange-400 text-gray-900'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Users className="w-5 h-5" />
            {t('announcements.forResidents')}
            {residentAnnouncements.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-900/10 text-xs">
                {residentAnnouncements.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'employees'
                ? 'bg-orange-400 text-gray-900'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            {t('announcements.forStaff')}
            {employeeAnnouncements.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-900/10 text-xs">
                {employeeAnnouncements.length}
              </span>
            )}
          </button>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">{language === 'ru' ? 'Все время' : 'Barcha vaqt'}</option>
            <option value="today">{language === 'ru' ? 'Сегодня' : 'Bugun'}</option>
            <option value="week">{language === 'ru' ? 'Неделя' : 'Hafta'}</option>
            <option value="month">{language === 'ru' ? 'Месяц' : 'Oy'}</option>
          </select>
        </div>
      </div>

      {/* Announcements List */}
      <div className="space-y-4">
        {currentAnnouncements.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Megaphone className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">
              {t('announcements.noAnnouncements')}
            </h3>
            <p className="text-gray-400">{t('announcements.addFirst')}</p>
          </div>
        ) : (
          currentAnnouncements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onDelete={() => handleDelete(announcement.id)}
              onEdit={() => {
                setEditingAnnouncement(announcement);
                setShowEditModal(true);
              }}
              formatDate={formatDate}
              getPriorityIcon={getPriorityIcon}
              getPriorityBadge={getPriorityBadge}
              t={t}
              canDelete={canManageAnnouncements && (user?.id === announcement.authorId || user?.role === 'admin')}
              canEdit={canManageAnnouncements}
              language={language}
            />
          ))
        )}
      </div>

      {/* Add Announcement Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold">{t('announcements.add')}</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('announcements.type')}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewAnnouncement({ ...newAnnouncement, type: 'residents' })}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                      newAnnouncement.type === 'residents'
                        ? 'bg-green-100 text-green-700 border-2 border-green-400'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    <Users className="w-5 h-5" />
                    {t('announcements.forResidents')}
                  </button>
                  <button
                    onClick={() => setNewAnnouncement({ ...newAnnouncement, type: 'employees' })}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                      newAnnouncement.type === 'employees'
                        ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    <Briefcase className="w-5 h-5" />
                    {t('announcements.forStaff')}
                  </button>
                </div>
              </div>

              {/* Targeting (only for residents) */}
              {newAnnouncement.type === 'residents' && (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Target className="w-4 h-4" />
                    {language === 'ru' ? 'Таргетирование' : 'Maqsadli auditoriya'}
                  </div>

                  {/* Target Type Selection */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { type: 'all' as AnnouncementTargetType, label: language === 'ru' ? 'Все' : 'Hammasi', icon: Users },
                      { type: 'branch' as AnnouncementTargetType, label: language === 'ru' ? 'Филиал' : 'Filial', icon: Building2 },
                      { type: 'building' as AnnouncementTargetType, label: language === 'ru' ? 'ЖК' : 'TJM', icon: Building2 },
                      { type: 'custom' as AnnouncementTargetType, label: language === 'ru' ? 'Список' : 'Ro\'yxat', icon: FileSpreadsheet },
                    ].map(({ type, label, icon: Icon }) => (
                      <button
                        key={type}
                        onClick={() => {
                          setTargetType(type);
                          if (type !== 'branch') setSelectedBranch('');
                          if (type !== 'building') setSelectedBuilding('');
                          if (type !== 'custom') {
                            setCustomLogins([]);
                            setUploadedFileName('');
                          }
                        }}
                        className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl text-xs font-medium transition-colors ${
                          targetType === type
                            ? 'bg-primary-100 text-primary-700 border-2 border-primary-400'
                            : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Branch Selection */}
                  {targetType === 'branch' && (
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="glass-input"
                    >
                      <option value="">{language === 'ru' ? 'Выберите филиал...' : 'Filialni tanlang...'}</option>
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name} ({branch.buildingCount} {language === 'ru' ? 'домов' : 'uy'})
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Building Selection */}
                  {targetType === 'building' && (
                    <select
                      value={selectedBuilding}
                      onChange={(e) => setSelectedBuilding(e.target.value)}
                      className="glass-input"
                    >
                      <option value="">{language === 'ru' ? 'Выберите ЖК...' : 'TJM tanlang...'}</option>
                      {buildings.map(building => (
                        <option key={building.id} value={building.id}>
                          {building.name} - {building.address}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Custom Upload */}
                  {targetType === 'custom' && (
                    <div className="space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors"
                      >
                        <Upload className="w-5 h-5 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {uploadedFileName || (language === 'ru' ? 'Загрузить Excel файл' : 'Excel fayl yuklang')}
                        </span>
                      </button>
                      {customLogins.length > 0 && (
                        <div className="text-sm text-green-600 flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4" />
                          {language === 'ru'
                            ? `Загружено ${customLogins.length} лицевых счетов`
                            : `${customLogins.length} ta shaxsiy hisob yuklandi`}
                        </div>
                      )}
                      <p className="text-xs text-gray-400">
                        {language === 'ru'
                          ? 'Файл должен содержать лицевые счета (логины) в первой колонке'
                          : 'Fayl birinchi ustunda shaxsiy hisoblarni (loginlarni) o\'z ichiga olishi kerak'}
                      </p>
                    </div>
                  )}

                  {/* Target Summary */}
                  {getTargetDescription() && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg text-sm text-green-700">
                      <Target className="w-4 h-4" />
                      {getTargetDescription()}
                    </div>
                  )}
                </div>
              )}

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('announcements.priority')}
                </label>
                <div className="flex gap-2">
                  {(['normal', 'important', 'urgent'] as AnnouncementPriority[]).map((priority) => (
                    <button
                      key={priority}
                      onClick={() => setNewAnnouncement({ ...newAnnouncement, priority })}
                      className={`flex-1 py-2 px-3 rounded-xl font-medium text-sm transition-colors ${
                        newAnnouncement.priority === priority
                          ? getPriorityBadge(priority) + ' border-2'
                          : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                      }`}
                    >
                      {t(`announcements.priority${priority.charAt(0).toUpperCase() + priority.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('announcements.titleLabel')}
                </label>
                <input
                  type="text"
                  value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                  className="glass-input"
                  placeholder={language === 'ru' ? 'Введите заголовок...' : 'Sarlavhani kiriting...'}
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('announcements.content')}
                </label>
                <textarea
                  value={newAnnouncement.content}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                  className="glass-input min-h-[120px] resize-none"
                  placeholder={language === 'ru' ? 'Введите содержание объявления...' : 'E\'lon mazmunini kiriting...'}
                />
              </div>

              {/* Expires At */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('announcements.expiresAt')}
                </label>
                <input
                  type="datetime-local"
                  value={newAnnouncement.expiresAt}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, expiresAt: e.target.value })}
                  className="glass-input"
                />
              </div>

              {/* File Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Paperclip className="w-4 h-4 inline mr-1" />
                  {language === 'ru' ? 'Вложения' : 'Ilovalar'}
                </label>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={isUploadingAttachment}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {isUploadingAttachment ? (
                    <span className="text-sm text-gray-500">{language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}</span>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-gray-500" />
                      <span className="text-sm text-gray-600">
                        {language === 'ru' ? 'Добавить файлы (до 5 МБ)' : 'Fayl qo\'shish (5 MB gacha)'}
                      </span>
                    </>
                  )}
                </button>

                {/* Attachments List */}
                {attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        {getFileIcon(attachment.type)}
                        <span className="flex-1 text-sm text-gray-700 truncate">{attachment.name}</span>
                        <span className="text-xs text-gray-400">{formatFileSize(attachment.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {t('form.cancel')}
                </button>
                <button
                  onClick={handleAddAnnouncement}
                  disabled={!newAnnouncement.title.trim() || !newAnnouncement.content.trim()}
                  className="flex-1 py-3 rounded-xl font-medium bg-orange-400 text-gray-900 hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('form.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Announcement Modal */}
      {showEditModal && editingAnnouncement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold">{language === 'ru' ? 'Редактировать объявление' : 'E\'lonni tahrirlash'}</h2>
              <button
                onClick={() => { setShowEditModal(false); setEditingAnnouncement(null); }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('announcements.titleLabel')}
                </label>
                <input
                  type="text"
                  value={editingAnnouncement.title}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                  className="glass-input"
                  placeholder={t('announcements.titlePlaceholder')}
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('announcements.contentLabel')}
                </label>
                <textarea
                  value={editingAnnouncement.content}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })}
                  className="glass-input min-h-32"
                  placeholder={t('announcements.contentPlaceholder')}
                  rows={4}
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('announcements.priority')}
                </label>
                <div className="flex gap-2">
                  {(['normal', 'important', 'urgent'] as AnnouncementPriority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setEditingAnnouncement({ ...editingAnnouncement, priority: p })}
                      className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                        editingAnnouncement.priority === p
                          ? p === 'urgent' ? 'bg-red-100 text-red-700 ring-2 ring-red-500'
                            : p === 'important' ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500'
                            : 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t(`announcements.priority${p.charAt(0).toUpperCase() + p.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => { setShowEditModal(false); setEditingAnnouncement(null); }}
                  className="flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {t('form.cancel')}
                </button>
                <button
                  onClick={async () => {
                    if (editingAnnouncement) {
                      await updateAnnouncement(editingAnnouncement.id, {
                        title: editingAnnouncement.title,
                        content: editingAnnouncement.content,
                        priority: editingAnnouncement.priority,
                      });
                      setShowEditModal(false);
                      setEditingAnnouncement(null);
                    }
                  }}
                  disabled={!editingAnnouncement.title.trim() || !editingAnnouncement.content.trim()}
                  className="flex-1 py-3 rounded-xl font-medium bg-orange-400 text-gray-900 hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {language === 'ru' ? 'Сохранить' : 'Saqlash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Announcement Card Component with clickable view details
function AnnouncementCard({
  announcement,
  onDelete,
  onEdit,
  formatDate,
  getPriorityIcon,
  getPriorityBadge,
  t,
  canDelete,
  canEdit,
  language,
}: {
  announcement: Announcement;
  onDelete: () => void;
  onEdit: () => void;
  formatDate: (date: string) => string;
  getPriorityIcon: (priority: AnnouncementPriority) => React.ReactNode;
  getPriorityBadge: (priority: AnnouncementPriority) => string;
  t: (key: string) => string;
  canDelete: boolean;
  canEdit?: boolean;
  language: string;
}) {
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const [viewStats, setViewStats] = useState<{ count: number; targetAudienceSize: number; viewPercentage: number } | null>(null);

  const viewCount = announcement.viewCount ?? announcement.viewedBy.length;

  const handleViewClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    setShowViewers(true);
    setIsLoadingViewers(true);

    try {
      const { announcementsApi } = await import('../services/api');
      const result = await announcementsApi.getViews(announcement.id);
      setViewers(result.viewers || []);
      setViewStats({
        count: result.count,
        targetAudienceSize: result.targetAudienceSize,
        viewPercentage: result.viewPercentage
      });
    } catch (error) {
      console.error('Failed to load viewers:', error);
    } finally {
      setIsLoadingViewers(false);
    }
  };

  return (
    <>
      <div className="glass-card p-5 hover:shadow-lg transition-shadow">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${getPriorityBadge(announcement.priority)}`}>
                {getPriorityIcon(announcement.priority)}
                {t(`announcements.priority${announcement.priority.charAt(0).toUpperCase() + announcement.priority.slice(1)}`)}
              </span>
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                announcement.type === 'residents'
                  ? 'bg-green-100 text-green-700'
                  : announcement.type === 'employees'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {announcement.type === 'residents'
                  ? t('announcements.forResidents')
                  : announcement.type === 'employees'
                  ? t('announcements.forStaff')
                  : (language === 'ru' ? 'Для всех' : 'Hammasi uchun')}
              </span>
              {/* Targeting info */}
              {announcement.target && announcement.target.type !== 'all' && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
                  <Target className="w-3 h-3 inline mr-1" />
                  {announcement.target.type === 'building' && (language === 'ru' ? 'ЖК' : 'TJM')}
                  {announcement.target.type === 'entrance' && (language === 'ru' ? 'Подъезд' : 'Kirish')}
                  {announcement.target.type === 'floor' && (language === 'ru' ? 'Этаж' : 'Qavat')}
                  {announcement.target.type === 'custom' && (language === 'ru' ? 'Список' : 'Ro\'yxat')}
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-lg text-gray-900 mb-2">{announcement.title}</h3>

            {/* Content */}
            <p className="text-gray-600 whitespace-pre-wrap">{announcement.content}</p>

            {/* Attachments */}
            {announcement.attachments && announcement.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {announcement.attachments.map((attachment, index) => (
                  <a
                    key={index}
                    href={attachment.url}
                    download={attachment.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {attachment.type.startsWith('image/') ? (
                      <Image className="w-4 h-4 text-blue-500" />
                    ) : attachment.type.includes('pdf') ? (
                      <FileText className="w-4 h-4 text-red-500" />
                    ) : (
                      <File className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="truncate max-w-[150px]">{attachment.name}</span>
                    <Download className="w-4 h-4 text-gray-400" />
                  </a>
                ))}
              </div>
            )}

            {/* Meta */}
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatDate(announcement.createdAt)}
              </span>
              {announcement.authorName && (
                <span>
                  {t('announcements.author')}: {announcement.authorName}
                </span>
              )}
              {/* Clickable view count */}
              <button
                onClick={handleViewClick}
                className={`flex items-center gap-1 ${viewCount > 0 ? 'text-blue-600 hover:text-blue-800 cursor-pointer hover:underline' : 'text-gray-400 cursor-default'}`}
                disabled={viewCount === 0}
              >
                <Eye className="w-4 h-4" />
                {viewCount} {t('announcements.views')}
              </button>
            </div>
          </div>

          {/* Actions - only show for users with edit/delete permissions */}
          {(canEdit || canDelete) && (
            <div className="flex flex-col gap-1">
              {canEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                  title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {canDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Viewers Modal with Statistics */}
      {showViewers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowViewers(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-500" />
                {language === 'ru' ? 'Статистика просмотров' : 'Ko\'rishlar statistikasi'}
              </h3>
              <button onClick={() => setShowViewers(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
              {isLoadingViewers ? (
                <div className="text-center py-8 text-gray-500">
                  {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                </div>
              ) : (
                <>
                  {/* Statistics Summary */}
                  {viewStats && (
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-blue-700">
                          {language === 'ru' ? 'Просмотрели' : 'Ko\'rganlar'}
                        </span>
                        <span className="font-bold text-blue-900">
                          {viewStats.count} / {viewStats.targetAudienceSize}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-blue-200 rounded-full h-3">
                        <div
                          className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(viewStats.viewPercentage, 100)}%` }}
                        />
                      </div>
                      <div className="text-center">
                        <span className="text-2xl font-bold text-blue-900">{viewStats.viewPercentage}%</span>
                        <span className="text-sm text-blue-600 ml-2">
                          {language === 'ru' ? 'от целевой аудитории' : 'maqsadli auditoriyadan'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Viewers List */}
                  {viewers.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      {language === 'ru' ? 'Пока никто не просмотрел' : 'Hali hech kim ko\'rmagan'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-600">
                        {language === 'ru' ? 'Кто просмотрел:' : 'Kim ko\'rgan:'}
                      </h4>
                      {viewers.map((viewer: any) => (
                        <div key={viewer.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div>
                            <p className="font-medium text-gray-900">{viewer.name}</p>
                            <p className="text-sm text-gray-500">
                              {viewer.apartment && `${language === 'ru' ? 'Кв.' : 'Xon.'} ${viewer.apartment}`}
                              {viewer.address && ` • ${viewer.address}`}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(viewer.viewed_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
