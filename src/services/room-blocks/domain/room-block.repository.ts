import type { RoomBlock } from "./room-block.entity";

export interface RoomBlockFilters {
  from: Date;
  to: Date;
  roomId?: string;
}

export interface BlockedPeriod {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
}

export interface OccupancyInterval {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Porta consumível pelo motor de disponibilidade e pelo fluxo de reserva.
 * A consulta melhora a resposta antecipada, mas a garantia sob concorrência mora
 * no trigger `enforce_room_occupancy`, instalado pela migration 0009.
 */
export abstract class RoomBlockOccupancyPort {
  abstract listBlockedPeriods(
    companyId: string,
    roomId: string,
    from: Date,
    to: Date,
  ): Promise<BlockedPeriod[]>;

  abstract hasConflict(
    companyId: string,
    roomId: string,
    interval: OccupancyInterval,
  ): Promise<boolean>;
}

export abstract class RoomBlockRepository extends RoomBlockOccupancyPort {
  abstract findById(id: string, companyId: string): Promise<RoomBlock | null>;
  abstract listByCompany(companyId: string, filters: RoomBlockFilters): Promise<RoomBlock[]>;

  /** Cria a série inteira em uma transação, após lock pessimista da sala. */
  abstract createSeries(blocks: RoomBlock[]): Promise<void>;

  /** Devolve as ocorrências removidas para auditoria. */
  abstract delete(
    id: string,
    companyId: string,
    scope: "occurrence" | "series",
  ): Promise<RoomBlock[]>;
}
