import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const eslintBin = join(process.cwd(), "node_modules/.bin/eslint");
const sharedDir = join(process.cwd(), "src/shared/__lint_fixture__");

function runEslint(file: string): { failed: boolean; output: string } {
  try {
    const output = execFileSync(eslintBin, [file], { stdio: "pipe" }).toString();
    return { failed: false, output };
  } catch (error) {
    const execError = error as { stdout?: Buffer; stderr?: Buffer };
    const output = `${execError.stdout ?? ""}${execError.stderr ?? ""}`;
    return { failed: true, output };
  }
}

describe("regra de isolamento de src/shared (no-restricted-imports)", () => {
  afterEach(() => {
    rmSync(sharedDir, { recursive: true, force: true });
  });

  it("falha no lint quando um arquivo em src/shared importa de @services", () => {
    mkdirSync(sharedDir, { recursive: true });
    const violationFile = join(sharedDir, "violation.ts");
    writeFileSync(
      violationFile,
      'import { env } from "@services/config/env";\n\nexport const marker = env;\n',
    );

    const result = runEslint(violationFile);

    expect(result.failed).toBe(true);
    expect(result.output).toMatch(/no-restricted-imports/);
  });

  it("passa no lint quando o arquivo em src/shared não depende de services nem web", () => {
    mkdirSync(sharedDir, { recursive: true });
    const okFile = join(sharedDir, "ok.ts");
    writeFileSync(okFile, 'import { z } from "zod";\n\nexport const marker = z.string();\n');

    const result = runEslint(okFile);

    expect(result.failed).toBe(false);
  });
});
