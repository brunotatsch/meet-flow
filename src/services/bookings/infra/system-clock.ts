import { Clock } from "../domain/clock";

/** Relógio de produção. Vive em `infra/` porque ler a hora do processo é efeito colateral. */
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
