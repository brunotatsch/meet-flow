import { Download } from "lucide-react";
import { useState } from "react";
import { ReportPeriodSchema, ReportResponseSchema } from "@shared/schemas/report.schema";
import { Button } from "@web/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/card";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { LoadingScreen } from "@web/components/loading-screen";
import { currencyFormatter } from "@web/lib/money";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

function initialPeriod(): { from: string; to: string } {
  const today = new Date();
  const to = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const from = `${to.slice(0, 8)}01`;
  return { from, to };
}

export function ReportsPage() {
  const initial = initialPeriod();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const parsedPeriod = ReportPeriodSchema.safeParse({ from, to });
  const validPeriod = parsedPeriod.success;
  const periodError = parsedPeriod.success
    ? null
    : (parsedPeriod.error.issues[0]?.message ?? "Selecione um período válido.");
  const query = new URLSearchParams({ from, to }).toString();
  const state = useKeyedFetch(validPeriod ? `reports:${query}` : null, (signal) =>
    fetchReport(query, signal),
  );

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ocupação considera reservas confirmadas; receita considera somente pagamentos Stripe
            concluídos.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="report-from">De</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 w-auto"
            />
          </div>
          <div>
            <Label htmlFor="report-to">Até</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 w-auto"
            />
          </div>
          <Button variant="outline" asChild>
            <a
              href={validPeriod ? `/api/v1/reports.csv?${query}` : undefined}
              aria-disabled={!validPeriod}
              onClick={(event) => {
                if (!validPeriod) event.preventDefault();
              }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar CSV
            </a>
          </Button>
        </div>
      </div>

      {periodError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {periodError}
        </p>
      )}

      {validPeriod && state.status === "loading" && (
        <LoadingScreen label="Calculando indicadores..." />
      )}

      {validPeriod && state.status === "error" && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          Não foi possível carregar os relatórios.
        </p>
      )}

      {validPeriod && state.status === "ready" && <ReportDashboard report={state.data} />}
    </div>
  );
}

async function fetchReport(query: string, signal: AbortSignal) {
  const response = await fetch(`/api/v1/reports?${query}`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
  return ReportResponseSchema.parse(await response.json());
}

function ReportDashboard({ report }: { report: ReturnType<typeof ReportResponseSchema.parse> }) {
  const summary = report.summary;
  const indicators = [
    ["Ocupação", percent(summary.occupancyRate)],
    ["Receita", currencyFormatter.format(summary.revenueInCents / 100)],
    ["Ticket médio", currencyFormatter.format(summary.averageTicketInCents / 100)],
    ["Cancelamentos", percent(summary.cancellationRate)],
    ["Horário de pico", summary.peakHour === null ? "Sem dados" : `${summary.peakHour}:00`],
  ] as const;

  return (
    <>
      <section
        aria-label="Indicadores principais"
        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        {indicators.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ocupação por dia</CardTitle>
          </CardHeader>
          <CardContent>
            {report.occupancyByDay.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <BarChart
                rows={report.occupancyByDay.map((day) => ({
                  key: day.date,
                  label: formatDate(day.date),
                  value: day.occupancyRate,
                  valueLabel: percent(day.occupancyRate),
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receita por sala</CardTitle>
          </CardHeader>
          <CardContent>
            {report.revenueByRoom.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem salas no período.</p>
            ) : (
              <BarChart
                rows={report.revenueByRoom.map((room) => ({
                  key: room.roomId,
                  label: room.roomName,
                  value: room.revenueInCents,
                  valueLabel: currencyFormatter.format(room.revenueInCents / 100),
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BarChart({
  rows,
}: {
  rows: Array<{ key: string; label: string; value: number; valueLabel: string }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{row.label}</span>
            <span className="font-medium">{row.valueLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, (row.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function percent(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
