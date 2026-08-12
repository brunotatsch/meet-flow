import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url)),
    },
  },
  test: {
    include: ["test/services/**/*.spec.ts"],
    environment: "node",
    // Mesmo motivo descrito em `vitest.e2e.config.ts`.
    server: { deps: { inline: ["zod"] } },
    env: {
      NODE_ENV: "test",
      PORT: "3000",
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgres://meetflow:meetflow@localhost:5433/meetflow",
      BETTER_AUTH_SECRET: "unit-secret-change-me-0123456789abcdef",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
