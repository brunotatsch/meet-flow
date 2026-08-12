import js from "@eslint/js";
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
  prettierConfig,
);
