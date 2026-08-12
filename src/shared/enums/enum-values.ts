/**
 * Deriva a lista de valores de um enum `as const` como tupla não vazia,
 * reutilizável tanto em `z.enum()`/`z.literal()` (Zod) quanto em `pgEnum()`
 * (Drizzle), sem redeclarar a mesma lista de valores em cada lugar.
 */
export function enumValues<T extends Record<string, string | number>>(
  source: T,
): [T[keyof T], ...T[keyof T][]] {
  const [first, ...rest] = Object.values(source) as T[keyof T][];

  if (first === undefined) {
    throw new Error("enumValues: o enum precisa ter ao menos um valor");
  }

  return [first, ...rest];
}
