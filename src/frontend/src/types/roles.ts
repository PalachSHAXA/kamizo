// ============================================
// РОЛИ И ПРАВА ДОСТУПА
// ============================================

// Расширенные роли
export type ExtendedUserRole =
  | 'super_admin'                // Супер-админ (полный доступ)
  | 'admin'                      // Администратор УК
  | 'director'                   // Директор
  | 'accountant'                 // Бухгалтер
  | 'chief_engineer'             // Главный инженер
  | 'dispatcher'                 // Диспетчер
  | 'manager'                    // Менеджер по работе с жителями
  | 'foreman'                    // Мастер/бригадир
  | 'executor'                   // Исполнитель
  | 'resident'                   // Житель
  | 'owner_representative';      // Представитель собственника

// Разрешение
export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string;
  module: 'crm' | 'requests' | 'workforce' | 'finance' | 'emergency' | 'reports' | 'settings' | 'audit';
  action: 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage';
}

// Роль с правами
export interface Role {
  id: string;
  code: ExtendedUserRole;
  name: string;
  description: string;

  permissions: string[];           // Permission IDs

  // Ограничения по объектам
  buildingScope: 'all' | 'assigned' | 'none';
  canViewFinancials: boolean;
  canViewPersonalData: boolean;
  canExportData: boolean;

  isSystem: boolean;               // Системная роль (нельзя удалить)
  isActive: boolean;

  createdAt: string;
  updatedAt: string;
}

// Лог аудита (расширенный)
export interface AuditLog {
  id: string;

  // Кто
  userId: string;
  userName: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;

  // Что
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'approve' | 'reject' | 'assign' | 'other';
  module: string;
  entityType: string;
  entityId: string;
  entityName?: string;

  // Детали изменений
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  changedFields?: string[];

  // Результат
  status: 'success' | 'failure' | 'partial';
  errorMessage?: string;

  // Контекст
  buildingId?: string;
  requestId?: string;

  timestamp: string;
}

// Labels
export const ROLE_LABELS: Record<ExtendedUserRole, string> = {
  super_admin: 'Супер-администратор',
  admin: 'Администратор',
  director: 'Директор',
  accountant: 'Бухгалтер',
  chief_engineer: 'Главный инженер',
  dispatcher: 'Диспетчер',
  manager: 'Менеджер',
  foreman: 'Мастер',
  executor: 'Исполнитель',
  resident: 'Житель',
  owner_representative: 'Представитель собственника'
};
