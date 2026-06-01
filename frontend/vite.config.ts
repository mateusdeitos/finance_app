import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    host: true,
    watch: {
      usePolling: true,
    },
    hmr: {
      clientPort: process.env.PORT ? Number(process.env.PORT) : 5173,
    },
  },
  preview: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  plugins: [
    tanstackRouter({ routesDirectory: "./src/routes", generatedRouteTree: "./src/routeTree.gen.ts" }),
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      devOptions: {
        // Enable the service worker under `npm run dev` so the Web Push flow
        // (subscribe → navigator.serviceWorker.ready) works locally. With this
        // off, serviceWorker.ready never resolves and the toggle hangs on
        // "Aguardando permissão...". `type: "module"` is required for an
        // injectManifest TS service worker in dev.
        enabled: true,
        type: "module",
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      manifest: {
        name: "FinanceApp",
        short_name: "Finance",
        description: "Gestão financeira a dois",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#228be6",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
