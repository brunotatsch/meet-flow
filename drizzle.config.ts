import { defineConfig } from "drizzle-kit";
import { loadDirectDatabaseUrl } from "./src/services/config/database-env";

const databaseUrl = loadDirectDatabaseUrl();

export default defineConfig({
  dialect: "postgresql",
  schema: "src/services/**/infra/database/schema/*.ts",
  out: "drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: databaseUrl,
  },
});
