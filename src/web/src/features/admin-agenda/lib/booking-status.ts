import type { BookingResponse } from "@shared/schemas/booking.schema";

export const STATUS_LABEL: Record<BookingResponse["status"], string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Concluída",
  no_show: "Não compareceu",
};
