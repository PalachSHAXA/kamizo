import type { UserRole } from '../../types';

// Sprint 14 / SW v112 polish: previously a colored emoji + label pill
// (one of 13 bright per-role hues). On a professional B2B SaaS it read
// as toy/casual and dominated the message header, especially in narrow
// admin chat columns where it competed with the sender name.
//
// New shape: neutral themed-surface pill (stone-100/stone-800), 10px
// uppercase label, prefixed with a tiny per-role color dot. The dot
// keeps roles scannable; the neutral background keeps the badge from
// shouting. Labels (RU + UZ) and the 13-role config table preserved —
// only visual treatment changed.

const ROLE_CONFIG: Record<
  string,
  { label: string; labelUz: string; dot: string }
> = {
  super_admin:         { label: 'Супер Админ',       labelUz: 'Super Admin',         dot: 'bg-purple-500' },
  admin:               { label: 'Админ',             labelUz: 'Admin',               dot: 'bg-orange-500' },
  manager:             { label: 'Менеджер',          labelUz: 'Menejer',             dot: 'bg-violet-500' },
  executor:            { label: 'Исполнитель',       labelUz: 'Ijrochi',             dot: 'bg-amber-500' },
  resident:            { label: 'Житель',            labelUz: 'Turar joy egasi',     dot: 'bg-blue-500' },
  tenant:              { label: 'Арендатор',         labelUz: 'Ijarachi',            dot: 'bg-green-500' },
  commercial_owner:    { label: 'Коммерция',         labelUz: 'Tijorat',             dot: 'bg-yellow-500' },
  department_head:     { label: 'Глава отдела',      labelUz: "Bo'lim boshlig'i",    dot: 'bg-indigo-500' },
  director:            { label: 'Директор',          labelUz: 'Direktor',            dot: 'bg-rose-500' },
  advertiser:          { label: 'Рекламодатель',     labelUz: 'Reklamaberuvchi',     dot: 'bg-pink-500' },
  dispatcher:          { label: 'Диспетчер',         labelUz: 'Dispetcher',          dot: 'bg-cyan-500' },
  security:            { label: 'Охранник',          labelUz: "Qo'riqchi",           dot: 'bg-slate-500' },
  marketplace_manager: { label: 'Менеджер магазина', labelUz: "Do'kon menejeri",     dot: 'bg-emerald-500' },
};

export function RoleBadge({ role, language }: { role: UserRole; language: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.resident;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px] font-semibold uppercase tracking-wide"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {language === 'ru' ? config.label : config.labelUz}
    </span>
  );
}
