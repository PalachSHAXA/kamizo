export interface RunContext {
  runDir: string;
  cleanup(): Promise<void>;
}

export function createRunContext(runId?: string): Promise<RunContext>;
export function writePrivateJson(file: string, value: unknown): Promise<void>;
export const PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS: number;
export const INTEGRATION_READY_WAIT: { attempts: number; intervalMs: number; timeoutMs: number; totalTimeoutMs: number };
export const HARNESS_READY_WAIT: { attempts: number; intervalMs: number; timeoutMs: number; totalTimeoutMs: number };
export function readinessBudgetMs(options: { attempts: number; intervalMs: number; timeoutMs: number; totalTimeoutMs?: number }): number;
export function spawnIsolated(bin: string, args: string[], options?: Record<string, unknown>): import('node:child_process').ChildProcess;
