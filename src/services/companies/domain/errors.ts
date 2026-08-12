export class CompanyNotFoundError extends Error {
  constructor(readonly identifier: string) {
    super(`Empresa "${identifier}" não encontrada.`);
    this.name = "CompanyNotFoundError";
  }
}
