import { Clipboard, Loader2, MailPlus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppRole, PermissionAction, PermissionResource, can } from "@shared/auth/permissions";
import {
  InviteTeamMemberResponseSchema,
  TeamMutationResponseSchema,
  TeamOverviewSchema,
  type TeamInvitation,
  type TeamMember,
} from "@shared/schemas/team.schema";
import { Badge } from "@web/components/badge";
import { Button } from "@web/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/card";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { LoadingScreen } from "@web/components/loading-screen";
import { useToast } from "@web/components/toast";
import { api, ApiRequestError } from "@web/lib/api";
import { useAppSession } from "@web/lib/use-app-session";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export function TeamPage() {
  const { toast } = useToast();
  const [version, setVersion] = useState(0);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>(AppRole.STAFF);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<{
    message: string;
    invitation: TeamInvitation;
  } | null>(null);
  const sessionState = useAppSession();
  const teamState = useKeyedFetch(`team:${version}`, (signal) =>
    api.get("/team", TeamOverviewSchema, { signal }),
  );

  if (sessionState.status === "loading" || teamState.status === "loading") {
    return <LoadingScreen label="Carregando equipe..." />;
  }

  if (sessionState.status === "error" || teamState.status === "error") {
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <h1 className="text-xl font-semibold">Equipe</h1>
        <p role="alert" className="mt-4 text-sm text-destructive">
          Você não tem acesso à equipe ou os dados não puderam ser carregados.
        </p>
      </div>
    );
  }

  const role = sessionState.data.role;
  const mayInvite = can(role, PermissionAction.INVITE, PermissionResource.TEAM);
  const mayUpdate = can(role, PermissionAction.UPDATE, PermissionResource.TEAM);
  const mayRemove = can(role, PermissionAction.DELETE, PermissionResource.TEAM);
  const inviteRoles =
    role === AppRole.OWNER
      ? [AppRole.OWNER, AppRole.MANAGER, AppRole.STAFF]
      : [AppRole.MANAGER, AppRole.STAFF];

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setPending("invite");

    try {
      const result = await api.post("/team/invitations", InviteTeamMemberResponseSchema, {
        email,
        role: inviteRole,
      });
      setEmail("");
      setDeliveryNotice({ message: result.delivery.message, invitation: result.invitation });
      setVersion((current) => current + 1);
      toast({ title: "Convite criado", variant: "success" });
    } catch (error) {
      setActionError(errorMessage(error, "Não foi possível criar o convite."));
    } finally {
      setPending(null);
    }
  }

  async function changeRole(member: TeamMember, nextRole: AppRole) {
    setPending(member.id);
    setActionError(null);
    try {
      await api.patch(`/team/members/${member.id}`, TeamMutationResponseSchema, { role: nextRole });
      setVersion((current) => current + 1);
      toast({ title: "Papel atualizado", variant: "success" });
    } catch (error) {
      setActionError(errorMessage(error, "Não foi possível alterar o papel."));
    } finally {
      setPending(null);
    }
  }

  async function removeMember(member: TeamMember) {
    setPending(member.id);
    setActionError(null);
    try {
      await api.delete(`/team/members/${member.id}`, TeamMutationResponseSchema);
      setVersion((current) => current + 1);
      toast({ title: "Membro removido", variant: "success" });
    } catch (error) {
      setActionError(errorMessage(error, "Não foi possível remover o membro."));
    } finally {
      setPending(null);
    }
  }

  async function cancelInvitation(invitation: TeamInvitation) {
    setPending(invitation.id);
    setActionError(null);
    try {
      await api.delete(`/team/invitations/${invitation.id}`, TeamMutationResponseSchema);
      setVersion((current) => current + 1);
      toast({ title: "Convite cancelado", variant: "success" });
    } catch (error) {
      setActionError(errorMessage(error, "Não foi possível cancelar o convite."));
    } finally {
      setPending(null);
    }
  }

  async function copyInvite(invitation: TeamInvitation) {
    await navigator.clipboard.writeText(invitation.acceptUrl);
    toast({ title: "Link de convite copiado", variant: "success" });
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div>
        <h1 className="text-xl font-semibold">Equipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Convide pessoas e controle o acesso ao painel da empresa.
        </p>
      </div>

      {mayInvite && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Convidar membro</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={invite}
              className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
            >
              <div>
                <Label htmlFor="team-email">E-mail</Label>
                <Input
                  id="team-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="team-role">Papel</Label>
                <select
                  id="team-role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as AppRole)}
                  className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {inviteRoles.map((option) => (
                    <option key={option} value={option}>
                      {ROLE_LABEL[option]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={pending !== null || email.trim() === ""}>
                {pending === "invite" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MailPlus className="h-4 w-4" aria-hidden="true" />
                )}
                Convidar
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {deliveryNotice && (
        <div role="status" className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm">
          <p>{deliveryNotice.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
              {deliveryNotice.invitation.acceptUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyInvite(deliveryNotice.invitation)}
            >
              <Clipboard className="h-4 w-4" aria-hidden="true" />
              Copiar link
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <section aria-labelledby="members-heading" className="mt-8">
        <h2 id="members-heading" className="text-lg font-semibold">
          Membros
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {teamState.data.members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">
                  {member.name}
                  {member.userId === sessionState.data.user.id ? " (você)" : ""}
                </p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {mayUpdate ? (
                  <select
                    aria-label={`Papel de ${member.name}`}
                    value={member.role}
                    disabled={pending === member.id}
                    onChange={(event) => changeRole(member, event.target.value as AppRole)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {Object.values(AppRole).map((option) => (
                      <option key={option} value={option}>
                        {ROLE_LABEL[option]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
                )}
                {mayRemove && member.userId !== sessionState.data.user.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending === member.id}
                    onClick={() => removeMember(member)}
                    aria-label={`Remover ${member.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {teamState.data.invitations.length > 0 && (
        <section aria-labelledby="invitations-heading" className="mt-8">
          <h2 id="invitations-heading" className="text-lg font-semibold">
            Convites pendentes
          </h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {teamState.data.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {ROLE_LABEL[invitation.role]} · expira em {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyInvite(invitation)}
                  >
                    Copiar link
                  </Button>
                  {mayInvite && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending === invitation.id}
                      onClick={() => cancelInvitation(invitation)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.body.message : fallback;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
