import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingScreen } from "@web/components/loading-screen";
import { useSession } from "@web/lib/auth-client";

/**
 * Casco das telas administrativas (`/admin/*`), atrás de sessão.
 *
 * `useSession` decide entre três estados: `isPending` (ainda não se sabe se há
 * sessão - mostra loading em vez de piscar um redirect), sem sessão (manda para o
 * login, guardando a rota de origem em `state.from` para voltar depois) e sessão
 * válida (`Outlet`). O login em si é a MVP-11; aqui só existe o guard.
 */
export function AdminLayout() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return <LoadingScreen label="Verificando sessão..." />;
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return (
    <div className="min-h-dvh bg-background">
      <Outlet />
    </div>
  );
}
