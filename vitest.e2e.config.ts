import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile(fileURLToPath(new URL("./.env.test", import.meta.url)));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url)),
    },
  },
  test: {
    include: ["test/services/**/*.e2e-spec.ts"],
    environment: "node",
    passWithNoTests: true,
    testTimeout: 20_000,
  },
});
