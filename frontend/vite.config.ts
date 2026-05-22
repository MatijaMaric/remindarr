import path from "path";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import type { VitePWAOptions } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export const pwaOptions: Partial<VitePWAOptions> = {
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  registerType: "autoUpdate",
  injectRegister: "script-defer",
  injectManifest: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
    target: "es2020",
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
    shortcuts: [
      {
        name: "Airing Soon",
        url: "/calendar",
        description: "See upcoming episodes",
      },
    ],
  },
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VITE_SENTRY_RELEASE ?? `dev-${Date.now()}`,
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(pwaOptions),
    ...(process.env.ANALYZE
      ? [visualizer({ filename: "dist/stats.html" })]
      : []),
  ] as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("react-router")) return "vendor-router";
          if (
            id.includes("lucide-react") ||
            id.includes("sonner") ||
            id.includes("tailwind-merge") ||
            id.includes("clsx") ||
            id.includes("class-variance-authority")
          )
            return "vendor-ui";
          if (id.includes("@sentry/react")) return "vendor-sentry";
          if (id.includes("i18next") || id.includes("react-i18next"))
            return "vendor-i18n";
          if (id.includes("better-auth")) return "vendor-auth";
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          )
            return "vendor-react";
          if (id.includes("@tanstack/react-query")) return "vendor-query";
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
