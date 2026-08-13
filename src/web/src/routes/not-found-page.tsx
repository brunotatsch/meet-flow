import { Link } from "react-router-dom";
import { Button } from "@web/components/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        O endereço que você acessou não existe ou foi movido.
      </p>
      <Button asChild>
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
