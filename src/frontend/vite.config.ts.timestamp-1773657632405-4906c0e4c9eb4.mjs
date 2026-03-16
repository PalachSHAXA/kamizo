// vite.config.ts
import { defineConfig } from "file:///sessions/trusting-affectionate-knuth/mnt/kamizo/src/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/trusting-affectionate-knuth/mnt/kamizo/src/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    // visualizer only in analyze mode: ANALYZE=true npm run build
    ...process.env.ANALYZE === "true" ? [import("file:///sessions/trusting-affectionate-knuth/mnt/kamizo/src/frontend/node_modules/rollup-plugin-visualizer/dist/plugin/index.js").then(
      (m) => m.visualizer({
        filename: "./dist/stats.html",
        open: false,
        gzipSize: true,
        brotliSize: false
      })
    )] : []
  ],
  build: {
    // Reduce chunk size warning limit
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Content-hash is sufficient for cache-busting, no need for Date.now()
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        // Code splitting: only split heavy lazy-loaded libs, let Rollup handle the rest
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("exceljs")) return "exceljs";
            if (id.includes("xlsx")) return "xlsx";
            if (id.includes("recharts") || id.includes("d3-") || id.includes("react-redux")) return "charts";
            if (id.includes("docxtemplater") || id.includes("pizzip") || id.includes("/docx/")) return "docx-gen";
            if (id.includes("jsqr")) return "qr-scanner";
          }
        }
      }
    },
    // Disable source maps to reduce build time and memory usage
    sourcemap: false,
    // Minify with esbuild for fast compression
    minify: "esbuild",
    // Target modern browsers
    target: "es2020",
    // Increase chunk size limit for QR code
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  // Optimize dependencies - force dedupe and pre-bundle CommonJS
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "zustand",
      "lucide-react",
      "qrcode",
      "use-sync-external-store",
      "use-sync-external-store/with-selector"
    ],
    esbuildOptions: {
      // Fix CommonJS modules like qrcode that use module.exports
      define: {
        global: "globalThis"
      }
    }
  },
  // Remove console/debugger in production
  esbuild: {
    drop: ["console", "debugger"]
  },
  resolve: {
    dedupe: ["react", "react-dom", "scheduler", "use-sync-external-store"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvdHJ1c3RpbmctYWZmZWN0aW9uYXRlLWtudXRoL21udC9rYW1pem8vc3JjL2Zyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvdHJ1c3RpbmctYWZmZWN0aW9uYXRlLWtudXRoL21udC9rYW1pem8vc3JjL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy90cnVzdGluZy1hZmZlY3Rpb25hdGUta251dGgvbW50L2thbWl6by9zcmMvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuXG4vLyBodHRwczovL3ZpdGUuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIC8vIHZpc3VhbGl6ZXIgb25seSBpbiBhbmFseXplIG1vZGU6IEFOQUxZWkU9dHJ1ZSBucG0gcnVuIGJ1aWxkXG4gICAgLi4uKHByb2Nlc3MuZW52LkFOQUxZWkUgPT09ICd0cnVlJ1xuICAgICAgPyBbaW1wb3J0KCdyb2xsdXAtcGx1Z2luLXZpc3VhbGl6ZXInKS50aGVuKG0gPT5cbiAgICAgICAgICBtLnZpc3VhbGl6ZXIoe1xuICAgICAgICAgICAgZmlsZW5hbWU6ICcuL2Rpc3Qvc3RhdHMuaHRtbCcsXG4gICAgICAgICAgICBvcGVuOiBmYWxzZSxcbiAgICAgICAgICAgIGd6aXBTaXplOiB0cnVlLFxuICAgICAgICAgICAgYnJvdGxpU2l6ZTogZmFsc2UsXG4gICAgICAgICAgfSksXG4gICAgICAgICldXG4gICAgICA6IFtdKSxcbiAgXSxcbiAgYnVpbGQ6IHtcbiAgICAvLyBSZWR1Y2UgY2h1bmsgc2l6ZSB3YXJuaW5nIGxpbWl0XG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA1MDAsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIC8vIENvbnRlbnQtaGFzaCBpcyBzdWZmaWNpZW50IGZvciBjYWNoZS1idXN0aW5nLCBubyBuZWVkIGZvciBEYXRlLm5vdygpXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXS1baGFzaF0uanMnLFxuICAgICAgICBjaHVua0ZpbGVOYW1lczogJ2Fzc2V0cy9bbmFtZV0tW2hhc2hdLmpzJyxcbiAgICAgICAgYXNzZXRGaWxlTmFtZXM6ICdhc3NldHMvW25hbWVdLVtoYXNoXS5bZXh0XScsXG4gICAgICAgIC8vIENvZGUgc3BsaXR0aW5nOiBvbmx5IHNwbGl0IGhlYXZ5IGxhenktbG9hZGVkIGxpYnMsIGxldCBSb2xsdXAgaGFuZGxlIHRoZSByZXN0XG4gICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzJykpIHtcbiAgICAgICAgICAgIC8vIEhlYXZ5IGxpYnMgdGhhdCBhcmUgZHluYW1pY2FsbHkgaW1wb3J0ZWQgXHUyMDE0IGlzb2xhdGUgaW50byBvd24gY2h1bmtzXG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2V4Y2VsanMnKSkgcmV0dXJuICdleGNlbGpzJztcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygneGxzeCcpKSByZXR1cm4gJ3hsc3gnO1xuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWNoYXJ0cycpIHx8IGlkLmluY2x1ZGVzKCdkMy0nKSB8fCBpZC5pbmNsdWRlcygncmVhY3QtcmVkdXgnKSkgcmV0dXJuICdjaGFydHMnO1xuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdkb2N4dGVtcGxhdGVyJykgfHwgaWQuaW5jbHVkZXMoJ3BpenppcCcpIHx8IGlkLmluY2x1ZGVzKCcvZG9jeC8nKSkgcmV0dXJuICdkb2N4LWdlbic7XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2pzcXInKSkgcmV0dXJuICdxci1zY2FubmVyJztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgLy8gRGlzYWJsZSBzb3VyY2UgbWFwcyB0byByZWR1Y2UgYnVpbGQgdGltZSBhbmQgbWVtb3J5IHVzYWdlXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgICAvLyBNaW5pZnkgd2l0aCBlc2J1aWxkIGZvciBmYXN0IGNvbXByZXNzaW9uXG4gICAgbWluaWZ5OiAnZXNidWlsZCcsXG4gICAgLy8gVGFyZ2V0IG1vZGVybiBicm93c2Vyc1xuICAgIHRhcmdldDogJ2VzMjAyMCcsXG4gICAgLy8gSW5jcmVhc2UgY2h1bmsgc2l6ZSBsaW1pdCBmb3IgUVIgY29kZVxuICAgIGNvbW1vbmpzT3B0aW9uczoge1xuICAgICAgdHJhbnNmb3JtTWl4ZWRFc01vZHVsZXM6IHRydWUsXG4gICAgfSxcbiAgfSxcbiAgLy8gT3B0aW1pemUgZGVwZW5kZW5jaWVzIC0gZm9yY2UgZGVkdXBlIGFuZCBwcmUtYnVuZGxlIENvbW1vbkpTXG4gIG9wdGltaXplRGVwczoge1xuICAgIGluY2x1ZGU6IFtcbiAgICAgICdyZWFjdCcsXG4gICAgICAncmVhY3QtZG9tJyxcbiAgICAgICdyZWFjdC1yb3V0ZXItZG9tJyxcbiAgICAgICd6dXN0YW5kJyxcbiAgICAgICdsdWNpZGUtcmVhY3QnLFxuICAgICAgJ3FyY29kZScsXG4gICAgICAndXNlLXN5bmMtZXh0ZXJuYWwtc3RvcmUnLFxuICAgICAgJ3VzZS1zeW5jLWV4dGVybmFsLXN0b3JlL3dpdGgtc2VsZWN0b3InLFxuICAgIF0sXG4gICAgZXNidWlsZE9wdGlvbnM6IHtcbiAgICAgIC8vIEZpeCBDb21tb25KUyBtb2R1bGVzIGxpa2UgcXJjb2RlIHRoYXQgdXNlIG1vZHVsZS5leHBvcnRzXG4gICAgICBkZWZpbmU6IHtcbiAgICAgICAgZ2xvYmFsOiAnZ2xvYmFsVGhpcycsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIC8vIFJlbW92ZSBjb25zb2xlL2RlYnVnZ2VyIGluIHByb2R1Y3Rpb25cbiAgZXNidWlsZDoge1xuICAgIGRyb3A6IFsnY29uc29sZScsICdkZWJ1Z2dlciddLFxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgZGVkdXBlOiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdzY2hlZHVsZXInLCAndXNlLXN5bmMtZXh0ZXJuYWwtc3RvcmUnXSxcbiAgfSxcbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlXLFNBQVMsb0JBQW9CO0FBQ3RZLE9BQU8sV0FBVztBQUdsQixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUE7QUFBQSxJQUVOLEdBQUksUUFBUSxJQUFJLFlBQVksU0FDeEIsQ0FBQyxPQUFPLGlJQUEwQixFQUFFO0FBQUEsTUFBSyxPQUN2QyxFQUFFLFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxRQUNWLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLFlBQVk7QUFBQSxNQUNkLENBQUM7QUFBQSxJQUNILENBQUMsSUFDRCxDQUFDO0FBQUEsRUFDUDtBQUFBLEVBQ0EsT0FBTztBQUFBO0FBQUEsSUFFTCx1QkFBdUI7QUFBQSxJQUN2QixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUE7QUFBQSxRQUVOLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQjtBQUFBO0FBQUEsUUFFaEIsYUFBYSxJQUFJO0FBQ2YsY0FBSSxHQUFHLFNBQVMsY0FBYyxHQUFHO0FBRS9CLGdCQUFJLEdBQUcsU0FBUyxTQUFTLEVBQUcsUUFBTztBQUNuQyxnQkFBSSxHQUFHLFNBQVMsTUFBTSxFQUFHLFFBQU87QUFDaEMsZ0JBQUksR0FBRyxTQUFTLFVBQVUsS0FBSyxHQUFHLFNBQVMsS0FBSyxLQUFLLEdBQUcsU0FBUyxhQUFhLEVBQUcsUUFBTztBQUN4RixnQkFBSSxHQUFHLFNBQVMsZUFBZSxLQUFLLEdBQUcsU0FBUyxRQUFRLEtBQUssR0FBRyxTQUFTLFFBQVEsRUFBRyxRQUFPO0FBQzNGLGdCQUFJLEdBQUcsU0FBUyxNQUFNLEVBQUcsUUFBTztBQUFBLFVBQ2xDO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUVBLFdBQVc7QUFBQTtBQUFBLElBRVgsUUFBUTtBQUFBO0FBQUEsSUFFUixRQUFRO0FBQUE7QUFBQSxJQUVSLGlCQUFpQjtBQUFBLE1BQ2YseUJBQXlCO0FBQUEsSUFDM0I7QUFBQSxFQUNGO0FBQUE7QUFBQSxFQUVBLGNBQWM7QUFBQSxJQUNaLFNBQVM7QUFBQSxNQUNQO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxJQUNBLGdCQUFnQjtBQUFBO0FBQUEsTUFFZCxRQUFRO0FBQUEsUUFDTixRQUFRO0FBQUEsTUFDVjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUE7QUFBQSxFQUVBLFNBQVM7QUFBQSxJQUNQLE1BQU0sQ0FBQyxXQUFXLFVBQVU7QUFBQSxFQUM5QjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsUUFBUSxDQUFDLFNBQVMsYUFBYSxhQUFhLHlCQUF5QjtBQUFBLEVBQ3ZFO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
