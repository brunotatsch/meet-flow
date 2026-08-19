import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "@services/config/env";
import * as schema from "./schema";
import { createRuntimeDatabaseOptions } from "./connection-options";

/**
 * `casing` precisa espelhar o `drizzle.config.ts`: o schema declara as colunas em
 * camelCase e delega a conversão para snake_case. Sem esta opção o runtime
 * montaria SQL com nomes que não existem no banco.
 */
export const databaseClient = new SQL(createRuntimeDatabaseOptions(env.DATABASE_URL));

export const db = drizzle({
  client: databaseClient,
  schema,
  casing: "snake_case",
});
