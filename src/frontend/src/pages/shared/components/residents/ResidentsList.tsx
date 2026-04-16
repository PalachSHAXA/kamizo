import { useState, useEffect, useMemo } from 'react';
import {
  Users, Search, MapPin, Key, Trash2, Check,
  ChevronRight, Home, Phone, Loader2,
  Car, FileText, Shield, LogIn, Wallet
} from 'lucide-react';
import { EmptyState } from '../../../../components/common';
import { financeApi } from '../../../../services/api';
import { formatName } from '../../../../utils/formatName';
import { plural } from '../../../../utils/plural';
import type { MappedResident } from './types';

interface ResidentsListProps {
  filteredResidents: MappedResident[];
  isLoadingResidents: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onResidentClick: (resident: MappedResident) => void;
  onDeleteAllClick: () => void;
  language: string;
}

// Format number with spaces for thousands
function formatSum(n: number): string {
  return Math.abs(Math.round(n)).toLocaleString('ru-RU');
}

export function ResidentsList({
  filteredResidents,
  isLoadingResidents,
  searchQuery,
  setSearchQuery,
  onResidentClick,
  onDeleteAllClick,
  language,
}: ResidentsListProps) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 input-field">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder={t('Поиск по имени, телефону, квартире...', 'Ism, telefon, xonadon bo\'yicha qidirish...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
      </div>

      {/* Residents count and actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {t('Найдено', 'Topildi')}: <strong>{filteredResidents.length}</strong>{' '}
          {plural(
            language === 'ru' ? 'ru' : 'uz',
            filteredResidents.length,
            { one: 'житель', few: 'жителя', many: 'жителей' },
            { one: 'yashovchi', other: 'yashovchi' }
          )}
        </div>
        {filteredResidents.length > 0 && (
          <button
            onClick={onDeleteAllClick}
            className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            {t('Удалить всех', 'Hammasini o\'chirish')}
          </button>
        )}
      </div>

      {/* List */}
      {isLoadingResidents ? (
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
          <p className="text-gray-500">{t('Загрузка жителей...', 'Yashovchilar yuklanmoqda...')}</p>
        </div>
      ) : filteredResidents.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={t('Нет жильцов', 'Aholilar yo\'q')}
          description={t('Загрузите Excel файл с данными жителей', 'Yashovchilar ma\'lumotlari bilan Excel faylni yuklang')}
        />
      ) : (
        filteredResidents.map((resident) => {
          const hasContract = !!resident.contract_signed_at;
          const hasVehicle = (resident.vehicle_count || 0) > 0;
          const hasPhone = !!resident.phone;
          const hasChangedPassword = !!resident.password_changed_at;
          const hasLoggedIn = !!resident.last_login_at;
          const completedTasks = [hasContract, hasVehicle, hasPhone, hasChangedPassword, hasLoggedIn].filter(Boolean).length;
          const totalTasks = 5;

          // Display name — ФИО first (normalize ALL CAPS → Title Case), fallback to "Не указано"
          const displayName = resident.name && resident.name.trim() && !/^\d+$/.test(resident.name.trim())
            ? formatName(resident.name.trim())
            : null;

          return (
          <div
            key={resident.login}
            className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => onResidentClick(resident)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Avatar with apartment number */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm">
                    {resident.apartment || '—'}
                  </div>
                  {completedTasks === totalTasks && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
                      <Check className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {/* ФИО — bold, primary text */}
                  {displayName ? (
                    <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
                  ) : (
                    <h3 className="text-sm text-gray-400 italic">{t('Не указано', 'Ko\'rsatilmagan')}</h3>
                  )}

                  {/* Address line */}
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    {resident.address && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 truncate max-w-[240px]">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{resident.address}</span>
                      </span>
                    )}
                    {!resident.address && resident.apartment && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Home className="w-3 h-3" />
                        {t('кв.', 'xon.')} {resident.apartment}
                      </span>
                    )}
                  </div>

                  {/* Phone */}
                  {resident.phone && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      {resident.phone}
                    </div>
                  )}

                  {/* Progress badges */}
                  <div className="flex items-center gap-1 mt-1.5">
                    {/* Contract signed */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasContract ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasContract ? t('Договор подписан', 'Shartnoma imzolangan') : t('Договор не подписан', 'Shartnoma imzolanmagan')}>
                      <FileText className={`w-3 h-3 ${hasContract ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Has vehicle */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasVehicle ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasVehicle ? t('Автомобиль добавлен', 'Avtomobil qo\'shilgan') : t('Нет автомобиля', 'Avtomobil yo\'q')}>
                      <Car className={`w-3 h-3 ${hasVehicle ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Phone */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasPhone ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasPhone ? `${t('Телефон', 'Telefon')}: ${resident.phone}` : t('Телефон не указан', 'Telefon ko\'rsatilmagan')}>
                      <Phone className={`w-3 h-3 ${hasPhone ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Password changed */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasChangedPassword ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasChangedPassword ? t('Пароль изменён', 'Parol o\'zgartirilgan') : t('Пароль не менялся', 'Parol o\'zgartirilmagan')}>
                      <Shield className={`w-3 h-3 ${hasChangedPassword ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Logged in */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasLoggedIn ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasLoggedIn ? `${t('Последний вход', 'Oxirgi kirish')}: ${new Date(resident.last_login_at!).toLocaleDateString('ru-RU')}` : t('Ещё не входил в систему', 'Hali tizimga kirmagan')}>
                      <LogIn className={`w-3 h-3 ${hasLoggedIn ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    <span className="text-xs text-gray-400 ml-1">{completedTasks}/{totalTasks}</span>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </div>
          </div>
          );
        })
      )}
    </div>
  );
}
