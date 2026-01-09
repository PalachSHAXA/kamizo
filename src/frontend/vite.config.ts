import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    })
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
        // Granular code splitting for optimal caching
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React core + zustand internals - MUST be in same chunk to avoid React duplication
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('scheduler') ||
              id.includes('use-sync-external-store')
            ) {
              return 'react-vendor';
            }
            // Router - essential for navigation
            if (id.includes('react-router')) {
              return 'router';
            }
            // State management - small, essential
            if (id.includes('zustand')) {
              return 'zustand';
            }
            // Charts - heavy, lazy loaded
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'charts';
            }
            // Excel export - rarely used, lazy load
            if (id.includes('xlsx')) {
              return 'xlsx';
            }
            // QR code generation - keep in vendor for CommonJS compatibility
            // MUST be checked before jsqr to prevent qrcode ending up in qr-scanner
            if (id.includes('qrcode') || id.includes('dijkstra') || id.includes('pngjs') || id.includes('encode-utf8')) {
              return 'vendor';
            }
            // QR code scanning (jsqr) - separate chunk, dynamically imported
            if (id.includes('jsqr')) {
              return 'qr-scanner';
            }
            // Icons - medium size
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            // Date utilities
            if (id.includes('date-fns')) {
              return 'date-utils';
            }
            // Everything else
            return 'vendor';
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
