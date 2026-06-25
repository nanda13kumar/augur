import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * vite.config.js
 * ==============
 * Dev server reads its port and the backend target from env so you never edit
 * code to change ports:
 *   FRONTEND_PORT   – port the dev server listens on        (default 3100)
 *   BACKEND_PORT    – port the backend API listens on        (default 8100)
 *   VITE_API_PROXY  – full backend origin override (e.g. http://host:9999)
 *
 * All `/api` calls are proxied to the backend, so the frontend code only ever
 * references the relative path "/api/v1".
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const frontendPort = Number(env.FRONTEND_PORT || 3100);
  const backendPort = Number(env.BACKEND_PORT || 8100);
  const target = env.VITE_API_PROXY || `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      port: frontendPort,
      host: true,
      proxy: {
        "/api": { target, changeOrigin: true },
      },
    },
    preview: { port: frontendPort, host: true },
  };
});
