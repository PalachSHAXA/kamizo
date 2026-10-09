import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { API_URL } from '../services/api/client';

/**
 * Production-Grade Error Boundary
 *
 * Features:
 * - Catches React errors in component tree
 * - Logs errors with context
 * - Shows user-friendly error UI
 * - Provides recovery options
 * - Sends errors to monitoring service
 */

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolate?: boolean; // If true, only catches errors in this subtree
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error details
    this.setState(prev => ({
      errorInfo,
      errorCount: prev.errorCount + 1,
    }));

    // Log to console — expanded so Safari Web Inspector shows file:line of
    // the throw, not just a message string. iOS WKWebView serialises object
    // args unevenly, so we emit the Error instance itself (dev-tools pretty-
    // prints it with full stack + source map link) PLUS stack + component
    // stack as separate labelled console.error calls to guarantee visibility.
    console.error('[ErrorBoundary] uncaught React error:', error);
    console.error('[ErrorBoundary] message:', error?.message);
    console.error('[ErrorBoundary] stack:\n' + (error?.stack || '(no stack)'));
    console.error('[ErrorBoundary] component stack:\n' + (errorInfo.componentStack || '(no component stack)'));

    // Send to monitoring service
    this.logError(error, errorInfo);

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // Send to external monitoring (if available)
    if (import.meta.env.PROD) {
      this.sendToMonitoring(error, errorInfo);
    }
  }

  logError(error: Error, errorInfo: ErrorInfo) {
    // Store in localStorage for debugging
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
      logs.push(errorLog);

      // Keep only last 50 errors
      if (logs.length > 50) {
        logs.shift();
      }

      localStorage.setItem('error_logs', JSON.stringify(logs));
    } catch (err) {
      console.warn('Failed to log error to localStorage:', err);
    }
  }

  async sendToMonitoring(error: Error, errorInfo: ErrorInfo) {
    // TODO: Подключить Sentry DSN через VITE_SENTRY_DSN
    // reportFrontendError(error, { componentStack: errorInfo.componentStack });
    try {
      // Send to backend monitoring endpoint
      await fetch(`${API_URL}/api/admin/monitoring/frontend-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          userId: localStorage.getItem('user_id'),
        }),
      });
    } catch (err) {
      console.warn('Failed to send error to monitoring:', err);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Short error code — compact timestamp YYYYMMDD-HHMM — resident can
      // screenshot and dictate to support instead of trying to read the stack.
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const errorCode = `FP-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      // Full technical details hidden by default; shown only in DEV or when
      // ?debug=1 is present in URL. In production residents see a clean
      // reassuring screen without scary stack traces.
      const showDebug = import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'));

      return (
        <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: 'var(--app-bg, #F4F0E8)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 40px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)' }}>
          <div className="w-full max-w-sm text-center">
            {/* Reassuring icon — amber (not red) so it reads as "temporary"
                not "catastrophic" — residents panic less. */}
            <div className="mx-auto mb-6 w-20 h-20 rounded-full grid place-items-center" style={{ background: 'var(--brand-tint, rgba(249,115,22,0.1))', color: 'var(--brand-dark, #C2410C)' }}>
              <AlertTriangle className="w-10 h-10" strokeWidth={1.6} />
            </div>

            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary, #1C1917)', letterSpacing: '-0.02em' }}>
              Что-то пошло не так
            </h1>
            <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-secondary, #78716C)' }}>
              Приложение столкнулось с неожиданной ошибкой. Обычно это исправляется обновлением страницы.
            </p>

            {/* Primary action — brand orange matches the hero button in rest of app. */}
            <button
              onClick={this.handleReload}
              className="w-full font-semibold py-3.5 rounded-2xl mb-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: 'var(--brand, #F97316)', color: '#fff', boxShadow: '0 10px 28px -14px rgba(249,115,22,0.55)' }}
            >
              <RefreshCw className="w-5 h-5" strokeWidth={2.2} />
              Обновить страницу
            </button>

            <button
              onClick={this.handleGoHome}
              className="w-full font-semibold py-3 rounded-2xl mb-6 flex items-center justify-center gap-2 border active:scale-[0.98] transition-transform"
              style={{ background: 'var(--surface, #fff)', color: 'var(--text-primary, #1C1917)', borderColor: 'var(--border-c, #E6DFD2)' }}
            >
              <Home className="w-4 h-4" strokeWidth={2} />
              На главную
            </button>

            {this.state.errorCount > 1 && (
              <div className="mb-4 px-4 py-2.5 rounded-xl text-xs" style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--text-secondary, #78716C)' }}>
                Ошибка повторяется ({this.state.errorCount}×). Попробуйте полностью закрыть и открыть приложение.
              </div>
            )}

            <p className="text-[11px]" style={{ color: 'var(--text-muted, #A8A29E)' }}>
              Код ошибки: <span className="font-mono select-all">{errorCode}</span>
            </p>

            {showDebug && this.state.error && (
              <div className="mt-6 text-left bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
                <p className="font-mono text-red-900 break-words mb-2">
                  <strong>{this.state.error.name || 'Error'}:</strong> {this.state.error.message || '(no message)'}
                </p>
                {this.state.error.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-800">Stack</summary>
                    <pre className="mt-1 text-[10px] text-red-800 overflow-x-auto whitespace-pre-wrap break-words max-h-40">{this.state.error.stack}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Smaller error boundary for isolating specific components
 */
export function ComponentErrorBoundary({
  children,
  componentName,
}: {
  children: ReactNode;
  componentName?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
          <div className="flex items-center gap-2 text-red-900 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-medium">
              Ошибка загрузки {componentName || 'компонента'}
            </p>
          </div>
          <p className="text-sm text-red-700">
            Этот раздел временно недоступен. Попробуйте обновить страницу.
          </p>
        </div>
      }
      isolate
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Placeholder: send error to Sentry when VITE_SENTRY_DSN is configured.
 * TODO: Implement via @sentry/browser or fetch-based envelope once DSN is set.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function reportFrontendError(error: Error, context?: Record<string, unknown>): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // Sentry not configured — skip silently
  // Future: POST envelope to Sentry ingest endpoint
  console.warn('[Sentry placeholder] Would report:', error.message, context);
}

/**
 * Hook for manual error reporting
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useErrorReporter() {
  return (error: Error, context?: Record<string, unknown>) => {
    console.error('Manual error report:', error, context);

    // Log to localStorage
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        context,
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
      logs.push(errorLog);
      if (logs.length > 50) logs.shift();
      localStorage.setItem('error_logs', JSON.stringify(logs));
    } catch (err) {
      console.warn('Failed to log error:', err);
    }

    // Send to monitoring
    if (import.meta.env.PROD) {
      fetch(`${API_URL}/api/admin/monitoring/frontend-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          context,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(err => console.warn('Failed to send error:', err));
    }
  };
}
