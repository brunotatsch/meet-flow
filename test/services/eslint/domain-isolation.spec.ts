import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const eslintBin = join(process.cwd(), "node_modules/.bin/eslint");
const fixtureRoot = join(process.cwd(), "src/services/__lint_fixture__");
const domainDir = join(fixtureRoot, "domain");

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

describe("regra de isolamento da camada domain (no-restricted-imports)", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("falha no lint quando um arquivo em domain/ importa drizzle-orm", () => {
    mkdirSync(domainDir, { recursive: true });
    const violationFile = join(domainDir, "violation.ts");
    writeFileSync(
      violationFile,
      'import { pgTable } from "drizzle-orm";\n\nexport const marker = pgTable;\n',
    );

    const result = runEslint(violationFile);

    expect(result.failed).toBe(true);
    expect(result.output).toMatch(/no-restricted-imports/);
  });

  it("passa no lint quando o mesmo import está fora de domain/", () => {
    const infraDir = join(fixtureRoot, "infra");
    mkdirSync(infraDir, { recursive: true });
    const okFile = join(infraDir, "ok.ts");
    writeFileSync(
      okFile,
      'import { pgTable } from "drizzle-orm";\n\nexport const marker = pgTable;\n',
    );

    const result = runEslint(okFile);

    expect(result.failed).toBe(false);
  });
});
