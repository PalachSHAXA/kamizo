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
    manifest: true,
    // Reduce chunk size warning limit
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Content-hash is sufficient for cache-busting, no need for Date.now()
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Heavy feature libraries are loaded through dynamic imports. Let
        // Rollup preserve those boundaries; forced vendor chunks can pull
        // shared runtime modules back into the initial preload graph.
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
