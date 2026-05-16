import { ChevronDown, ChevronUp, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/common';
import { useLanguageStore } from '../../../stores/languageStore';
import { StaffCard } from './StaffCard';
import type { StaffMember } from './constants';
import type { ExecutorSpecialization } from '../../../types';

// Sprint 31: extracted from TeamPage. Collapsible section for a
// role group (admins / managers / executors / etc) with a chevron
// header showing the count and StaffCards inside when expanded.

interface StaffSectionProps {
  title: string;
  icon: ReactNode;
  members: StaffMember[];
  expanded: boolean;
  onToggle: () => void;
  onOpenMember: (m: StaffMember) => void;
  onDeleteMember: (m: StaffMember) => void;
  getSpecLabel: (spec: ExecutorSpecialization) => string;
  getStatusBadge: (status?: string) => ReactNode;
}

export function StaffSection({
  title,
  icon,
  members,
  expanded,
  onToggle,
  onOpenMember,
  onDeleteMember,
  getSpecLabel,
  getStatusBadge,
}: StaffSectionProps) {
  const { language } = useLanguageStore();

  return (
    <div className="glass-card overflow-hidden">
      <button
        className="w-full p-3 sm:p-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          {icon}
          <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs sm:text-sm">
            {members.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {expanded && (
        <div className="p-2 sm:p-4">
          {members.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="w-12 h-12" />}
              title={language === 'ru' ? 'Нет сотрудников' : "Xodimlar yo'q"}
              description={
                language === 'ru'
                  ? 'В этой категории пока нет сотрудников'
                  : "Bu toifada hali xodimlar yo'q"
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4">
              {members.map((m) => (
                <StaffCard
                  key={m.id}
                  member={m}
                  onOpen={onOpenMember}
                  onDelete={onDeleteMember}
                  getSpecLabel={getSpecLabel}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
