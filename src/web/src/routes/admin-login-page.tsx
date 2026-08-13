import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SignInSchema } from "@shared/schemas/auth.schema";
import { Button } from "@web/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/card";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { signIn } from "@web/lib/auth-client";

interface LocationState {
  from?: { pathname: string };
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = SignInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Informe um e-mail válido e a senha.");
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await signIn.email(parsed.data);
    setSubmitting(false);

    if (signInError) {
      setError("E-mail ou senha incorretos.");
      return;
    }

    const state = location.state as LocationState | null;
    navigate(state?.from?.pathname ?? "/admin", { replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>Acesse o painel administrativo da sua empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                invalid={Boolean(error)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="login-password">Senha</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                invalid={Boolean(error)}
                className="mt-1.5"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ainda não tem uma conta?{" "}
            <Link to="/admin/sign-up" className="text-primary underline-offset-4 hover:underline">
              Cadastre sua empresa
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
