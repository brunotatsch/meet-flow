import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./src/services/config/env";

const env = loadEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "src/services/**/infra/database/schema/*.ts",
  out: "drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
