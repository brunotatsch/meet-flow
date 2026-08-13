import { Loader2 } from "lucide-react";

export function LoadingScreen({ label = "Carregando..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
