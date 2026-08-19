import { RoomBlockNotFoundError } from "../domain/errors";
import type { RoomBlock } from "../domain/room-block.entity";
import type { RoomBlockRepository } from "../domain/room-block.repository";

export class DeleteRoomBlockUseCase {
  constructor(private readonly blocks: RoomBlockRepository) {}

  async execute(
    id: string,
    companyId: string,
    scope: "occurrence" | "series",
  ): Promise<RoomBlock[]> {
    const existing = await this.blocks.findById(id, companyId);
    if (!existing) throw new RoomBlockNotFoundError(id);

    const deleted = await this.blocks.delete(id, companyId, scope);
    if (deleted.length === 0) throw new RoomBlockNotFoundError(id);
    return deleted;
  }
}
