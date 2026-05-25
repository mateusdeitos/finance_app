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
      registerType: "prompt",
      injectRegister: false,
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        // Cache do boot de autenticação: serve a resposta anterior
        // imediatamente se o backend (Cloud Run) demorar mais que 2s para
        // responder, evitando tela branca durante cold start.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname === "/api/auth/me" ||
              url.pathname === "/api/onboarding/status",
            handler: "NetworkFirst",
            options: {
              cacheName: "auth-boot",
              networkTimeoutSeconds: 2,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
