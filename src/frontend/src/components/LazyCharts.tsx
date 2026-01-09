import { lazy, Suspense } from 'react';
// Direct import for Cell - it must be synchronous inside Pie
import { Cell as RechartsCell } from 'recharts';

// Lazy load recharts components
const LazyLineChart = lazy(() => import('recharts').then(module => ({ default: module.LineChart })));
const LazyBarChart = lazy(() => import('recharts').then(module => ({ default: module.BarChart })));
const LazyPieChart = lazy(() => import('recharts').then(module => ({ default: module.PieChart })));
const LazyLine = lazy(() => import('recharts').then(module => ({ default: module.Line })));
const LazyBar = lazy(() => import('recharts').then(module => ({ default: module.Bar })));
const LazyPie = lazy(() => import('recharts').then(module => ({ default: module.Pie })));
const LazyXAxis = lazy(() => import('recharts').then(module => ({ default: module.XAxis })));
const LazyYAxis = lazy(() => import('recharts').then(module => ({ default: module.YAxis })));
const LazyCartesianGrid = lazy(() => import('recharts').then(module => ({ default: module.CartesianGrid })));
const LazyTooltip = lazy(() => import('recharts').then(module => ({ default: module.Tooltip })));
const LazyLegend = lazy(() => import('recharts').then(module => ({ default: module.Legend })));
const LazyResponsiveContainer = lazy(() => import('recharts').then(module => ({ default: module.ResponsiveContainer })));

// Loading placeholder
const ChartLoader = () => (
  <div className="w-full h-64 flex items-center justify-center bg-gray-50 rounded-lg animate-pulse">
    <div className="text-gray-400">Загрузка графика...</div>
  </div>
);

// Export wrapped components with Suspense
export const LineChart = (props: any) => (
  <Suspense fallback={<ChartLoader />}>
    <LazyLineChart {...props} />
  </Suspense>
);

export const BarChart = (props: any) => (
  <Suspense fallback={<ChartLoader />}>
    <LazyBarChart {...props} />
  </Suspense>
);

export const PieChart = (props: any) => (
  <Suspense fallback={<ChartLoader />}>
    <LazyPieChart {...props} />
  </Suspense>
);

export const Line = (props: any) => (
  <Suspense fallback={null}>
    <LazyLine {...props} />
  </Suspense>
);

export const Bar = (props: any) => (
  <Suspense fallback={null}>
    <LazyBar {...props} />
  </Suspense>
);

export const Pie = (props: any) => (
  <Suspense fallback={null}>
    <LazyPie {...props} />
  </Suspense>
);

export const XAxis = (props: any) => (
  <Suspense fallback={null}>
    <LazyXAxis {...props} />
  </Suspense>
);

export const YAxis = (props: any) => (
  <Suspense fallback={null}>
    <LazyYAxis {...props} />
  </Suspense>
);

export const CartesianGrid = (props: any) => (
  <Suspense fallback={null}>
    <LazyCartesianGrid {...props} />
  </Suspense>
);

export const Tooltip = (props: any) => (
  <Suspense fallback={null}>
    <LazyTooltip {...props} />
  </Suspense>
);

export const Legend = (props: any) => (
  <Suspense fallback={null}>
    <LazyLegend {...props} />
  </Suspense>
);

export const ResponsiveContainer = (props: any) => (
  <Suspense fallback={<ChartLoader />}>
    <LazyResponsiveContainer {...props} />
  </Suspense>
);

// Cell must be synchronous - export directly
export const Cell = RechartsCell;

// Area chart components
const LazyAreaChart = lazy(() => import('recharts').then(module => ({ default: module.AreaChart })));
const LazyArea = lazy(() => import('recharts').then(module => ({ default: module.Area })));

export const AreaChart = (props: any) => (
  <Suspense fallback={<ChartLoader />}>
    <LazyAreaChart {...props} />
  </Suspense>
);

export const Area = (props: any) => (
  <Suspense fallback={null}>
    <LazyArea {...props} />
  </Suspense>
);
