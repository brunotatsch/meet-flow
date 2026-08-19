import { SessionSchema } from "@shared/schemas/auth.schema";
import { api } from "./api";
import { useKeyedFetch } from "./use-keyed-fetch";

/** Sessão de produto (`user + company + role`), além da sessão técnica do Better Auth. */
export function useAppSession() {
  return useKeyedFetch("app-session", (signal) => api.get("/me", SessionSchema, { signal }));
}
