export function portsForRun(runId: string): { web: number; api: number; redirect: number };
export function configureRunPorts(runId: string): { web: number; api: number; redirect: number };
export function configuredPorts(): { web: number; api: number; redirect: number };
