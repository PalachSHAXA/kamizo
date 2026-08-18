export interface DemoProvisionContext {
  db: D1Database;
  tenantId: string;
  tenantSlug: 'demo';
  now: Date;
  createPasswordHash: () => Promise<string>;
}

export interface DemoEntityCounter {
  created: number;
  updated: number;
}

export type DemoResultCounters = Record<string, DemoEntityCounter>;

export interface DemoProvisionResult {
  phase: string;
  counters: DemoResultCounters;
}

export interface DemoDomainSeeder {
  readonly phase: string;
  seed(context: DemoProvisionContext): Promise<DemoProvisionResult>;
}

export interface DemoRoleDescriptor {
  roleKey: string;
  login: string;
  name: string;
  role: string;
  specialization: string | null;
  primary: boolean;
  order: number;
  requiredFeature: string | null;
}
