import { SQL } from "bun";
import { runMigrations } from "@services/database/migrator";

/**
 * `globalSetup` da suíte e2e: derruba o schema e reaplica as migrations do zero.
 *
 * Além de isolar cada execução, isso exercita em todo run o critério de aceite
 * "aplica tudo a partir de um banco vazio".
 */
export default async function setup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL ausente: a suíte e2e depende de .env.test.");
  }

  const databaseName = new URL(databaseUrl).pathname.slice(1);

  // Trava de segurança: este setup é destrutivo e só pode tocar o banco de teste.
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Recusando resetar o banco "${databaseName}": a suíte e2e exige um banco com sufixo "_test".`,
    );
  }

  const client = new SQL(databaseUrl);

  try {
    await client.unsafe('DROP SCHEMA IF EXISTS "drizzle" CASCADE');
    await client.unsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
    await client.unsafe('CREATE SCHEMA "public"');
  } finally {
    await client.end();
  }

  await runMigrations(databaseUrl);
}
