import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = env.VITE_DEV_PORT ? parseInt(env.VITE_DEV_PORT, 10) : 3000;
  const apiTarget = env.VITE_API_URL || "http://localhost:3080";

  return {
    plugins: [react()],
    server: {
      port: devPort,
      proxy: {
        "/api": { target: apiTarget.replace(/\/$/, ""), changeOrigin: true },
      },
    },
  };
});
