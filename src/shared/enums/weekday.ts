import { enumValues } from "./enum-values";

/** 0 = domingo ... 6 = sábado, mesma convenção da coluna `weekday` de `room_schedules`. */
export const Weekday = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export const weekdayValues = enumValues(Weekday);
