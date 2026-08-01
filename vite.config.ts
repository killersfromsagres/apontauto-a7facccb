// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Vendors pesados isolados em chunks estáveis: garante cache HTTP compartilhado
 * entre rotas (ex.: backorder + lavanderia reutilizam `vendor-recharts`), reduz
 * o tamanho de cada chunk de rota e evita duplicação de código no bundle.
 * Só aplica ao build do cliente — Nitro/SSR usa seu próprio bundler.
 */
const HEAVY_VENDORS: Record<string, RegExp> = {
  "vendor-react": /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
  "vendor-tanstack": /[\\/]node_modules[\\/]@tanstack[\\/]/,
  "vendor-recharts":
    /[\\/]node_modules[\\/](recharts|d3-[^/\\]+|victory-vendor|internmap|delaunator|robust-predicates)[\\/]/,
  "vendor-exceljs": /[\\/]node_modules[\\/]exceljs[\\/]/,
  "vendor-xlsx": /[\\/]node_modules[\\/]xlsx[\\/]/,
  "vendor-pdf": /[\\/]node_modules[\\/](jspdf|jspdf-autotable|html-to-image)[\\/]/,
  "vendor-psd": /[\\/]node_modules[\\/]ag-psd[\\/]/,
  "vendor-daypicker": /[\\/]node_modules[\\/](react-day-picker|date-fns)[\\/]/,
  "vendor-radix": /[\\/]node_modules[\\/]@radix-ui[\\/]/,
  "vendor-icons": /[\\/]node_modules[\\/]lucide-react[\\/]/,
  "vendor-supabase": /[\\/]node_modules[\\/]@supabase[\\/]/,
  "vendor-forms": /[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/,
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      // Modo offline do app de campo. `injectRegister: null` + `devOptions.enabled: false`
      // garantem que o único registrador é o wrapper protegido (src/lib/pwa/register-sw.ts).
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        includeAssets: ["favicon.ico", "apontauto-logo.png"],
        manifest: {
          id: "/",
          name: "Apont Auto PCM",
          short_name: "Apont Auto",
          description:
            "Planejamento e controle de manutenção: ordens de serviço, apontamentos de campo e frota.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#050c14",
          theme_color: "#050c14",
          lang: "pt-BR",
          icons: [
            { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html-navigations",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: ({ url, request, sameOrigin }) =>
                sameOrigin &&
                (request.destination === "script" ||
                  request.destination === "style" ||
                  request.destination === "font") &&
                url.pathname.startsWith("/_build/"),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      // Suprime warnings falsos de chunk grande em rotas legitimamente pesadas.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            for (const [name, regex] of Object.entries(HEAVY_VENDORS)) {
              if (regex.test(id)) return name;
            }
            return undefined;
          },
        },
      },
    },
  },
});
