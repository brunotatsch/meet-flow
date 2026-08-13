import { Users } from "lucide-react";
import type { PublicRoomResponse } from "@shared/schemas/room.schema";
import { Badge } from "@web/components/badge";
import { Button } from "@web/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@web/components/card";
import { currencyFormatter } from "../lib/format-time";

export function RoomCard({
  room,
  onSelect,
}: {
  room: PublicRoomResponse;
  onSelect: (room: PublicRoomResponse) => void;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      {room.photoUrl ? (
        <img src={room.photoUrl} alt="" className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
          Sem foto
        </div>
      )}
      <CardHeader>
        <CardTitle>{room.name}</CardTitle>
        {room.description && <p className="text-sm text-muted-foreground">{room.description}</p>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>Até {room.capacity} pessoas</span>
        </div>
        {room.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {room.amenities.map((amenity) => (
              <Badge key={amenity} variant="secondary">
                {amenity}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {currencyFormatter.format(room.hourlyRateInCents / 100)}
          <span className="text-muted-foreground">/hora</span>
        </span>
        <Button onClick={() => onSelect(room)}>Selecionar</Button>
      </CardFooter>
    </Card>
  );
}
