export const BookingEmailEventKind = {
  CONFIRMATION: "booking_confirmation_customer",
  NEW_BOOKING: "booking_new_company",
  CANCELLATION: "booking_cancellation_customer",
  REMINDER: "booking_reminder_customer",
  GENERIC: "generic",
} as const;

export type BookingEmailEventKind =
  (typeof BookingEmailEventKind)[keyof typeof BookingEmailEventKind];
