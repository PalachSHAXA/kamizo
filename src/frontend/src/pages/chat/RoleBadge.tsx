import type { UserRole } from '../../types';

// Sprint 14: moved out of ChatPage. Renders a colored emoji + role
// label pill next to a sender's name in the message header. The full
// 13-role config table travels with the component because that table
// is only used here — keep it colocated so it doesn't bloat the
// global types or theme files.

const ROLE_CONFIG: Record<
  string,
  { label: string; labelUz: string; emoji: string; bg: string; text: string }
> = {
  super_admin:        { label: 'Супер Админ',     labelUz: 'Super Admin',         emoji: '🛡️', bg: 'bg-purple-50',  text: 'text-purple-700' },
  admin:              { label: 'Админ',           labelUz: 'Admin',               emoji: '🛡️', bg: 'bg-orange-50',  text: 'text-orange-700' },
  manager:            { label: 'Менеджер',        labelUz: 'Menejer',             emoji: '👑', bg: 'bg-purple-50',  text: 'text-purple-700' },
  executor:           { label: 'Исполнитель',     labelUz: 'Ijrochi',             emoji: '🔧', bg: 'bg-amber-50',   text: 'text-amber-700' },
  resident:           { label: 'Житель',          labelUz: 'Turar joy egasi',     emoji: '👤', bg: 'bg-blue-50',    text: 'text-blue-700' },
  tenant:             { label: 'Арендатор',       labelUz: 'Ijarachi',            emoji: '👤', bg: 'bg-green-50',   text: 'text-green-700' },
  commercial_owner:   { label: 'Коммерция',       labelUz: 'Tijorat',             emoji: '🏢', bg: 'bg-yellow-50',  text: 'text-yellow-700' },
  department_head:    { label: 'Глава отдела',    labelUz: "Bo'lim boshlig'i",    emoji: '👑', bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  director:           { label: 'Директор',        labelUz: 'Direktor',            emoji: '👑', bg: 'bg-rose-50',    text: 'text-rose-700' },
  advertiser:         { label: 'Рекламодатель',   labelUz: 'Reklamaberuvchi',     emoji: '📢', bg: 'bg-pink-50',    text: 'text-pink-700' },
  dispatcher:         { label: 'Диспетчер',       labelUz: 'Dispetcher',          emoji: '📞', bg: 'bg-cyan-50',    text: 'text-cyan-700' },
  security:           { label: 'Охранник',        labelUz: "Qo'riqchi",           emoji: '🛡️', bg: 'bg-slate-50',   text: 'text-slate-700' },
  marketplace_manager:{ label: 'Менеджер магазина', labelUz: "Do'kon menejeri",   emoji: '🛒', bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

export function RoleBadge({ role, language }: { role: UserRole; language: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.resident;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-xs font-semibold ${config.bg} ${config.text}`}
    >
      <span>{config.emoji}</span>
      {language === 'ru' ? config.label : config.labelUz}
    </span>
  );
}
