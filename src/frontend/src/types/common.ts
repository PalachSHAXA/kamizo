// ============================================
// SHARED TYPES - Used across multiple domains
// ============================================

export type UserRole = 'super_admin' | 'admin' | 'director' | 'manager' | 'department_head' | 'executor' | 'resident' | 'commercial_owner' | 'tenant' | 'advertiser' | 'dispatcher' | 'security' | 'marketplace_manager';
export type ExecutorSpecialization = 'plumber' | 'electrician' | 'elevator' | 'intercom' | 'cleaning' | 'security' | 'trash' | 'boiler' | 'ac' | 'courier' | 'gardener' | 'other';
export type RequestStatus = 'new' | 'assigned' | 'accepted' | 'in_progress' | 'pending_approval' | 'completed' | 'cancelled';
export type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ContractType = 'standard' | 'commercial' | 'temporary';
