import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "@services/config/env";

export const db = drizzle(env.DATABASE_URL);
