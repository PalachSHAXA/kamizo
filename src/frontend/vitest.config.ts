import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'dist/**', 'node_modules/**'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    // UI integration suites are CPU-heavy under CI. Bound concurrency so
    // parallel jsdom transforms cannot starve an otherwise fast test.
    maxWorkers: 2,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
