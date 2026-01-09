/**
 * Production-Grade Error Handling System
 *
 * Provides:
 * - Custom error classes with proper typing
 * - Structured error responses
 * - Error logging and tracking
 * - User-friendly error messages
 * - Stack trace sanitization for production
 */

// ============================================
// ERROR CLASSES
// ============================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    // captureStackTrace is Node.js specific, not available in Cloudflare Workers
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, true, context);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Неверный логин или пароль', context?: Record<string, any>) {
    super(message, 401, true, context);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Недостаточно прав для выполнения действия', context?: Record<string, any>) {
    super(message, 403, true, context);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, context?: Record<string, any>) {
    super(`${resource} не найден`, 404, true, context);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, true, context);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, context?: Record<string, any>) {
    super('Слишком много запросов. Попробуйте позже.', 429, true, context);
    this.retryAfter = retryAfter;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(`Ошибка базы данных: ${message}`, 500, false, context);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, context?: Record<string, any>) {
    super(`Сервис ${service} временно недоступен`, 503, true, context);
  }
}

// ============================================
// ERROR RESPONSE BUILDER
// ============================================

interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    timestamp: string;
    requestId?: string;
    details?: any;
    stack?: string;
  };
}

export function buildErrorResponse(
  error: Error | AppError,
  requestId?: string,
  includeStack: boolean = false
): ErrorResponse {
  const isAppError = error instanceof AppError;

  const response: ErrorResponse = {
    error: {
      message: error.message || 'Произошла ошибка',
      code: error.name || 'INTERNAL_ERROR',
      statusCode: isAppError ? error.statusCode : 500,
      timestamp: new Date().toISOString(),
    },
  };

  if (requestId) {
    response.error.requestId = requestId;
  }

  // Add context for operational errors
  if (isAppError && error.context) {
    response.error.details = error.context;
  }

  // Include stack trace only in development or for debugging
  if (includeStack && error.stack) {
    response.error.stack = sanitizeStackTrace(error.stack);
  }

  return response;
}

// ============================================
// STACK TRACE SANITIZATION
// ============================================

function sanitizeStackTrace(stack: string): string {
  // Remove sensitive file paths in production
  return stack
    .split('\n')
    .map(line => {
      // Remove absolute paths, keep relative ones
      return line.replace(/\/.*?\/cloudflare\/src/g, 'src');
    })
    .slice(0, 5) // Limit to first 5 lines
    .join('\n');
}

// ============================================
// ERROR LOGGER
// ============================================

export interface ErrorLogEntry {
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  request: {
    method: string;
    url: string;
    ip?: string;
    userAgent?: string;
    userId?: string;
  };
  context?: Record<string, any>;
  isOperational: boolean;
}

export class ErrorLogger {
  private static logs: ErrorLogEntry[] = [];
  private static readonly MAX_LOGS = 1000;

  static log(
    error: Error | AppError,
    request: Request,
    userId?: string,
    context?: Record<string, any>
  ): ErrorLogEntry {
    const isAppError = error instanceof AppError;

    const entry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: request.method,
        url: request.url,
        ip: request.headers.get('CF-Connecting-IP') || undefined,
        userAgent: request.headers.get('User-Agent') || undefined,
        userId,
      },
      context: isAppError ? { ...error.context, ...context } : context,
      isOperational: isAppError ? error.isOperational : false,
    };

    // Store in memory (limited to MAX_LOGS)
    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift(); // Remove oldest
    }

    // Log to console with proper severity
    if (!isAppError || !error.isOperational) {
      // Critical/unexpected errors
      console.error('🔴 CRITICAL ERROR:', {
        message: error.message,
        name: error.name,
        url: request.url,
        userId,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      });
    } else if (error.statusCode >= 500) {
      // Server errors
      console.error('🟠 SERVER ERROR:', {
        message: error.message,
        url: request.url,
        userId,
      });
    } else if (error.statusCode >= 400) {
      // Client errors (less severe)
      console.warn('🟡 CLIENT ERROR:', {
        message: error.message,
        url: request.url,
        userId,
      });
    }

    return entry;
  }

  static getLogs(limit: number = 100, severity?: 'critical' | 'server' | 'client'): ErrorLogEntry[] {
    let filtered = this.logs;

    if (severity) {
      filtered = this.logs.filter(log => {
        if (severity === 'critical') return !log.isOperational;
        if (severity === 'server') return log.isOperational && log.error.name.includes('Server');
        if (severity === 'client') return log.isOperational;
        return true;
      });
    }

    return filtered.slice(-limit).reverse();
  }

  static clear(): void {
    this.logs = [];
  }

  static getStats(): {
    total: number;
    byType: Record<string, number>;
    critical: number;
  } {
    const byType: Record<string, number> = {};
    let critical = 0;

    this.logs.forEach(log => {
      byType[log.error.name] = (byType[log.error.name] || 0) + 1;
      if (!log.isOperational) critical++;
    });

    return {
      total: this.logs.length,
      byType,
      critical,
    };
  }
}

// ============================================
// ERROR HANDLER MIDDLEWARE
// ============================================

export async function handleError(
  error: Error | AppError,
  request: Request,
  env?: any,
  userId?: string
): Promise<Response> {
  // Log the error
  ErrorLogger.log(error, request, userId);

  // Send to external monitoring (optional)
  if (env?.SENTRY_DSN) {
    await sendToSentry(error, request, env.SENTRY_DSN);
  }

  // Build response
  const isProduction = env?.ENVIRONMENT === 'production';
  const errorResponse = buildErrorResponse(
    error,
    crypto.randomUUID(), // Request ID for tracking
    !isProduction // Include stack only in dev
  );

  // Determine status code
  const statusCode = error instanceof AppError ? error.statusCode : 500;

  // Add retry-after header for rate limit errors
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (error instanceof RateLimitError) {
    headers['Retry-After'] = String(error.retryAfter);
  }

  return new Response(
    JSON.stringify(errorResponse, null, isProduction ? 0 : 2),
    {
      status: statusCode,
      headers,
    }
  );
}

// ============================================
// EXTERNAL MONITORING INTEGRATION
// ============================================

async function sendToSentry(error: Error, request: Request, dsn: string): Promise<void> {
  try {
    // Sentry event payload
    const event = {
      event_id: crypto.randomUUID(),
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: error instanceof AppError && error.statusCode < 500 ? 'warning' : 'error',
      message: error.message,
      exception: {
        values: [
          {
            type: error.name,
            value: error.message,
            stacktrace: error.stack
              ? {
                  frames: parseStackTrace(error.stack),
                }
              : undefined,
          },
        ],
      },
      request: {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
      },
      tags: {
        environment: 'production',
      },
    };

    // Send to Sentry
    await fetch(`${dsn}/api/envelope/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (err) {
    // Don't fail the request if monitoring fails
    console.warn('Failed to send error to Sentry:', err);
  }
}

function parseStackTrace(stack: string): Array<{ filename: string; lineno: number; function?: string }> {
  return stack
    .split('\n')
    .slice(1, 6) // Skip first line (error message) and limit to 5 frames
    .map(line => {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
      if (match) {
        return {
          function: match[1],
          filename: match[2],
          lineno: parseInt(match[3]),
        };
      }
      return { filename: 'unknown', lineno: 0 };
    });
}

// ============================================
// VALIDATION HELPERS
// ============================================

export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): void {
  const missing = fields.filter(field => !data[field]);

  if (missing.length > 0) {
    throw new ValidationError('Заполните все обязательные поля', {
      missingFields: missing,
    });
  }
}

export function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Неверный формат email', { email });
  }
}

export function validatePhone(phone: string): void {
  const phoneRegex = /^\+?[1-9]\d{10,14}$/;
  if (!phoneRegex.test(phone)) {
    throw new ValidationError('Неверный формат телефона', { phone });
  }
}

export function validateLength(
  value: string,
  field: string,
  min: number,
  max: number
): void {
  if (value.length < min || value.length > max) {
    throw new ValidationError(
      `${field} должно быть от ${min} до ${max} символов`,
      { field, length: value.length, min, max }
    );
  }
}

export function validateEnum<T>(
  value: T,
  field: string,
  allowedValues: T[]
): void {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${field} должно быть одним из: ${allowedValues.join(', ')}`,
      { field, value, allowedValues }
    );
  }
}

// ============================================
// ASYNC ERROR WRAPPER
// ============================================

/**
 * Wraps async functions to catch errors and handle them properly
 */
export function catchAsync(
  fn: (request: Request, env: any, params?: any) => Promise<Response>
) {
  return async (request: Request, env: any, params?: any): Promise<Response> => {
    try {
      return await fn(request, env, params);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return handleError(err, request, env);
    }
  };
}

// All classes and functions are already exported at their definitions above
