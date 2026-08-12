import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "@services/config/env";
import * as schema from "./schema";

/**
 * `casing` precisa espelhar o `drizzle.config.ts`: o schema declara as colunas em
 * camelCase e delega a conversão para snake_case. Sem esta opção o runtime
 * montaria SQL com nomes que não existem no banco.
 */
export const db = drizzle(env.DATABASE_URL, { schema, casing: "snake_case" });
