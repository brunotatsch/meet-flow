import { Room } from "../domain/room.entity";
import type { RoomRepository } from "../domain/room.repository";

export interface CreateRoomCommand {
  name: string;
  description?: string | null;
  capacity: number;
  hourlyRateInCents: number;
  amenities?: string[];
  photoUrl?: string | null;
}

/**
 * Nome duplicado na mesma empresa não é checado aqui: a constraint
 * `rooms_company_id_name_unique` decide, e `DrizzleRoomRepository.create`
 * traduz a violação em `DuplicateRoomNameError`. Checar antes do insert
 * abriria uma janela de corrida entre a leitura e a escrita.
 */
export class CreateRoomUseCase {
  constructor(private readonly roomRepository: RoomRepository) {}

  async execute(companyId: string, input: CreateRoomCommand): Promise<Room> {
    const room = Room.create({ companyId, ...input });

    await this.roomRepository.create(room);

    return room;
  }
}
