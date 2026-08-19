export interface PendingBookingExpirationRepository {
  expirePending(now: Date, companyId?: string, roomId?: string): Promise<number>;
}

export class ExpirePendingBookingsUseCase {
  constructor(private readonly bookings: PendingBookingExpirationRepository) {}

  execute(now = new Date()): Promise<number> {
    return this.bookings.expirePending(now);
  }
}
