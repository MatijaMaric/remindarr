import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Share app styling and aliases without its service worker or API proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: ["@tanstack/react-query-devtools"] },
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
});
