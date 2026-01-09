import { memo, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, TrendingUp, Zap } from 'lucide-react';

interface PerformanceStats {
  fps: number;
  memory: number;
  renderTime: number;
  apiLatency: number;
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * Real-time Performance Monitor Component
 *
 * Displays live performance metrics in development mode:
 * - FPS (frames per second)
 * - Memory usage
 * - Render time
 * - API latency
 *
 * Only visible in development or when explicitly enabled
 */
export const PerformanceMonitor = memo<PerformanceMonitorProps>(
  ({ enabled = import.meta.env.DEV, position = 'bottom-right' }) => {
    const [stats, setStats] = useState<PerformanceStats>({
      fps: 60,
      memory: 0,
      renderTime: 0,
      apiLatency: 0,
    });
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
      if (!enabled) return;

      // FPS measurement
      let frameCount = 0;
      let lastTime = performance.now();
      let animationFrameId: number;

      const measureFPS = () => {
        frameCount++;
        const currentTime = performance.now();

        if (currentTime >= lastTime + 1000) {
          const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
          frameCount = 0;
          lastTime = currentTime;

          setStats(prev => ({ ...prev, fps }));
        }

        animationFrameId = requestAnimationFrame(measureFPS);
      };

      animationFrameId = requestAnimationFrame(measureFPS);

      // Memory measurement (if available)
      const memoryInterval = setInterval(() => {
        if ('memory' in performance) {
          const mem = (performance as any).memory;
          const usedMB = Math.round(mem.usedJSHeapSize / 1024 / 1024);
          setStats(prev => ({ ...prev, memory: usedMB }));
        }
      }, 1000);

      // Render time from custom performance monitor
      const renderInterval = setInterval(() => {
        if ((window as any).perfMonitor) {
          const averages = (window as any).perfMonitor.getAverages();
          const renderMetrics = averages.filter((m: any) => m.name.startsWith('render:'));

          if (renderMetrics.length > 0) {
            const avgRenderTime = renderMetrics.reduce((sum: number, m: any) => sum + m.avg, 0) / renderMetrics.length;
            setStats(prev => ({ ...prev, renderTime: Math.round(avgRenderTime) }));
          }
        }
      }, 2000);

      // API latency measurement
      const originalFetch = window.fetch;
      let apiLatencies: number[] = [];

      window.fetch = async (...args) => {
        const startTime = performance.now();
        const response = await originalFetch(...args);
        const duration = performance.now() - startTime;

        // Only track API calls
        if (typeof args[0] === 'string' && args[0].includes('/api/')) {
          apiLatencies.push(duration);
          if (apiLatencies.length > 10) apiLatencies = apiLatencies.slice(-10);

          const avgLatency = apiLatencies.reduce((sum, l) => sum + l, 0) / apiLatencies.length;
          setStats(prev => ({ ...prev, apiLatency: Math.round(avgLatency) }));
        }

        return response;
      };

      return () => {
        cancelAnimationFrame(animationFrameId);
        clearInterval(memoryInterval);
        clearInterval(renderInterval);
        window.fetch = originalFetch;
      };
    }, [enabled]);

    if (!enabled) return null;

    const positionClasses = {
      'top-left': 'top-4 left-4',
      'top-right': 'top-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'bottom-right': 'bottom-4 right-4',
    };

    const getStatusColor = (metric: keyof PerformanceStats, value: number): string => {
      const thresholds = {
        fps: { good: 55, warning: 30 },
        memory: { good: 100, warning: 150 },
        renderTime: { good: 50, warning: 100 },
        apiLatency: { good: 200, warning: 500 },
      };

      const threshold = thresholds[metric];
      if (metric === 'fps') {
        // Higher is better for FPS
        if (value >= threshold.good) return 'text-green-500';
        if (value >= threshold.warning) return 'text-yellow-500';
        return 'text-red-500';
      } else {
        // Lower is better for other metrics
        if (value <= threshold.good) return 'text-green-500';
        if (value <= threshold.warning) return 'text-yellow-500';
        return 'text-red-500';
      }
    };

    return (
      <div
        className={`fixed ${positionClasses[position]} z-50 bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700 transition-all duration-200 ${
          isExpanded ? 'w-64' : 'w-12 h-12'
        }`}
      >
        {/* Toggle button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full h-12 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          title="Performance Monitor"
        >
          <Zap className="w-5 h-5" />
        </button>

        {/* Expanded metrics */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2 text-xs">
            {/* FPS */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-gray-400">FPS</span>
              </div>
              <span className={`font-mono font-bold ${getStatusColor('fps', stats.fps)}`}>
                {stats.fps}
              </span>
            </div>

            {/* Memory */}
            {stats.memory > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-400">Memory</span>
                </div>
                <span className={`font-mono font-bold ${getStatusColor('memory', stats.memory)}`}>
                  {stats.memory} MB
                </span>
              </div>
            )}

            {/* Render Time */}
            {stats.renderTime > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-green-400" />
                  <span className="text-gray-400">Render</span>
                </div>
                <span className={`font-mono font-bold ${getStatusColor('renderTime', stats.renderTime)}`}>
                  {stats.renderTime} ms
                </span>
              </div>
            )}

            {/* API Latency */}
            {stats.apiLatency > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-gray-400">API</span>
                </div>
                <span className={`font-mono font-bold ${getStatusColor('apiLatency', stats.apiLatency)}`}>
                  {stats.apiLatency} ms
                </span>
              </div>
            )}

            {/* Overall status */}
            <div className="pt-2 border-t border-gray-700">
              <div className="flex items-center gap-2">
                {stats.fps >= 55 && stats.renderTime <= 50 && stats.apiLatency <= 200 ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-500 font-medium">Excellent</span>
                  </>
                ) : stats.fps >= 30 && stats.renderTime <= 100 && stats.apiLatency <= 500 ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-yellow-500 font-medium">Good</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-red-500 font-medium">Poor</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-gray-700 flex gap-2">
              <button
                onClick={() => {
                  if ((window as any).perfReport) {
                    const report = (window as any).perfReport();
                    console.log('Performance Report:', report);
                  }
                }}
                className="flex-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
              >
                Report
              </button>
              <button
                onClick={() => {
                  if ((window as any).perfMonitor) {
                    (window as any).perfMonitor.clear();
                  }
                }}
                className="flex-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

PerformanceMonitor.displayName = 'PerformanceMonitor';
