import { configuredPorts } from './ports.mjs';

const PRODUCTION_API_ORIGIN = 'https://api.kamizo.uz';
const ports = configuredPorts();
const LOCAL_API_ORIGIN = `http://127.0.0.1:${ports.api}`;
export const LOCAL_WEB_ORIGIN = `http://127.0.0.1:${ports.web}`;
const TENANT_ORIGINS = new Set([
  LOCAL_WEB_ORIGIN,
  `http://localhost:${ports.web}`,
  'https://demo.kamizo.uz',
]);

export function localApiUrl(input) {
  const url = new URL(input);
  if (url.origin !== PRODUCTION_API_ORIGIN) {
    throw new Error(`Unexpected API origin: ${url.origin}`);
  }
  return `${LOCAL_API_ORIGIN}${url.pathname}${url.search}`;
}

export function apiProxyHeaders(input, tenantOrigin) {
  if (!TENANT_ORIGINS.has(tenantOrigin)) {
    throw new Error(`Unexpected tenant origin: ${tenantOrigin}`);
  }
  const headers = { ...input, origin: tenantOrigin };
  delete headers.host;
  return headers;
}
