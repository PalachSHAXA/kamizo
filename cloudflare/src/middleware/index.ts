// Middleware barrel file
// All middleware is extracted and ready for route modules to import

export { getUser } from './auth';
export { setCorsOrigin, getCurrentCorsOrigin, corsHeaders, handleCorsPreflightResponse } from './cors';
export { checkRateLimit, getClientIdentifier, RATE_LIMITS } from './rateLimit';
export { getTenantId, setTenantForRequest, setCurrentTenant, getCurrentTenant, getTenantForRequest, getTenantSlug } from './tenant';
export { getCached, setCache, invalidateCache } from './cache-local';
