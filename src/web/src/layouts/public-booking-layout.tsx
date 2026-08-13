import { Outlet, useParams } from "react-router-dom";

export interface PublicBookingContext {
  companySlug: string;
}

/**
 * Casco do wizard público (`/:companySlug/agendar/*`), sem sessão.
 *
 * Não busca o perfil da empresa aqui: cada passo do wizard (MVP-10) decide o que
 * precisa carregar, e todos recebem o `companySlug` já resolvido via
 * `useOutletContext<PublicBookingContext>()`.
 */
export function PublicBookingLayout() {
  const { companySlug } = useParams<{ companySlug: string }>();

  if (!companySlug) {
    throw new Error("PublicBookingLayout montado sem :companySlug na rota.");
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Outlet context={{ companySlug } satisfies PublicBookingContext} />
      </main>
    </div>
  );
}
