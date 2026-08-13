import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

const domainForbiddenPatterns = [
  {
    group: [
      "drizzle-orm",
      "drizzle-orm/*",
      "fastify",
      "fastify/*",
      "@fastify/*",
      "bun",
      "pg",
      "postgres",
      "**/infra/**",
      "**/infra",
    ],
    message:
      "domain/ não pode depender de infraestrutura, ORM ou framework. Veja docs/plano.md secao 2.1.",
  },
];

const sharedForbiddenPatterns = [
  {
    group: ["@services", "@services/*", "**/services/**", "**/web/**"],
    message:
      "src/shared não pode depender de src/services ou src/web. Veja docs/plano.md secao 2.1.",
  },
];

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "drizzle/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/services/**/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: domainForbiddenPatterns }],
    },
  },
  {
    files: ["src/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: sharedForbiddenPatterns }],
    },
  },
  {
    files: ["src/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    /**
     * `components/` reexporta primitivas do Radix como alias (`export const Dialog =
     * DialogPrimitive.Root`), que `react-refresh/only-export-components` não consegue
     * distinguir de um componente "de verdade" - é o mesmo padrão usado pelo próprio
     * shadcn/ui, e o custo é só fast refresh mais lento nesses arquivos, nunca um bug.
     */
    files: ["src/web/src/components/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  prettierConfig,
);
