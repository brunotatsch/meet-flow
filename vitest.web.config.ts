import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@web": fileURLToPath(new URL("./src/web/src", import.meta.url)),
    },
  },
  test: {
    include: ["test/web/**/*.spec.tsx", "test/web/**/*.spec.ts"],
    environment: "jsdom",
    setupFiles: ["test/web/setup.ts"],
    server: { deps: { inline: ["zod"] } },
  },
});
