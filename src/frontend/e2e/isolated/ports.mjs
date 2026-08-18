function hashRunId(runId) {
  let hash = 2166136261;
  for (const character of runId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function portsForRun(runId) {
  if (!/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error('Invalid KAMIZO_E2E_RUN_ID');
  const base = 20_000 + (hashRunId(runId) % 9_000) * 3;
  return { web: base, api: base + 1, redirect: base + 2 };
}

export function configureRunPorts(runId) {
  const ports = portsForRun(runId);
  process.env.KAMIZO_E2E_WEB_PORT = String(ports.web);
  process.env.KAMIZO_E2E_API_PORT = String(ports.api);
  process.env.KAMIZO_E2E_REDIRECT_PORT = String(ports.redirect);
  return ports;
}

export function configuredPorts() {
  return {
    web: Number(process.env.KAMIZO_E2E_WEB_PORT || 5173),
    api: Number(process.env.KAMIZO_E2E_API_PORT || 8787),
    redirect: Number(process.env.KAMIZO_E2E_REDIRECT_PORT || 8790),
  };
}
