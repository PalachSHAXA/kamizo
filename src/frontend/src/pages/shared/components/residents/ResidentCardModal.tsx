import { useState, useEffect, useCallback } from 'react';
import {
  X, Key, Copy, Eye, EyeOff,
  MapPin, Home, Phone, CheckCircle, Edit3, Clock,
  FileText, AlertTriangle, Loader2, ChevronDown, ChevronUp, UserX,
  Car, Wallet, CreditCard, Download, Send, ClipboardList, RefreshCw
} from 'lucide-react';
import { usersApi, financeApi } from '../../../../services/api';
import { useToastStore } from '../../../../stores/toastStore';
import type { ResidentCardData } from './types';

// ── Reason options for documented changes ──
const CHANGE_REASONS = [
  { value: 'ownership_sale', ru: 'Смена собственника (купля-продажа)', uz: 'Mulkdor almashishi (oldi-sotdi)' },
  { value: 'ownership_inheritance', ru: 'Смена собственника (наследство)', uz: 'Mulkdor almashishi (meros)' },
  { value: 'ownership_gift', ru: 'Смена собственника (дарение)', uz: 'Mulkdor almashishi (hadya)' },
  { value: 'name_change', ru: 'Изменение ФИО (брак/развод)', uz: "FISh o'zgarishi (nikoh/ajralish)" },
  { value: 'resident_request', ru: 'По запросу жителя', uz: "Yashovchi so'rovi bo'yicha" },
  { value: 'court_decision', ru: 'Решение суда', uz: 'Sud qarori' },
  { value: 'other', ru: 'Другое', uz: 'Boshqa' },
];

// ── Field label map ──
const FIELD_LABELS: Record<string, [string, string]> = {
  name: ['ФИО', 'FISh'],
  phone: ['Телефон', 'Telefon'],
  apartment: ['Квартира', 'Xonadon'],
  password: ['Пароль', 'Parol'],
  status: ['Статус', 'Status'],
};

function formatSum(n: number): string {
  return Math.abs(Math.round(n)).toLocaleString('ru-RU');
}

interface ResidentCardModalProps {
  resident: ResidentCardData;
  currentUserRole: string;
  editingPassword: boolean;
  setEditingPassword: (v: boolean) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  editNameValue: string;
  setEditNameValue: (v: string) => void;
  savingName: boolean;
  nameToast: string;
  getResidentPassword: (resident: ResidentCardData) => string;
  onClose: () => void;
  onDelete: () => void;
  onSavePassword: () => void;
  onSaveName: () => void;
  onCopyToClipboard: (text: string) => void;
  language: string;
}

interface ChangeLogEntry {
  id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  reason: string;
  document_number?: string;
  document_date?: string;
  comment?: string;
  changed_by_name?: string;
  created_at: string;
}

interface FinanceData {
  balance: number;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  loading: boolean;
}

interface ReconciliationAct {
  id: string;
  claim_type: string;
  total_debt: number;
  period_from: string;
  period_to: string;
  created_at: string;
  status?: string;
}

export function ResidentCardModal({
  resident,
  currentUserRole,
  showPassword,
  setShowPassword,
  nameToast,
  getResidentPassword,
  onClose,
  onCopyToClipboard,
  language,
}: ResidentCardModalProps) {
  const t = useCallback((ru: string, uz: string) => language === 'ru' ? ru : uz, [language]);
  const addToast = useToastStore(s => s.addToast);
  const isManager = ['admin', 'director', 'manager', 'super_admin'].includes(currentUserRole);

  // ── Change modal state ──
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeFields, setChangeFields] = useState({ name: false, phone: false, apartment: false, password: false });
  const [changeValues, setChangeValues] = useState({ name: '', phone: '', apartment: '', password: '' });
  const [changeReason, setChangeReason] = useState('');
  const [changeDocNumber, setChangeDocNumber] = useState('');
  const [changeDocDate, setChangeDocDate] = useState('');
  const [changeComment, setChangeComment] = useState('');
  const [changeSaving, setChangeSaving] = useState(false);

  // ── Deactivate state ──
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateComment, setDeactivateComment] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // ── Change history ──
  const [changeHistory, setChangeHistory] = useState<ChangeLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── Finance data ──
  const [financeData, setFinanceData] = useState<FinanceData>({ balance: 0, loading: false });

  // ── Reconciliation ──
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [reconcPeriodFrom, setReconcPeriodFrom] = useState('');
  const [reconcPeriodTo, setReconcPeriodTo] = useState('');
  const [reconcLoading, setReconcLoading] = useState(false);
  const [reconcOneWay, setReconcOneWay] = useState(false);

  // ── Current resident data (may be updated after changes) ──
  const [currentResident, setCurrentResident] = useState(resident);

  // ── Vehicle data ──
  const [vehicles, setVehicles] = useState<Array<{ plate_number?: string; brand_model?: string; color?: string }>>([]);

  // Load finance data
  useEffect(() => {
    const apartmentId = (resident as any).apartmentId || (resident as any).apartment_id;
    if (!apartmentId) return;
    setFinanceData(prev => ({ ...prev, loading: true }));
    financeApi.getApartmentBalance(apartmentId).then(res => {
      const bal = res.balance as any;
      const balance = bal?.balance ?? bal?.total_debt ?? 0;
      // Find last payment from charges_by_month
      let lastPayDate: string | undefined;
      let lastPayAmount: number | undefined;
      if (res.charges_by_month && Array.isArray(res.charges_by_month)) {
        for (let i = res.charges_by_month.length - 1; i >= 0; i--) {
          const m = res.charges_by_month[i] as any;
          if (m.paid && m.paid > 0) {
            lastPayDate = m.period || m.month;
            lastPayAmount = m.paid;
            break;
          }
        }
      }
      setFinanceData({ balance, lastPaymentDate: lastPayDate, lastPaymentAmount: lastPayAmount, loading: false });
    }).catch(() => {
      setFinanceData(prev => ({ ...prev, loading: false }));
    });
  }, [resident]);

  // Load change history
  const loadHistory = useCallback(async () => {
    if (!resident.id) return;
    setHistoryLoading(true);
    try {
      const res = await usersApi.getChangeHistory(resident.id);
      setChangeHistory(res.changes || []);
    } catch {
      setChangeHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [resident.id]);

  useEffect(() => {
    if (showHistory && changeHistory.length === 0) {
      loadHistory();
    }
  }, [showHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset change modal
  const resetChangeModal = () => {
    setChangeFields({ name: false, phone: false, apartment: false, password: false });
    setChangeValues({ name: currentResident.name || '', phone: currentResident.phone || '', apartment: currentResident.apartment || '', password: '' });
    setChangeReason('');
    setChangeDocNumber('');
    setChangeDocDate('');
    setChangeComment('');
  };

  const openChangeModal = () => {
    setChangeValues({
      name: currentResident.name || '',
      phone: currentResident.phone || '',
      apartment: currentResident.apartment || '',
      password: '',
    });
    setShowChangeModal(true);
  };

  // Submit changes
  const handleSubmitChanges = async () => {
    if (!changeReason) {
      addToast('error', t('Укажите основание для изменения', "O'zgartirish uchun asosni ko'rsating"));
      return;
    }

    const changes: Array<{ field: string; value: string }> = [];
    if (changeFields.name && changeValues.name.trim()) changes.push({ field: 'name', value: changeValues.name.trim() });
    if (changeFields.phone) changes.push({ field: 'phone', value: changeValues.phone.trim() });
    if (changeFields.apartment) changes.push({ field: 'apartment', value: changeValues.apartment.trim() });
    if (changeFields.password && changeValues.password.length >= 4) changes.push({ field: 'password', value: changeValues.password });

    if (changes.length === 0) {
      addToast('error', t('Выберите хотя бы одно поле для изменения', "Kamida bitta maydonni o'zgartiring"));
      return;
    }

    if (!resident.id) return;
    setChangeSaving(true);
    try {
      const res = await usersApi.changeWithReason(resident.id, {
        changes,
        reason: changeReason,
        document_number: changeDocNumber || undefined,
        document_date: changeDocDate || undefined,
        comment: changeComment || undefined,
      });
      if (res.user) {
        setCurrentResident(prev => ({
          ...prev,
          name: res.user.name || prev.name,
          phone: res.user.phone || prev.phone,
          apartment: res.user.apartment || prev.apartment,
        }));
      }
      addToast('success', t('Данные жителя обновлены', "Yashovchi ma'lumotlari yangilandi"));
      setShowChangeModal(false);
      resetChangeModal();
      loadHistory();
    } catch (err: any) {
      addToast('error', err.message || t('Ошибка', 'Xatolik'));
    } finally {
      setChangeSaving(false);
    }
  };

  // Handle password reset via change-with-reason
  const handleResetPassword = () => {
    setChangeFields({ name: false, phone: false, apartment: false, password: true });
    setChangeValues({
      name: currentResident.name || '',
      phone: currentResident.phone || '',
      apartment: currentResident.apartment || '',
      password: '',
    });
    setShowChangeModal(true);
  };

  // Handle deactivation
  const handleDeactivate = async () => {
    if (!deactivateReason || !resident.id) return;
    setDeactivating(true);
    try {
      await usersApi.deactivate(resident.id, deactivateReason, deactivateComment || undefined);
      addToast('success', t('Аккаунт деактивирован', 'Akkaunt faolsizlantirildi'));
      setShowDeactivate(false);
      onClose();
    } catch (err: any) {
      addToast('error', err.message || t('Ошибка', 'Xatolik'));
    } finally {
      setDeactivating(false);
    }
  };

  // Handle reconciliation
  const handleReconciliation = async () => {
    const apartmentId = (resident as any).apartmentId || (resident as any).apartment_id;
    if (!apartmentId || !reconcPeriodFrom || !reconcPeriodTo) {
      addToast('error', t('Укажите период', 'Davrni ko\'rsating'));
      return;
    }
    setReconcLoading(true);
    try {
      const res = await financeApi.generateReconciliation({
        apartment_id: apartmentId,
        period_from: reconcPeriodFrom,
        period_to: reconcPeriodTo,
      });
      addToast('success', t('Акт сверки сформирован', 'Solishtirma dalolatnomasi shakllandi'));
      setShowReconciliation(false);
      // If two-way, inform about notification
      if (!reconcOneWay) {
        addToast('info', t('Отправлено жителю на подтверждение', 'Yashovchiga tasdiqlash uchun yuborildi'));
      }
    } catch (err: any) {
      addToast('error', err.message || t('Ошибка', 'Xatolik'));
    } finally {
      setReconcLoading(false);
    }
  };

  const anyFieldSelected = changeFields.name || changeFields.phone || changeFields.apartment || changeFields.password;

  const reasonLabel = (value: string) => {
    const r = CHANGE_REASONS.find(r => r.value === value);
    return r ? (language === 'ru' ? r.ru : r.uz) : value;
  };

  const fieldLabel = (field: string) => {
    const pair = FIELD_LABELS[field];
    return pair ? (language === 'ru' ? pair[0] : pair[1]) : field;
  };

  // Display name
  const displayName = currentResident.name && currentResident.name.trim() && !/^\d+$/.test(currentResident.name.trim())
    ? currentResident.name.trim()
    : t('Не указано', 'Ko\'rsatilmagan');

  return (
    <div className="modal-backdrop items-end sm:items-center">
      <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-bold">{t('Карточка жителя', 'Yashovchi kartasi')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast */}
        {nameToast && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {nameToast}
          </div>
        )}

        {/* ═══ 1. ФИО — large font at top ═══ */}
        <div className="text-center mb-5">
          <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
            <span className="text-2xl font-bold text-white">
              {currentResident.apartment || displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <h3 className="text-xl font-bold text-gray-900">{displayName}</h3>
          {currentResident.address && (
            <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {currentResident.address}
            </p>
          )}
        </div>

        <div className="space-y-2.5 mb-5">
          {/* ═══ 2. Квартира — номер, площадь, тип ═══ */}
          {currentResident.apartment && (
            <div className="p-3.5 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Home className="w-5 h-5 text-gray-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 font-medium">{t('Квартира / Помещение', 'Xonadon / Xona')}</div>
                  <div className="font-bold text-gray-900">{t('кв.', 'xon.')} {currentResident.apartment}</div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ 3. Контакты — телефон ═══ */}
          {currentResident.phone && (
            <div className="p-3.5 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-gray-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 font-medium">{t('Телефон', 'Telefon')}</div>
                  <div className="font-medium text-gray-900">{currentResident.phone}</div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ 4. Л/С (Логин) + копирование ═══ */}
          <div className="p-3.5 bg-primary-50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Key className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="text-xs text-primary-600 font-medium">{t('Л/С (Логин)', 'Sh/H (Login)')}</div>
                  <div className="font-mono font-bold text-primary-900">{currentResident.login}</div>
                </div>
              </div>
              <button onClick={() => onCopyToClipboard(currentResident.login)} className="p-2 hover:bg-primary-100 rounded-lg transition-colors">
                <Copy className="w-4 h-4 text-primary-600" />
              </button>
            </div>
          </div>

          {/* Password — view + copy */}
          <div className="p-3.5 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Key className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">{t('Пароль', 'Parol')}</div>
                  <div className="font-mono font-bold text-gray-900 flex items-center gap-2">
                    {showPassword ? getResidentPassword(currentResident) : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1 hover:bg-gray-200 rounded touch-manipulation">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={() => onCopyToClipboard(getResidentPassword(currentResident))} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <Copy className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* ═══ 5. Финансы ═══ */}
          <div className="p-3.5 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5 text-gray-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500 font-medium">{t('Финансы', 'Moliya')}</div>
                {financeData.loading ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                    <span className="text-xs text-gray-400">{t('Загрузка...', 'Yuklanmoqda...')}</span>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    {financeData.balance > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        {t('Долг', 'Qarz')}: {formatSum(financeData.balance)} {t('сум', 'so\'m')}
                      </span>
                    ) : financeData.balance < 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {t('Переплата', 'Ortiqcha to\'lov')}: {formatSum(financeData.balance)} {t('сум', 'so\'m')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle className="w-3 h-3" />
                        {t('Оплачено', 'To\'langan')}
                      </span>
                    )}
                    {financeData.lastPaymentDate && financeData.lastPaymentAmount && (
                      <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {t('Посл. оплата', 'Oxirgi to\'lov')}: {formatSum(financeData.lastPaymentAmount)} {t('сум', 'so\'m')} ({financeData.lastPaymentDate})
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ 6. Автомобиль ═══ */}
          {(resident as any).vehicle_count > 0 && (
            <div className="p-3.5 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Car className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">{t('Автомобиль', 'Avtomobil')}</div>
                  <div className="text-sm font-medium text-gray-900">
                    {(resident as any).vehicle_count} {t('авто', 'avto')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ 7. Акт сверки ═══ */}
        {isManager && (
          <div className="mb-4">
            <button
              onClick={() => {
                // Set default period: last 12 months
                const now = new Date();
                const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
                setReconcPeriodFrom(`${yearAgo.getFullYear()}-${String(yearAgo.getMonth() + 1).padStart(2, '0')}`);
                setReconcPeriodTo(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                setShowReconciliation(!showReconciliation);
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <span className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                {t('Акт сверки', 'Solishtirma dalolatnomasi')}
              </span>
              {showReconciliation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showReconciliation && (
              <div className="mt-2 p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('Период с', 'Davr boshlanishi')}</label>
                    <input
                      type="month"
                      value={reconcPeriodFrom}
                      onChange={e => setReconcPeriodFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('Период по', 'Davr tugashi')}</label>
                    <input
                      type="month"
                      value={reconcPeriodTo}
                      onChange={e => setReconcPeriodTo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-blue-400 outline-none"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reconcOneWay}
                    onChange={e => setReconcOneWay(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">{t('Односторонний акт', 'Bir tomonlama dalolatnoma')}</span>
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={handleReconciliation}
                    disabled={reconcLoading || !reconcPeriodFrom || !reconcPeriodTo}
                    className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {reconcLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : reconcOneWay ? (
                      <Download className="w-4 h-4" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {reconcOneWay
                      ? t('Сформировать', 'Shakllantirish')
                      : t('Отправить жителю', 'Yashovchiga yuborish')
                    }
                  </button>
                </div>

                {!reconcOneWay && (
                  <p className="text-xs text-gray-400">
                    {t('Двусторонний акт будет отправлен жителю на подтверждение через push-уведомление',
                       'Ikki tomonlama dalolatnoma yashovchiga push-xabar orqali tasdiqlash uchun yuboriladi')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ 8. Change History toggle ═══ */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl mb-3 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {t('История изменений', "O'zgarishlar tarixi")}
            {changeHistory.length > 0 && <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{changeHistory.length}</span>}
          </span>
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showHistory && (
          <div className="mb-4">
            {historyLoading ? (
              <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin text-gray-400" /></div>
            ) : changeHistory.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">{t('Изменений не было', "O'zgarishlar yo'q")}</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {changeHistory.map(entry => (
                  <div key={entry.id} className="p-3 bg-gray-50 rounded-lg text-xs border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-700">{fieldLabel(entry.field_name)}</span>
                      <span className="text-gray-400">{new Date(entry.created_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                    {entry.field_name !== 'password' && (
                      <div className="text-gray-500 mb-1">
                        <span className="line-through text-red-400">{entry.old_value || '—'}</span>
                        {' → '}
                        <span className="text-green-600 font-medium">{entry.new_value || '—'}</span>
                      </div>
                    )}
                    {entry.field_name === 'password' && (
                      <div className="text-gray-500 mb-1">{t('Пароль сброшен', 'Parol tiklandi')}</div>
                    )}
                    <div className="flex items-center gap-1 text-gray-400">
                      <FileText className="w-3 h-3" />
                      {reasonLabel(entry.reason)}
                      {entry.document_number && <span>· №{entry.document_number}</span>}
                    </div>
                    {entry.changed_by_name && (
                      <div className="text-gray-400 mt-0.5">{t('Кем:', 'Kim:')} {entry.changed_by_name}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ 9. Action buttons ═══ */}
        <div className="flex gap-2">
          {isManager && (
            <>
              <button
                onClick={openChangeModal}
                className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5"
              >
                <Edit3 className="w-4 h-4" />
                {t('Изменить', "O'zgartirish")}
              </button>
              <button
                onClick={handleResetPassword}
                className="btn-secondary flex items-center justify-center gap-1.5 text-sm py-2.5 px-3"
              >
                <RefreshCw className="w-4 h-4" />
                {t('Сбросить пароль', 'Parolni tiklash')}
              </button>
            </>
          )}
          <button onClick={onClose} className="btn-primary flex-1 text-sm py-2.5">
            {t('Закрыть', 'Yopish')}
          </button>
        </div>

        {/* ═══ 10. Deactivate link ═══ */}
        {isManager && (
          <button
            onClick={() => setShowDeactivate(true)}
            className="w-full mt-3 text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center gap-1"
          >
            <UserX className="w-3 h-3" />
            {t('Деактивировать аккаунт', 'Akkauntni faolsizlantirish')}
          </button>
        )}
      </div>

      {/* ═══ Change Data Modal ═══ */}
      {showChangeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[300]" onClick={() => setShowChangeModal(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 max-h-[85dvh] overflow-y-auto border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{t('Изменение данных жителя', "Yashovchi ma'lumotlarini o'zgartirish")}</h2>
              <button onClick={() => setShowChangeModal(false)} className="min-w-[44px] min-h-[44px] rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning */}
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-700 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{t(
                'Изменение данных жителя требует документального основания. Все изменения записываются в историю.',
                "Yashovchi ma'lumotlarini o'zgartirish hujjatli asos talab qiladi. Barcha o'zgarishlar tarixga yoziladi."
              )}</span>
            </div>

            <div className="space-y-4">
              {/* Field checkboxes */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{t('Что изменить', "Nimani o'zgartirish")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['name', 'phone', 'apartment', 'password'] as const).map(field => (
                    <label key={field} className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-xl cursor-pointer hover:border-orange-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={changeFields[field]}
                        onChange={e => setChangeFields(prev => ({ ...prev, [field]: e.target.checked }))}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{fieldLabel(field)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* New values — shown per selected checkbox */}
              {changeFields.name && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Новое ФИО', 'Yangi FISh')}</label>
                  <input
                    type="text"
                    value={changeValues.name}
                    onChange={e => setChangeValues(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                    placeholder={t('Фамилия Имя Отчество', 'Familiya Ism Otasining ismi')}
                  />
                </div>
              )}

              {changeFields.phone && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Новый телефон', 'Yangi telefon')}</label>
                  <input
                    type="tel"
                    value={changeValues.phone}
                    onChange={e => setChangeValues(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                    placeholder="+998 90 123 45 67"
                  />
                </div>
              )}

              {changeFields.apartment && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Новая квартира', 'Yangi xonadon')}</label>
                  <input
                    type="text"
                    value={changeValues.apartment}
                    onChange={e => setChangeValues(prev => ({ ...prev, apartment: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                    placeholder="42"
                  />
                </div>
              )}

              {changeFields.password && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Новый пароль', 'Yangi parol')}</label>
                  <input
                    type="text"
                    value={changeValues.password}
                    onChange={e => setChangeValues(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                    placeholder={t('Минимум 4 символа', 'Kamida 4 ta belgi')}
                  />
                  {changeValues.password.length > 0 && changeValues.password.length < 4 && (
                    <p className="text-xs text-red-500 mt-1">{t('Минимум 4 символа', 'Kamida 4 ta belgi')}</p>
                  )}
                </div>
              )}

              {/* Reason (required) */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Основание *', 'Asos *')}</label>
                <select
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                >
                  <option value="">{t('Выберите основание', 'Asosni tanlang')}</option>
                  {CHANGE_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{language === 'ru' ? r.ru : r.uz}</option>
                  ))}
                </select>
              </div>

              {/* Document number + date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Номер документа', 'Hujjat raqami')}</label>
                  <input
                    type="text"
                    value={changeDocNumber}
                    onChange={e => setChangeDocNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                    placeholder="№..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Дата документа', 'Hujjat sanasi')}</label>
                  <input
                    type="date"
                    value={changeDocDate}
                    onChange={e => setChangeDocDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                  />
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Комментарий', 'Izoh')}</label>
                <textarea
                  value={changeComment}
                  onChange={e => setChangeComment(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none resize-none"
                  placeholder={t('Дополнительная информация...', "Qo'shimcha ma'lumot...")}
                />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangeModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 transition-colors"
                >
                  {t('Отмена', 'Bekor')}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitChanges}
                  disabled={changeSaving || !changeReason || !anyFieldSelected}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {changeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {t('Сохранить изменения', "O'zgarishlarni saqlash")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Deactivate Confirm Modal ═══ */}
      {showDeactivate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[300]" onClick={() => setShowDeactivate(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 sm:p-6 border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{t('Деактивация аккаунта', 'Akkauntni faolsizlantirish')}</h3>
                <p className="text-xs text-gray-500">{currentResident.name}</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              {t(
                'Аккаунт жителя будет деактивирован. Житель не сможет войти в систему. Данные сохранятся.',
                "Yashovchi akkauntini faolsizlantiriladi. Yashovchi tizimga kira olmaydi. Ma'lumotlar saqlanadi."
              )}
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Причина *', 'Sabab *')}</label>
                <select
                  value={deactivateReason}
                  onChange={e => setDeactivateReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                >
                  <option value="">{t('Выберите причину', 'Sababni tanlang')}</option>
                  {CHANGE_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{language === 'ru' ? r.ru : r.uz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Комментарий', 'Izoh')}</label>
                <textarea
                  value={deactivateComment}
                  onChange={e => setDeactivateComment(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowDeactivate(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50">
                {t('Отмена', 'Bekor')}
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating || !deactivateReason}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deactivating && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('Деактивировать', 'Faolsizlantirish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
