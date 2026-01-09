import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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

    // Log to console
    console.error('🔴 ErrorBoundary caught error:', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });

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
    try {
      // Send to backend monitoring endpoint
      await fetch('/api/admin/monitoring/frontend-error', {
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

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-lg shadow-lg p-8">
              {/* Error Icon */}
              <div className="flex items-center justify-center mb-6">
                <div className="bg-red-100 rounded-full p-4">
                  <AlertTriangle className="w-12 h-12 text-red-600" />
                </div>
              </div>

              {/* Error Title */}
              <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">
                Упс! Что-то пошло не так
              </h1>

              {/* Error Message */}
              <p className="text-gray-600 text-center mb-6">
                Произошла непредвиденная ошибка. Мы уже работаем над её исправлением.
              </p>

              {/* Error Details (dev mode only) */}
              {import.meta.env.DEV && this.state.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <p className="font-mono text-sm text-red-900 mb-2">
                    <strong>Error:</strong> {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-red-800 hover:text-red-900">
                        Stack Trace
                      </summary>
                      <pre className="mt-2 text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}
                  {this.state.errorInfo && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-red-800 hover:text-red-900">
                        Component Stack
                      </summary>
                      <pre className="mt-2 text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Recovery Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                  Попробовать снова
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <Home className="w-5 h-5" />
                  На главную
                </button>

                <button
                  onClick={this.handleReload}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                  Перезагрузить
                </button>
              </div>

              {/* Error Count Warning */}
              {this.state.errorCount > 1 && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 text-center">
                    ⚠️ Ошибка повторяется ({this.state.errorCount} раз). Попробуйте перезагрузить
                    страницу.
                  </p>
                </div>
              )}

              {/* Help Text */}
              <p className="text-sm text-gray-500 text-center mt-6">
                Если проблема повторяется, обратитесь в службу поддержки или попробуйте позже.
              </p>
            </div>
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
 * Hook for manual error reporting
 */
export function useErrorReporter() {
  return (error: Error, context?: Record<string, any>) => {
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
      fetch('/api/admin/monitoring/frontend-error', {
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
