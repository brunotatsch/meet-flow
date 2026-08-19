import { LogOut } from "lucide-react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { PermissionAction, PermissionResource, can } from "@shared/auth/permissions";
import { Button } from "@web/components/button";
import { LoadingScreen } from "@web/components/loading-screen";
import { cn } from "@web/lib/utils";
import { signOut, useSession } from "@web/lib/auth-client";
import { useAppSession } from "@web/lib/use-app-session";

interface AdminNavLink {
  to: string;
  label: string;
  end: boolean;
  permission?: readonly [PermissionAction, PermissionResource];
}

const NAV_LINKS: AdminNavLink[] = [
  { to: "/admin", label: "Salas", end: true },
  { to: "/admin/agenda", label: "Agenda", end: false },
  {
    to: "/admin/equipe",
    label: "Equipe",
    end: false,
    permission: [PermissionAction.READ, PermissionResource.TEAM] as const,
  },
  {
    to: "/admin/billing",
    label: "Plano",
    end: false,
    permission: [PermissionAction.READ, PermissionResource.BILLING] as const,
  },
  {
    to: "/admin/relatorios",
    label: "Relatórios",
    end: false,
    permission: [PermissionAction.READ, PermissionResource.REPORT] as const,
  },
];

/**
 * Casco das telas administrativas (`/admin/*`), atrás de sessão.
 *
 * `useSession` decide entre três estados: `isPending` (ainda não se sabe se há
 * sessão - mostra loading em vez de piscar um redirect), sem sessão (manda para o
 * login, guardando a rota de origem em `state.from` para voltar depois) e sessão
 * válida (`Outlet`, atrás da navegação persistente entre Salas e Agenda).
 */
export function AdminLayout() {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const appSession = useAppSession();

  if (isPending) {
    return <LoadingScreen label="Verificando sessão..." />;
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  async function handleSignOut() {
    await signOut();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <nav className="flex items-center gap-1" aria-label="Navegação administrativa">
          {NAV_LINKS.filter(
            (link) =>
              !link.permission ||
              (appSession.status === "ready" &&
                can(appSession.data.role, link.permission[0], link.permission[1])),
          ).map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </Button>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
