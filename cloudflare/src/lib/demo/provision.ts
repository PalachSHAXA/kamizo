import { demoCommerceSeeder } from './commerce';
import { demoCoreSeeder } from './core';
import { demoFinanceSeeder } from './finance';
import { demoEngagementSeeder } from './engagement';
import type {
  DemoDomainSeeder,
  DemoProvisionContext,
  DemoProvisionResult,
  DemoResultCounters,
} from './types';

export type DemoPhase = 'core' | 'commerce' | 'finance' | 'engagement';

const seeders: Record<DemoPhase, DemoDomainSeeder> = {
  core: demoCoreSeeder,
  commerce: demoCommerceSeeder,
  finance: demoFinanceSeeder,
  engagement: demoEngagementSeeder,
};

export interface DemoProvisionSummary {
  results: DemoProvisionResult[];
  counters: DemoResultCounters;
}

export class DemoProvisionError extends Error {
  readonly code = 'DEMO_PROVISION_PHASE_FAILED';

  constructor(
    readonly completedPhases: DemoPhase[],
    readonly failedPhase: DemoPhase,
  ) {
    super('Demo provision failed');
  }
}

function mergeCounters(target: DemoResultCounters, source: DemoResultCounters): void {
  for (const [entity, counter] of Object.entries(source)) {
    const current = target[entity] ?? { created: 0, updated: 0 };
    target[entity] = {
      created: current.created + counter.created,
      updated: current.updated + counter.updated,
    };
  }
}

export async function provisionDemoPhases(
  context: DemoProvisionContext,
  phases: readonly DemoPhase[],
  onPhaseComplete?: (phase: DemoPhase) => Promise<void>,
): Promise<DemoProvisionSummary> {
  const results: DemoProvisionResult[] = [];
  const counters: DemoResultCounters = {};
  const completedPhases: DemoPhase[] = [];
  for (const phase of phases) {
    try {
      const result = await seeders[phase].seed(context);
      results.push(result);
      mergeCounters(counters, result.counters);
      completedPhases.push(phase);
      await onPhaseComplete?.(phase);
    } catch {
      throw new DemoProvisionError(completedPhases, phase);
    }
  }
  return { results, counters };
}
