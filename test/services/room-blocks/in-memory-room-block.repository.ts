import type { RoomBlock } from "@services/room-blocks/domain/room-block.entity";
import {
  RoomBlockRepository,
  type BlockedPeriod,
  type OccupancyInterval,
  type RoomBlockFilters,
} from "@services/room-blocks/domain/room-block.repository";
import { RoomBlockConflictError } from "@services/room-blocks/domain/errors";

export class InMemoryRoomBlockRepository extends RoomBlockRepository {
  readonly items: RoomBlock[] = [];

  async findById(id: string, companyId: string): Promise<RoomBlock | null> {
    return this.items.find((block) => block.id === id && block.companyId === companyId) ?? null;
  }

  async listByCompany(companyId: string, filters: RoomBlockFilters): Promise<RoomBlock[]> {
    return this.items
      .filter(
        (block) =>
          block.companyId === companyId &&
          (!filters.roomId || block.roomId === filters.roomId) &&
          block.startsAt < filters.to &&
          block.endsAt > filters.from,
      )
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  }

  async listBlockedPeriods(
    companyId: string,
    roomId: string,
    from: Date,
    to: Date,
  ): Promise<BlockedPeriod[]> {
    return (await this.listByCompany(companyId, { roomId, from, to })).map((block) => ({
      id: block.id,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason,
    }));
  }

  async hasConflict(
    companyId: string,
    roomId: string,
    interval: OccupancyInterval,
  ): Promise<boolean> {
    return this.items.some(
      (block) =>
        block.companyId === companyId &&
        block.roomId === roomId &&
        block.startsAt < interval.endsAt &&
        block.endsAt > interval.startsAt,
    );
  }

  async createSeries(blocks: RoomBlock[]): Promise<void> {
    for (const block of blocks) {
      if (
        this.items.some(
          (existing) =>
            existing.roomId === block.roomId &&
            existing.startsAt < block.endsAt &&
            existing.endsAt > block.startsAt,
        )
      ) {
        throw new RoomBlockConflictError(block.roomId);
      }
    }
    this.items.push(...blocks);
  }

  async delete(
    id: string,
    companyId: string,
    scope: "occurrence" | "series",
  ): Promise<RoomBlock[]> {
    const existing = await this.findById(id, companyId);
    if (!existing) return [];
    const deleted = this.items.filter(
      (block) =>
        block.companyId === companyId &&
        (block.id === id ||
          (scope === "series" &&
            existing.recurrenceGroupId !== null &&
            block.recurrenceGroupId === existing.recurrenceGroupId)),
    );
    for (const block of deleted) this.items.splice(this.items.indexOf(block), 1);
    return deleted;
  }
}
