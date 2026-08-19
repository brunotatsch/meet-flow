import type { CompanyRepository } from "@services/companies/domain/company.repository";
import {
  nextCalendarDate,
  parseCalendarDate,
  zonedTimeToInstant,
  type CalendarDate,
} from "@services/bookings/domain/time-zone";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import type { RoomRepository } from "@services/rooms/domain/room.repository";
import { InvalidRoomBlockDataError } from "../domain/errors";
import { RoomBlock } from "../domain/room-block.entity";
import type { RoomBlockRepository } from "../domain/room-block.repository";

const MAX_RECURRENCE_DAYS = 366;
const MINUTES_IN_HOUR = 60;

export interface CreateRoomBlocksCommand {
  companyId: string;
  roomId: string;
  createdBy: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  recurrence?: { frequency: "daily" | "weekly"; until: string };
}

/** Materializa recorrências para que constraint, consultas e remoção continuem simples. */
export class CreateRoomBlocksUseCase {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly rooms: RoomRepository,
    private readonly blocks: RoomBlockRepository,
  ) {}

  async execute(
    command: CreateRoomBlocksCommand,
  ): Promise<{ timezone: string; blocks: RoomBlock[] }> {
    const [company, room] = await Promise.all([
      this.companies.findById(command.companyId),
      this.rooms.findById(command.roomId, command.companyId),
    ]);

    if (!room) throw new RoomNotFoundError(command.roomId);
    if (!company) throw new InvalidRoomBlockDataError("Empresa autenticada não encontrada.");

    const firstDate = requiredCalendarDate(command.date, "date");
    const until = command.recurrence
      ? requiredCalendarDate(command.recurrence.until, "recurrence.until")
      : firstDate;
    const startMinutes = parseTime(command.startTime, "startTime");
    const endMinutes = parseTime(command.endTime, "endTime");

    if (endMinutes <= startMinutes) {
      throw new InvalidRoomBlockDataError("endTime deve ser posterior a startTime.");
    }

    const stepDays = command.recurrence?.frequency === "weekly" ? 7 : 1;
    const dates = materializeDates(firstDate, until, stepDays);
    const recurrenceGroupId = command.recurrence ? crypto.randomUUID() : null;
    const blocks = dates.map((date) =>
      RoomBlock.create({
        companyId: command.companyId,
        roomId: command.roomId,
        startsAt: zonedTimeToInstant(company.timezone, date, startMinutes),
        endsAt: zonedTimeToInstant(company.timezone, date, endMinutes),
        reason: command.reason,
        createdBy: command.createdBy,
        recurrenceGroupId,
      }),
    );

    await this.blocks.createSeries(blocks);

    return { timezone: company.timezone, blocks };
  }
}

function parseTime(value: string, field: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new InvalidRoomBlockDataError(`${field} deve estar no formato HH:mm.`);
  return Number(match[1]) * MINUTES_IN_HOUR + Number(match[2]);
}

function requiredCalendarDate(value: string, field: string): CalendarDate {
  const date = parseCalendarDate(value);
  if (!date) throw new InvalidRoomBlockDataError(`${field} deve ser uma data válida.`);
  return date;
}

function materializeDates(
  first: CalendarDate,
  until: CalendarDate,
  stepDays: number,
): CalendarDate[] {
  const firstNumber = calendarNumber(first);
  const untilNumber = calendarNumber(until);

  if (untilNumber < firstNumber) {
    throw new InvalidRoomBlockDataError("A recorrência não pode terminar antes de começar.");
  }

  if (untilNumber - firstNumber > MAX_RECURRENCE_DAYS) {
    throw new InvalidRoomBlockDataError(
      `A recorrência pode cobrir no máximo ${MAX_RECURRENCE_DAYS} dias.`,
    );
  }

  const dates: CalendarDate[] = [];
  let current = first;

  while (calendarNumber(current) <= untilNumber) {
    dates.push(current);
    for (let day = 0; day < stepDays; day += 1) current = nextCalendarDate(current);
  }

  return dates;
}

function calendarNumber(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) / 86_400_000;
}
