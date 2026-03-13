import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.NODE_ENV !== 'production' ? [visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    })] : []),
  ],
  build: {
    // Reduce chunk size warning limit
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Force new hash with timestamp
        entryFileNames: `assets/[name]-${Date.now()}-[hash].js`,
        chunkFileNames: `assets/[name]-${Date.now()}-[hash].js`,
        assetFileNames: `assets/[name]-${Date.now()}-[hash].[ext]`,
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
    // Enable source maps for debugging (helpful for production issues)
    sourcemap: true,
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
      // Remove console.log from production builds
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
      // Fix CommonJS modules like qrcode that use module.exports
      define: {
        global: 'globalThis',
      },
    },
  },
  // Separate esbuild configuration for build
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'scheduler', 'use-sync-external-store'],
  },
})
