import { Clock } from "@services/bookings/domain/clock";

/** Relógio parado, para os testes de disponibilidade não dependerem da hora da suíte. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return this.current;
  }

  set(current: Date): void {
    this.current = current;
  }
}
