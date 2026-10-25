import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// /api is served by `npm run dev:api` (scripts/dev-server.ts) in development and by Vercel Functions in production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: false },
    },
  },
});
