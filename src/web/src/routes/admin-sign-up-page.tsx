import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SignUpSchema } from "@shared/schemas/company.schema";
import { companyTypeValues } from "@shared/enums/company-type";
import { SessionSchema } from "@shared/schemas/auth.schema";
import { Button } from "@web/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/card";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { api, ApiRequestError } from "@web/lib/api";

const COMPANY_TYPE_LABEL: Record<(typeof companyTypeValues)[number], string> = {
  hotel: "Hotel",
  coworking: "Coworking",
};

/** Todo fuso IANA válido, sem depender de uma lista mantida à mão. */
function timezoneOptions(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return ["America/Sao_Paulo"];
}

type FieldErrors = Partial<Record<"name" | "email" | "password" | "companyName" | "slug", string>>;

export function AdminSignUpPage() {
  const navigate = useNavigate();
  const timezones = useMemo(() => timezoneOptions(), []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<(typeof companyTypeValues)[number]>("hotel");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      user: { name, email, password },
      company: { name: companyName, slug, type, timezone },
    };

    const parsed = SignUpSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (path === "user.name") nextErrors.name ??= issue.message;
        else if (path === "user.email") nextErrors.email ??= issue.message;
        else if (path === "user.password") nextErrors.password ??= issue.message;
        else if (path === "company.name") nextErrors.companyName ??= issue.message;
        else if (path === "company.slug") nextErrors.slug ??= issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await api.post("/sign-up", SessionSchema, parsed.data);
      navigate("/admin", { replace: true });
    } catch (error) {
      setSubmitting(false);

      if (error instanceof ApiRequestError && error.status === 409) {
        if (error.body.code === "SLUG_ALREADY_TAKEN") {
          setErrors({ slug: error.body.message });
          return;
        }
        if (error.body.code === "EMAIL_ALREADY_REGISTERED") {
          setErrors({ email: error.body.message });
          return;
        }
      }

      setErrors({
        companyName:
          error instanceof ApiRequestError ? error.body.message : "Não foi possível criar a conta.",
      });
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cadastre sua empresa</CardTitle>
          <CardDescription>Crie sua conta e o perfil do hotel ou coworking.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <Label htmlFor="signup-name">Seu nome</Label>
              <Input
                id="signup-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                invalid={Boolean(errors.name)}
                className="mt-1.5"
              />
              {errors.name && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="signup-email">E-mail</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                invalid={Boolean(errors.email)}
                className="mt-1.5"
              />
              {errors.email && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="signup-password">Senha</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                invalid={Boolean(errors.password)}
                className="mt-1.5"
              />
              {errors.password && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {errors.password}
                </p>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <Label htmlFor="signup-company-name">Nome da empresa</Label>
              <Input
                id="signup-company-name"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                invalid={Boolean(errors.companyName)}
                className="mt-1.5"
              />
              {errors.companyName && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {errors.companyName}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="signup-slug">Endereço público</Label>
              <div className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
                <span className="shrink-0">{window.location.origin}/</span>
                <Input
                  id="signup-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase())}
                  invalid={Boolean(errors.slug)}
                  placeholder="hotel-central"
                />
              </div>
              {errors.slug && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {errors.slug}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="signup-type">Tipo</Label>
              <select
                id="signup-type"
                value={type}
                onChange={(event) => setType(event.target.value as (typeof companyTypeValues)[number])}
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {companyTypeValues.map((value) => (
                  <option key={value} value={value}>
                    {COMPANY_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="signup-timezone">Fuso horário</Label>
              <select
                id="signup-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {timezones.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? "Criando conta..." : "Criar conta"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link to="/admin/login" className="text-primary underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
