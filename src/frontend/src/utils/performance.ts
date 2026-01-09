import React from 'react';

/**
 * Performance monitoring utilities
 * Измеряет производительность рендеринга React компонентов
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private marks: Map<string, number> = new Map();

  /**
   * Начать измерение
   */
  start(name: string) {
    this.marks.set(name, performance.now());
  }

  /**
   * Завершить измерение и сохранить
   */
  end(name: string) {
    const startTime = this.marks.get(name);
    if (!startTime) {
      console.warn(`[Performance] No start mark found for: ${name}`);
      return;
    }

    const duration = performance.now() - startTime;
    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
    });

    this.marks.delete(name);

    // Логируем медленные операции (>100ms)
    if (duration > 100) {
      console.warn(`[Performance] Slow operation: ${name} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Получить все метрики
   */
  getMetrics() {
    return [...this.metrics];
  }

  /**
   * Получить средние значения по группам
   */
  getAverages() {
    const groups: Record<string, number[]> = {};

    this.metrics.forEach(m => {
      if (!groups[m.name]) {
        groups[m.name] = [];
      }
      groups[m.name].push(m.duration);
    });

    return Object.entries(groups).map(([name, durations]) => ({
      name,
      avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      count: durations.length,
    }));
  }

  /**
   * Очистить все метрики
   */
  clear() {
    this.metrics = [];
    this.marks.clear();
  }

  /**
   * Экспортировать метрики
   */
  export() {
    return {
      metrics: this.getMetrics(),
      averages: this.getAverages(),
      timestamp: new Date().toISOString(),
    };
  }
}

export const perfMonitor = new PerformanceMonitor();

/**
 * HOC для измерения производительности компонента
 */
export function withPerformance<P extends object>(
  Component: React.ComponentType<P>,
  name: string
): React.ComponentType<P> {
  return function PerformanceWrapper(props: P) {
    perfMonitor.start(`render:${name}`);
    const result = React.createElement(Component, props);
    perfMonitor.end(`render:${name}`);
    return result;
  };
}

/**
 * Hook для измерения производительности эффектов
 */
export function usePerformanceEffect(name: string, callback: () => void | (() => void), deps: React.DependencyList) {
  React.useEffect(() => {
    perfMonitor.start(`effect:${name}`);
    const cleanup = callback();
    perfMonitor.end(`effect:${name}`);
    return cleanup;
  }, deps);
}

/**
 * Измерение FPS (frames per second)
 */
export class FPSMeter {
  private frames: number[] = [];
  private rafId: number | null = null;

  start() {
    const measureFrame = () => {
      const now = performance.now();
      this.frames.push(now);

      // Хранить только последние 60 кадров
      if (this.frames.length > 60) {
        this.frames.shift();
      }

      this.rafId = requestAnimationFrame(measureFrame);
    };

    this.rafId = requestAnimationFrame(measureFrame);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getFPS(): number {
    if (this.frames.length < 2) return 0;

    const firstFrame = this.frames[0];
    const lastFrame = this.frames[this.frames.length - 1];
    const duration = lastFrame - firstFrame;

    return Math.round((this.frames.length / duration) * 1000);
  }
}

/**
 * Измерение памяти (если доступно)
 */
export function getMemoryUsage() {
  if ('memory' in performance) {
    const mem = (performance as any).memory;
    return {
      used: Math.round(mem.usedJSHeapSize / 1024 / 1024), // MB
      total: Math.round(mem.totalJSHeapSize / 1024 / 1024), // MB
      limit: Math.round(mem.jsHeapSizeLimit / 1024 / 1024), // MB
    };
  }
  return null;
}

/**
 * Отчет о производительности
 */
export function generatePerformanceReport() {
  const metrics = perfMonitor.export();
  const memory = getMemoryUsage();

  // Navigation timing API
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paint = performance.getEntriesByType('paint');

  const report = {
    timestamp: new Date().toISOString(),

    // Пользовательские метрики
    customMetrics: metrics,

    // Память
    memory,

    // Загрузка страницы
    pageLoad: nav ? {
      dns: nav.domainLookupEnd - nav.domainLookupStart,
      tcp: nav.connectEnd - nav.connectStart,
      request: nav.responseStart - nav.requestStart,
      response: nav.responseEnd - nav.responseStart,
      domProcessing: nav.domComplete - nav.domInteractive,
      totalLoad: nav.loadEventEnd - nav.fetchStart,
    } : null,

    // Paint metrics
    paint: {
      firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || null,
      firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || null,
    },
  };

  console.log('[Performance Report]', report);
  return report;
}

// Автоматический мониторинг в development
if (import.meta.env.DEV) {
  // Логировать отчет каждые 30 секунд
  setInterval(() => {
    const averages = perfMonitor.getAverages();
    if (averages.length > 0) {
      console.table(averages);
    }
  }, 30000);

  // Экспортировать функцию для ручного вызова
  (window as any).perfReport = generatePerformanceReport;
  (window as any).perfMonitor = perfMonitor;

  console.log('[Performance] Monitoring enabled. Use window.perfReport() to generate report.');
}
