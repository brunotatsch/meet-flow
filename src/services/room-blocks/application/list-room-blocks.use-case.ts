import type { CompanyRepository } from "@services/companies/domain/company.repository";
import { InvalidRoomBlockDataError } from "../domain/errors";
import type { RoomBlock } from "../domain/room-block.entity";
import type { RoomBlockRepository } from "../domain/room-block.repository";

export interface ListRoomBlocksCommand {
  companyId: string;
  from: Date;
  to: Date;
  roomId?: string;
}

export class ListRoomBlocksUseCase {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly blocks: RoomBlockRepository,
  ) {}

  async execute(
    command: ListRoomBlocksCommand,
  ): Promise<{ timezone: string; blocks: RoomBlock[] }> {
    if (
      Number.isNaN(command.from.getTime()) ||
      Number.isNaN(command.to.getTime()) ||
      command.to <= command.from
    ) {
      throw new InvalidRoomBlockDataError("to deve ser posterior a from.");
    }

    const company = await this.companies.findById(command.companyId);
    if (!company) throw new InvalidRoomBlockDataError("Empresa autenticada não encontrada.");

    return {
      timezone: company.timezone,
      blocks: await this.blocks.listByCompany(command.companyId, {
        from: command.from,
        to: command.to,
        roomId: command.roomId,
      }),
    };
  }
}
