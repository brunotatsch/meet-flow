import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/card";

/**
 * Placeholder: o formulário de login real (e-mail/senha via `authClient.signIn`,
 * tratamento de credencial inválida, redirecionamento pós-login) é a MVP-11. Esta
 * página só existe para a rota `/admin/login` ter um destino válido - é para onde
 * `AdminLayout` redireciona quem chega em `/admin/*` sem sessão.
 */
export function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>O formulário de login chega na MVP-11.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
