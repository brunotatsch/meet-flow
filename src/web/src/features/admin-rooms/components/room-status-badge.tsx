import { Badge } from "@web/components/badge";

export function RoomStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Ativa" : "Inativa"}</Badge>
  );
}
