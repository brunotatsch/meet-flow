import { loadEnv } from "@services/config/env";
import { runMigrations } from "@services/database/migrator";

const env = loadEnv();

await runMigrations(env.DATABASE_URL);

console.log(`Migrations aplicadas em ${new URL(env.DATABASE_URL).pathname.slice(1)}.`);
