import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Dev server e build da SPA, separados do backend (Fastify roda com `bun`, não
 * com Vite). `root` é `src/web` para que `index.html` e os assets fiquem isolados
 * do resto do repositório.
 *
 * O proxy cobre a superfície única `/api`, mantendo a mesma origem do deployment
 * Vercel sem exigir CORS manual em desenvolvimento.
 */
export default defineConfig(({ mode }) => {
  const apiTarget = process.env.API_URL ?? "http://localhost:3000";

  return {
    root: fileURLToPath(new URL("./src/web", import.meta.url)),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
        "@web": fileURLToPath(new URL("./src/web/src", import.meta.url)),
      },
    },
    server: {
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: fileURLToPath(new URL("./dist/web", import.meta.url)),
      emptyOutDir: true,
      sourcemap: mode !== "production",
    },
  };
});
