import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // visualizer only in analyze mode: ANALYZE=true npm run build
    ...(process.env.ANALYZE === 'true'
      ? [import('rollup-plugin-visualizer').then(m =>
          m.visualizer({
            filename: './dist/stats.html',
            open: false,
            gzipSize: true,
            brotliSize: false,
          }),
        )]
      : []),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Reduce chunk size warning limit
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Content-hash is sufficient for cache-busting, no need for Date.now()
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Code splitting: only split heavy lazy-loaded libs, let Rollup handle the rest
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Heavy libs that are dynamically imported — isolate into own chunks
            if (id.includes('exceljs')) return 'exceljs';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('recharts') || id.includes('d3-') || id.includes('react-redux')) return 'charts';
            if (id.includes('docxtemplater') || id.includes('pizzip') || id.includes('/docx/')) return 'docx-gen';
            if (id.includes('jsqr')) return 'qr-scanner';
          }
        },
      },
    },
    // Disable source maps to reduce build time and memory usage
    sourcemap: false,
    // Minify with esbuild for fast compression
    minify: 'esbuild',
    // Target modern browsers
    target: 'es2020',
    // Increase chunk size limit for QR code
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  // Optimize dependencies - force dedupe and pre-bundle CommonJS
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      'lucide-react',
      'qrcode',
      'use-sync-external-store',
      'use-sync-external-store/with-selector',
    ],
    esbuildOptions: {
      // Fix CommonJS modules like qrcode that use module.exports
      define: {
        global: 'globalThis',
      },
    },
  },
  // Remove console/debugger in production only
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
  } : {},
  resolve: {
    dedupe: ['react', 'react-dom', 'scheduler', 'use-sync-external-store'],
  },
}))
