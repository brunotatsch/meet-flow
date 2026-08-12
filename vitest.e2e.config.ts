import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `.env.test` é a definição autoritativa do ambiente e2e e sobrescreve o que já
 * estiver em `process.env`.
 *
 * A precedência importa: o Bun carrega `.env` automaticamente ao iniciar, antes
 * deste arquivo rodar. Tratar `.env.test` como fallback fazia a suíte e2e apontar
 * para o banco de desenvolvimento, que este setup derruba com `DROP SCHEMA`.
 */
function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    process.env[key] = value;
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
    globalSetup: ["test/services/setup/reset-test-database.ts"],
    // As specs compartilham o mesmo banco; rodar em paralelo embaralharia os dados.
    fileParallelism: false,
  },
});
