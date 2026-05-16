import { Phone, Star, Check, Clock, Trash2 } from 'lucide-react';
import { formatName } from '../../../utils/formatName';
import { useLanguageStore } from '../../../stores/languageStore';
import type { StatusTone } from '../../../theme';
import { StatusBadge } from '../../../components/common';
import type { ReactNode } from 'react';
import type { ExecutorSpecialization } from '../../../types';
import {
  type StaffMember,
  ROLE_LABELS_RU, ROLE_LABELS_UZ, ROLE_COLORS,
  SPECIALIZATION_ICONS, SPECIALIZATION_COLORS,
} from './constants';

// Sprint 31: extracted from TeamPage. Compact card for one staff
// member — avatar/specialty icon, name, role chip, status badge,
// phone tel: link, and (for executors) rating + completed count +
// active count.

interface StaffCardProps {
  member: StaffMember;
  onOpen: (m: StaffMember) => void;
  onDelete: (m: StaffMember) => void;
  /** Render the spec label using parent's getSpecLabel so the
   *  translation table stays in one place. */
  getSpecLabel: (spec: ExecutorSpecialization) => string;
  /** Render the status badge using parent's getStatusBadge — the
   *  StatusBadge component needs the parent's StatusTone import. */
  getStatusBadge: (status?: string) => ReactNode;
}

export function StaffCard({ member, onOpen, onDelete, getSpecLabel, getStatusBadge }: StaffCardProps) {
  const { language } = useLanguageStore();
  const ROLE_LABELS = language === 'ru' ? ROLE_LABELS_RU : ROLE_LABELS_UZ;

  return (
    <div
      className="glass-card p-3 sm:p-4 hover:shadow-lg transition-shadow cursor-pointer relative group"
      onClick={() => onOpen(member)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(member); }}
        className="absolute top-2 right-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-40 md:opacity-0 md:group-hover:opacity-100 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
        title={language === 'ru' ? 'Удалить сотрудника' : "Xodimni o'chirish"}
        aria-label={language === 'ru' ? 'Удалить сотрудника' : "Xodimni o'chirish"}
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="flex items-start justify-between mb-2 sm:mb-3 pr-8">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm sm:text-lg font-medium flex-shrink-0 ${
              member.specialization
                ? SPECIALIZATION_COLORS[member.specialization]
                : 'bg-primary-100 text-primary-700'
            }`}
          >
            {member.specialization
              ? SPECIALIZATION_ICONS[member.specialization]
              : member.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm sm:text-base truncate" title={member.name}>
              {formatName(member.name)}
            </h3>
            {member.specialization && (
              <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-500">
                {getSpecLabel(member.specialization)}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[member.role]}`}>
            {ROLE_LABELS[member.role]}
          </span>
          {getStatusBadge(member.status)}
        </div>
      </div>

      <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-600">
        {member.phone && (
          <a
            href={`tel:${member.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 hover:text-primary-600 active:text-primary-700 touch-manipulation"
            aria-label={language === 'ru' ? `Позвонить ${member.phone}` : `Qo'ng'iroq ${member.phone}`}
          >
            <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            {member.phone}
          </a>
        )}
        {(member.role === 'executor' || member.role === 'department_head') && (
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              {member.avg_rating || 0}
            </div>
            <div className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
              {member.completed_count || 0} {language === 'ru' ? 'выполнено' : 'bajarilgan'}
            </div>
            {member.active_count ? (
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-500" />
                {member.active_count} {language === 'ru' ? 'активных' : 'faol'}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export StatusTone so the file is a single import for the parent.
export type { StatusTone };
