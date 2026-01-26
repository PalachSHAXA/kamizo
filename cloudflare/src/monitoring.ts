/**
 * Advanced Monitoring & Metrics System
 *
 * Features:
 * - Error tracking and reporting
 * - Performance metrics collection
 * - Request/response logging
 * - Health checks
 * - Alert triggers
 */

export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface ErrorLog {
  message: string;
  stack?: string;
  endpoint: string;
  method: string;
  userId?: string;
  timestamp: number;
  userAgent?: string;
  ip?: string;
  requestId?: string;
}

export interface PerformanceMetric {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: number;
  userId?: string;
  cached?: boolean;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: number;
  checks: {
    database: boolean;
    cache: boolean;
    websocket: boolean;
  };
  metrics: {
    avgResponseTime: number;
    errorRate: number;
    activeConnections: number;
  };
}

/**
 * In-memory metrics aggregator
 * Collects metrics for the current isolate
 */
class MetricsAggregator {
  private metrics: MetricData[] = [];
  private errors: ErrorLog[] = [];
  private perfMetrics: PerformanceMetric[] = [];
  private maxStoredMetrics = 1000;

  addMetric(name: string, value: number, tags?: Record<string, string>) {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      tags,
    });

    // Keep only recent metrics
    if (this.metrics.length > this.maxStoredMetrics) {
      this.metrics = this.metrics.slice(-this.maxStoredMetrics);
    }
  }

  logError(error: ErrorLog) {
    this.errors.push(error);

    // Keep only recent errors
    if (this.errors.length > this.maxStoredMetrics) {
      this.errors = this.errors.slice(-this.maxStoredMetrics);
    }
  }

  logPerformance(metric: PerformanceMetric) {
    this.perfMetrics.push(metric);

    // Keep only recent performance metrics
    if (this.perfMetrics.length > this.maxStoredMetrics) {
      this.perfMetrics = this.perfMetrics.slice(-this.maxStoredMetrics);
    }
  }

  getMetrics(name?: string): MetricData[] {
    if (name) {
      return this.metrics.filter(m => m.name === name);
    }
    return this.metrics;
  }

  getErrors(): ErrorLog[] {
    return this.errors;
  }

  getPerformanceMetrics(endpoint?: string): PerformanceMetric[] {
    if (endpoint) {
      return this.perfMetrics.filter(m => m.endpoint === endpoint);
    }
    return this.perfMetrics;
  }

  getAggregatedStats() {
    const now = Date.now();
    const last5Min = now - 5 * 60 * 1000;

    const recentPerf = this.perfMetrics.filter(m => m.timestamp > last5Min);
    const recentErrors = this.errors.filter(e => e.timestamp > last5Min);

    const totalRequests = recentPerf.length;
    const errorCount = recentErrors.length;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    const avgResponseTime = totalRequests > 0
      ? recentPerf.reduce((sum, m) => sum + m.duration, 0) / totalRequests
      : 0;

    const p95ResponseTime = this.calculatePercentile(
      recentPerf.map(m => m.duration),
      0.95
    );

    const p99ResponseTime = this.calculatePercentile(
      recentPerf.map(m => m.duration),
      0.99
    );

    // Group by endpoint
    const endpointStats = recentPerf.reduce((acc, m) => {
      if (!acc[m.endpoint]) {
        acc[m.endpoint] = { count: 0, totalTime: 0, errors: 0 };
      }
      acc[m.endpoint].count++;
      acc[m.endpoint].totalTime += m.duration;
      if (m.statusCode >= 400) {
        acc[m.endpoint].errors++;
      }
      return acc;
    }, {} as Record<string, { count: number; totalTime: number; errors: number }>);

    return {
      period: '5min',
      totalRequests,
      errorCount,
      errorRate: Math.round(errorRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: Math.round(p95ResponseTime),
      p99ResponseTime: Math.round(p99ResponseTime),
      endpointStats: Object.entries(endpointStats).map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgTime: Math.round(stats.totalTime / stats.count),
        errorRate: Math.round((stats.errors / stats.count) * 100 * 100) / 100,
      })),
      recentErrors: recentErrors.slice(-10).map(e => ({
        message: e.message,
        endpoint: e.endpoint,
        timestamp: new Date(e.timestamp).toISOString(),
      })),
    };
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index] || 0;
  }

  clear() {
    this.metrics = [];
    this.errors = [];
    this.perfMetrics = [];
  }
}

export const metricsAggregator = new MetricsAggregator();

/**
 * Middleware для логирования всех запросов
 */
export async function withMonitoring(
  request: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const endpoint = url.pathname;
  const method = request.method;
  const requestId = crypto.randomUUID();

  let response: Response;
  let error: Error | null = null;

  try {
    response = await handler();
  } catch (e) {
    error = e as Error;

    // Log error
    metricsAggregator.logError({
      message: error.message,
      stack: error.stack,
      endpoint,
      method,
      timestamp: Date.now(),
      userAgent: request.headers.get('User-Agent') || undefined,
      ip: request.headers.get('CF-Connecting-IP') || undefined,
      requestId,
    });

    // Return 500 response with detailed error message
    response = new Response(
      JSON.stringify({
        error: error.message || 'Internal Server Error',
        requestId,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const duration = Date.now() - startTime;

  // Log performance metric
  metricsAggregator.logPerformance({
    endpoint,
    method,
    duration,
    statusCode: response.status,
    timestamp: Date.now(),
    cached: response.headers.get('X-Cache-Status') === 'HIT',
  });

  // Add monitoring headers
  const monitoredResponse = new Response(response.body, response);
  monitoredResponse.headers.set('X-Request-ID', requestId);
  monitoredResponse.headers.set('X-Response-Time', `${duration}ms`);

  // Alert on slow requests (>1s)
  if (duration > 1000) {
    console.warn(`[ALERT] Slow request: ${method} ${endpoint} took ${duration}ms`);
    metricsAggregator.addMetric('slow_request', duration, { endpoint, method });
  }

  // Alert on errors
  if (response.status >= 500) {
    console.error(`[ALERT] Server error: ${method} ${endpoint} returned ${response.status}`);
    metricsAggregator.addMetric('server_error', 1, { endpoint, method, status: String(response.status) });
  }

  return monitoredResponse;
}

/**
 * Health check функция
 */
export async function healthCheck(env: any): Promise<HealthCheck> {
  const checks = {
    database: false,
    cache: false,
    websocket: false,
  };

  // Check D1 database
  try {
    await env.DB.prepare('SELECT 1').first();
    checks.database = true;
  } catch (e) {
    console.error('[Health] Database check failed:', e);
  }

  // Check KV cache
  try {
    await env.RATE_LIMITER.put('health_check', 'ok', { expirationTtl: 10 });
    const value = await env.RATE_LIMITER.get('health_check');
    checks.cache = value === 'ok';
  } catch (e) {
    console.error('[Health] Cache check failed:', e);
  }

  // Check Durable Objects (WebSocket)
  try {
    // Just check if we can get a stub
    const id = env.CONNECTION_MANAGER.idFromName('health_check');
    const stub = env.CONNECTION_MANAGER.get(id);
    checks.websocket = !!stub;
  } catch (e) {
    console.error('[Health] WebSocket check failed:', e);
  }

  const stats = metricsAggregator.getAggregatedStats();

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'down' = 'healthy';

  if (!checks.database) {
    status = 'down';
  } else if (!checks.cache || !checks.websocket) {
    status = 'degraded';
  } else if (stats.errorRate > 5 || stats.avgResponseTime > 500) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: Date.now(),
    checks,
    metrics: {
      avgResponseTime: stats.avgResponseTime,
      errorRate: stats.errorRate,
      activeConnections: 0, // Will be updated by ConnectionManager
    },
  };
}

/**
 * Alert helpers
 */
export class AlertManager {
  private static lastAlerts: Map<string, number> = new Map();
  private static alertCooldown = 5 * 60 * 1000; // 5 minutes

  static async sendAlert(
    type: 'error' | 'warning' | 'info',
    message: string,
    details?: Record<string, any>
  ) {
    const alertKey = `${type}:${message}`;
    const lastAlert = this.lastAlerts.get(alertKey);
    const now = Date.now();

    // Prevent alert spam - only send same alert once per cooldown period
    if (lastAlert && now - lastAlert < this.alertCooldown) {
      return;
    }

    this.lastAlerts.set(alertKey, now);

    // Log to console
    const logFn = type === 'error' ? console.error : type === 'warning' ? console.warn : console.info;
    logFn(`[ALERT:${type.toUpperCase()}] ${message}`, details || '');

    // In production, you would send to:
    // - Sentry (errors)
    // - Slack/Discord webhook
    // - Email
    // - PagerDuty
    // - Custom webhook

    // Example: Send to webhook (implement in production)
    // await fetch('https://your-webhook-url', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ type, message, details, timestamp: now }),
    // });
  }

  static checkThresholds(stats: any) {
    // High error rate alert
    if (stats.errorRate > 10) {
      this.sendAlert('error', 'High error rate detected', {
        errorRate: stats.errorRate,
        threshold: 10,
      });
    }

    // Slow response time alert
    if (stats.avgResponseTime > 1000) {
      this.sendAlert('warning', 'High average response time', {
        avgResponseTime: stats.avgResponseTime,
        threshold: 1000,
      });
    }

    // P99 response time alert
    if (stats.p99ResponseTime > 2000) {
      this.sendAlert('warning', 'High P99 response time', {
        p99ResponseTime: stats.p99ResponseTime,
        threshold: 2000,
      });
    }
  }
}

/**
 * Cloudflare Analytics Event Logger
 */
export function logAnalyticsEvent(
  request: Request,
  eventName: string,
  data?: Record<string, any>
) {
  // Cloudflare Workers Analytics Engine integration
  // See: https://developers.cloudflare.com/analytics/analytics-engine/

  const event = {
    timestamp: Date.now(),
    event: eventName,
    url: new URL(request.url).pathname,
    method: request.method,
    userAgent: request.headers.get('User-Agent'),
    country: request.headers.get('CF-IPCountry'),
    ...data,
  };

  // Log to console for now (implement Analytics Engine in production)
  console.log('[Analytics]', JSON.stringify(event));

  // In production with Analytics Engine:
  // env.ANALYTICS.writeDataPoint({
  //   indexes: [eventName],
  //   blobs: [JSON.stringify(event)],
  //   doubles: [data?.value || 0],
  // });
}
