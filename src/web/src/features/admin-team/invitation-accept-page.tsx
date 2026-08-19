import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SessionSchema } from "@shared/schemas/auth.schema";
import { InvitationPublicSchema, TeamMutationResponseSchema } from "@shared/schemas/team.schema";
import { Button } from "@web/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/card";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { LoadingScreen } from "@web/components/loading-screen";
import { api, ApiRequestError } from "@web/lib/api";
import { useSession } from "@web/lib/auth-client";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

export function InvitationAcceptPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const navigate = useNavigate();
  const { data: authSession, isPending: sessionPending } = useSession();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invitationState = useKeyedFetch(invitationId ?? null, (signal) =>
    api.get(`/team/invitations/${invitationId}`, InvitationPublicSchema, { signal }),
  );

  if (invitationState.status === "loading" || sessionPending) {
    return <LoadingScreen label="Verificando convite..." />;
  }

  if (invitationState.status === "error") {
    return (
      <InvitationMessage
        title="Convite não encontrado"
        description="Confira se o link está completo."
      />
    );
  }

  const invitation = invitationState.data;
  if (!invitation.actionable) {
    const description =
      invitation.status === "expired"
        ? "Este convite expirou. Peça a um owner ou manager para enviar outro."
        : "Este convite já foi utilizado ou cancelado.";
    return <InvitationMessage title="Convite indisponível" description={description} />;
  }

  async function acceptExistingAccount() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/team/invitations/${invitationId}/accept`, TeamMutationResponseSchema);
      navigate("/admin", { replace: true });
    } catch (requestError) {
      setSubmitting(false);
      setError(messageOf(requestError));
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/team/invitations/${invitationId}/register`, SessionSchema, {
        name,
        password,
      });
      navigate("/admin", { replace: true });
    } catch (requestError) {
      setSubmitting(false);
      setError(messageOf(requestError));
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Entrar em {invitation.organizationName}</CardTitle>
          <CardDescription>
            Convite para {invitation.email} como {invitation.role}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {authSession ? (
            <Button className="w-full" onClick={acceptExistingAccount} disabled={submitting}>
              {submitting ? "Aceitando..." : "Aceitar convite"}
            </Button>
          ) : (
            <>
              <form onSubmit={register} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="invite-name">Seu nome</Label>
                  <Input
                    id="invite-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1.5"
                    minLength={2}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="invite-password">Crie uma senha</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1.5"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Criando acesso..." : "Criar conta e aceitar"}
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link
                  to="/admin/login"
                  state={{ from: { pathname: `/admin/convite/${invitationId}` } }}
                  className="text-primary underline"
                >
                  Entre para aceitar
                </Link>
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InvitationMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function messageOf(error: unknown): string {
  return error instanceof ApiRequestError
    ? error.body.message
    : "Não foi possível aceitar o convite.";
}
