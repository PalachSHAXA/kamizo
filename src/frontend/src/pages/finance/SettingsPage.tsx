import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Plus, Trash2, Shield, Eye, CreditCard, AlertTriangle } from 'lucide-react';
import { useFinanceStore } from '../../stores/financeStore';
import { useLanguageStore } from '../../stores/languageStore';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';
import { teamApi } from '../../services/api';

interface UserItem {
  id: string;
  name: string;
  role: string;
}

const ALLOWED_ROLES = ['manager', 'executor', 'department_head', 'plumber', 'electrician'];

export default function SettingsPage() {
  const { language } = useLanguageStore();
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  const { financeAccess, accessLoading, fetchFinanceAccess, grantAccess, revokeAccess } = useFinanceStore();

  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'full' | 'payments_only' | 'view_only'>('view_only');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadError(false);
        await fetchFinanceAccess();
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, [fetchFinanceAccess]);

  const openModal = useCallback(async () => {
    setModalOpen(true);
    setSelectedUserId('');
    setSelectedLevel('view_only');
    setUsersLoading(true);
    try {
      const data = await teamApi.getAll();
      // Combine all staff categories into one flat list
      const allStaff: UserItem[] = [
        ...(data.managers || []).map((u: any) => ({ id: u.id, name: u.name, role: u.role || 'manager' })),
        ...(data.departmentHeads || []).map((u: any) => ({ id: u.id, name: u.name, role: u.role || 'department_head' })),
        ...(data.executors || []).map((u: any) => ({ id: u.id, name: u.name, role: u.role || 'executor' })),
      ];
      // Exclude users who already have access
      const existingUserIds = new Set(financeAccess.map((a: any) => a.user_id));
      setUsers(allStaff.filter((u) => !existingUserIds.has(u.id)));
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [financeAccess]);

  const handleGrant = useCallback(async () => {
    if (!selectedUserId) return;
    setSubmitting(true);
    try {
      await grantAccess(selectedUserId, selectedLevel);
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }, [selectedUserId, selectedLevel, grantAccess]);

  const handleRevoke = useCallback(async (id: string, userName: string) => {
    const confirmed = window.confirm(
      t(
        `Вы уверены, что хотите отозвать доступ у ${userName}?`,
        `${userName} uchun ruxsatni bekor qilmoqchimisiz?`
      )
    );
    if (!confirmed) return;
    await revokeAccess(id);
  }, [revokeAccess, t]);

  const translateRole = (role: string) => {
    const map: Record<string, [string, string]> = {
      manager: ['Менеджер', 'Menejer'],
      executor: ['Исполнитель', 'Ijrochi'],
      department_head: ['Нач. отдела', 'Bo\'lim boshlig\'i'],
      plumber: ['Сантехник', 'Santexnik'],
      electrician: ['Электрик', 'Elektrik'],
      admin: ['Админ', 'Admin'],
      director: ['Директор', 'Direktor'],
      resident: ['Житель', 'Turar joy egasi'],
      super_admin: ['Суперадмин', 'Superadmin'],
    };
    const pair = map[role];
    return pair ? t(pair[0], pair[1]) : role;
  };

  const accessLevelBadge = (level: string) => {
    switch (level) {
      case 'full':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <Shield className="w-3 h-3" />
            {t('Полный доступ', 'To\'liq ruxsat')}
          </span>
        );
      case 'payments_only':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
            <CreditCard className="w-3 h-3" />
            {t('Только платежи', 'Faqat to\'lovlar')}
          </span>
        );
      case 'view_only':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            <Eye className="w-3 h-3" />
            {t('Только просмотр', 'Faqat ko\'rish')}
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (accessLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('Настройки доступа', 'Ruxsat sozlamalari')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Управление доступом к финансовому модулю', 'Moliya moduliga kirish boshqaruvi')}
          </p>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('Дать доступ', 'Ruxsat berish')}
        </button>
      </div>

      {/* Table / Empty */}
      {loadError && financeAccess.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12" />}
          title={t('Ошибка загрузки', 'Yuklashda xatolik')}
          description={t('Попробуйте обновить страницу', 'Sahifani yangilang')}
        />
      ) : financeAccess.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-12 h-12" />}
          title={t('Нет записей доступа', 'Ruxsat yozuvlari yo\'q')}
          description={t(
            'Нажмите «Дать доступ», чтобы предоставить сотрудникам доступ к финансам',
            '«Ruxsat berish» tugmasini bosib, xodimlarga moliyaga kirish huquqini bering'
          )}
        />
      ) : (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    {t('Сотрудник', 'Xodim')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    {t('Роль', 'Lavozim')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    {t('Уровень доступа', 'Ruxsat darajasi')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    {t('Кем выдан', 'Kim tomonidan')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    {t('Дата', 'Sana')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">
                    {t('Действия', 'Amallar')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {financeAccess.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.user_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                        {translateRole(item.user_role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{accessLevelBadge(item.access_level)}</td>
                    <td className="px-4 py-3 text-gray-600">{item.granted_by_name}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(item.granted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(item.id, item.user_name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('Отозвать', 'Bekor qilish')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grant Access Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('Дать доступ', 'Ruxsat berish')} size="md">
        <div className="space-y-5">
          {/* User select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('Сотрудник', 'Xodim')}
            </label>
            {usersLoading ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
              >
                <option value="">{t('Выберите сотрудника...', 'Xodimni tanlang...')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {translateRole(u.role)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Access level radios */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('Уровень доступа', 'Ruxsat darajasi')}
            </label>
            <div className="space-y-2">
              {([
                {
                  value: 'full' as const,
                  icon: Shield,
                  color: 'text-green-600',
                  bg: 'border-green-200 bg-green-50/50',
                  label: t('Полный доступ', 'To\'liq ruxsat'),
                  desc: t('Просмотр, создание платежей, управление настройками', 'Ko\'rish, to\'lovlar yaratish, sozlamalarni boshqarish'),
                },
                {
                  value: 'payments_only' as const,
                  icon: CreditCard,
                  color: 'text-primary-600',
                  bg: 'border-primary-200 bg-primary-50/50',
                  label: t('Только платежи', 'Faqat to\'lovlar'),
                  desc: t('Просмотр и создание платежей', 'Ko\'rish va to\'lovlar yaratish'),
                },
                {
                  value: 'view_only' as const,
                  icon: Eye,
                  color: 'text-gray-600',
                  bg: 'border-gray-200 bg-gray-50/50',
                  label: t('Только просмотр', 'Faqat ko\'rish'),
                  desc: t('Просмотр финансовых данных без изменений', 'Moliyaviy ma\'lumotlarni o\'zgartirishsiz ko\'rish'),
                },
              ]).map((opt) => {
                const Icon = opt.icon;
                const selected = selectedLevel === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected ? opt.bg : 'border-gray-100 hover:bg-gray-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="access_level"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setSelectedLevel(opt.value)}
                      className="mt-0.5"
                    />
                    <Icon className={`w-5 h-5 mt-0.5 ${opt.color}`} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleGrant}
            disabled={!selectedUserId || submitting}
            className="w-full py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? t('Сохранение...', 'Saqlanmoqda...')
              : t('Предоставить доступ', 'Ruxsat berish')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
