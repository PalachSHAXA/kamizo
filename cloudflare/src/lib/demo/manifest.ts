import type { DemoRoleDescriptor } from './types';

export const demoRoleManifest = [
  { roleKey: 'director', login: 'demo-director', name: 'Демо Директор', role: 'director', specialization: null, primary: true, order: 10, requiredFeature: null },
  { roleKey: 'manager', login: 'demo-manager', name: 'Дилноза Рахимова', role: 'manager', specialization: null, primary: true, order: 20, requiredFeature: 'requests' },
  { roleKey: 'resident', login: '98765432', name: 'Юсупов Тимур Алишерович', role: 'resident', specialization: null, primary: true, order: 30, requiredFeature: 'requests' },
  { roleKey: 'executor', login: 'demo-executor', name: 'Рустам Ибрагимов', role: 'executor', specialization: 'plumber', primary: true, order: 40, requiredFeature: 'requests' },
  { roleKey: 'security', login: 'demo-security', name: 'Отабек Норматов', role: 'security', specialization: 'security', primary: true, order: 50, requiredFeature: 'qr' },
  { roleKey: 'marketplace_manager', login: 'demo-shop', name: 'Гулнора Тошева', role: 'marketplace_manager', specialization: null, primary: true, order: 60, requiredFeature: 'marketplace' },
  { roleKey: 'admin', login: 'demo-director-admin', name: 'Администратор', role: 'admin', specialization: null, primary: false, order: 70, requiredFeature: null },
  { roleKey: 'department_head', login: 'demo-dept-head', name: 'Нодира Ташпулатова', role: 'department_head', specialization: 'plumber', primary: false, order: 80, requiredFeature: 'requests' },
  { roleKey: 'dispatcher', login: 'demo-dispatcher', name: 'Мадина Хасанова', role: 'dispatcher', specialization: null, primary: false, order: 90, requiredFeature: 'requests' },
  { roleKey: 'electrician', login: 'demo-electrician', name: 'Азиз Мирзаев', role: 'executor', specialization: 'electrician', primary: false, order: 100, requiredFeature: 'requests' },
  { roleKey: 'courier', login: 'demo-courier', name: 'Сардор Алиев', role: 'executor', specialization: 'courier', primary: false, order: 110, requiredFeature: 'marketplace' },
  { roleKey: 'tenant', login: 'demo-tenant', name: 'Лазиз Юлдашев', role: 'tenant', specialization: null, primary: false, order: 120, requiredFeature: 'rentals' },
  { roleKey: 'advertiser', login: 'demo-advertiser', name: 'Камола Саидова', role: 'advertiser', specialization: null, primary: false, order: 130, requiredFeature: 'advertiser' },
] as const satisfies readonly DemoRoleDescriptor[];

export function findDemoRole(roleKey: string): DemoRoleDescriptor | undefined {
  return demoRoleManifest.find((role) => role.roleKey === roleKey);
}
