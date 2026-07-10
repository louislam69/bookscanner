import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Buch-Lernkarten",
        short_name: "Lernkarten",
        description:
          "Buchseiten fotografieren und automatisch Lernkarten erstellen",
        lang: "de",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f3ec",
        theme_color: "#2f5d50",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // API-Aufrufe an Anthropic niemals über den Service Worker cachen
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
});
