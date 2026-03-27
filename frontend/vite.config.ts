import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import type { VitePWAOptions } from "vite-plugin-pwa";

export const pwaOptions: Partial<VitePWAOptions> = {
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  registerType: "autoUpdate",
  injectManifest: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
  },
  manifest: {
    name: "Remindarr",
    short_name: "Remindarr",
    description: "Track streaming media releases",
    theme_color: "#0f1628",
    background_color: "#0f1628",
    display: "standalone",
    scope: "/",
    start_url: "/",
    icons: [
      {
        src: "pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "pwa-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  },
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(pwaOptions),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-router": ["react-router"],
          "vendor-ui": ["lucide-react", "sonner", "tailwind-merge", "clsx", "class-variance-authority"],
          "vendor-sentry": ["@sentry/react"],
          "vendor-i18n": ["i18next", "react-i18next"],
          "vendor-auth": ["better-auth"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
