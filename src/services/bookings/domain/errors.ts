export class InvalidAvailabilityDateError extends Error {
  constructor(readonly date: string) {
    super(`Data "${date}" inválida: use o formato YYYY-MM-DD com uma data existente.`);
    this.name = "InvalidAvailabilityDateError";
  }
}
