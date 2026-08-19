import { enumValues } from "./enum-values";

export const BookingStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "no_show",
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const bookingStatusValues = enumValues(BookingStatus);
