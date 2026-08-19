import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CreateRoomBlockSchema } from "@shared/schemas/room-block.schema";
import { HttpError } from "@services/http/http-error";
import { RoomBlockBookingConflictError } from "@services/room-blocks/domain/errors";
import { mapRoomBlockError } from "@services/room-blocks/infra/http/room-block-error";

describe("room block contracts", () => {
  it("valida intervalo e término da recorrência", () => {
    expect(
      CreateRoomBlockSchema.safeParse({
        roomId: "11111111-1111-4111-8111-111111111111",
        date: "2026-08-20",
        startTime: "14:00",
        endTime: "13:00",
        reason: "Manutenção",
        recurrence: { frequency: "daily", until: "2026-08-19" },
      }).success,
    ).toBe(false);
  });

  it("expõe reservas conflitantes no 409 sem dados do cliente", () => {
    const error = new RoomBlockBookingConflictError("room-1", [
      {
        id: "booking-1",
        startsAt: new Date("2026-08-20T12:00:00.000Z"),
        endsAt: new Date("2026-08-20T13:00:00.000Z"),
        status: "confirmed",
      },
    ]);

    expect(() => mapRoomBlockError(error)).toThrowError(
      expect.objectContaining({
        statusCode: 409,
        code: "ROOM_BLOCK_BOOKING_CONFLICT",
        details: {
          bookings: [
            {
              id: "booking-1",
              startsAt: "2026-08-20T12:00:00.000Z",
              endsAt: "2026-08-20T13:00:00.000Z",
              status: "confirmed",
            },
          ],
        },
      }) as HttpError,
    );
  });

  it("migration instala exclusão, mutex por sala, trigger cruzado e RLS", () => {
    const sql = readFileSync("drizzle/0009_room_blocks.sql", "utf8");

    expect(sql).toContain('CONSTRAINT "room_blocks_no_overlap"');
    expect(sql).toContain("EXCLUDE USING gist");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain('CREATE TRIGGER "bookings_enforce_room_occupancy"');
    expect(sql).toContain("bookings_room_blocks_no_overlap");
    expect(sql).toContain('ALTER TABLE "room_blocks" ENABLE ROW LEVEL SECURITY');
  });
});
