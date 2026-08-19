import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "@web/features/admin-reports/reports-page";

const response = {
  period: { from: "2030-06-01", to: "2030-06-30" },
  timezone: "America/Sao_Paulo",
  summary: {
    totalBookings: 4,
    paidBookings: 3,
    cancelledBookings: 1,
    occupancyRate: 25,
    cancellationRate: 25,
    revenueInCents: 30_000,
    averageTicketInCents: 10_000,
    peakHour: 9,
  },
  occupancyByRoom: [
    {
      roomId: "11111111-1111-4111-8111-111111111111",
      roomName: "Sala Norte",
      bookedMinutes: 120,
      availableMinutes: 480,
      occupancyRate: 25,
    },
  ],
  occupancyByDay: [
    { date: "2030-06-01", bookedMinutes: 120, availableMinutes: 480, occupancyRate: 25 },
  ],
  revenueByRoom: [
    {
      roomId: "11111111-1111-4111-8111-111111111111",
      roomName: "Sala Norte",
      bookings: 3,
      revenueInCents: 30_000,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportsPage", () => {
  it("mostra indicadores, gráficos e link CSV do mesmo período", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    render(<ReportsPage />);

    expect((await screen.findAllByText(/R\$\s*300,00/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(screen.getByText("Sala Norte")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exportar CSV" })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/v1/reports.csv?"),
    );
    const exportUrl = new URL(
      screen.getByRole("link", { name: "Exportar CSV" }).getAttribute("href")!,
      "https://meet-flow.test",
    );
    expect(exportUrl.searchParams.get("from")).toBe(
      (screen.getByLabelText("De") as HTMLInputElement).value,
    );
    expect(exportUrl.searchParams.get("to")).toBe(
      (screen.getByLabelText("Até") as HTMLInputElement).value,
    );
  });

  it("recusa período invertido sem chamar a API", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(response), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ReportsPage />);
    await screen.findAllByText(/R\$\s*300,00/);
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2000-01-01" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/data final/);
    expect(screen.queryByText("Calculando indicadores...")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(callsBefore));
  });

  it("mostra falha de carregamento sem manter o indicador de progresso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
    );

    render(<ReportsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar/i);
    expect(screen.queryByText("Calculando indicadores...")).not.toBeInTheDocument();
  });

  it("mostra os estados vazios quando ainda não há dados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...response,
              summary: {
                totalBookings: 0,
                paidBookings: 0,
                cancelledBookings: 0,
                occupancyRate: 0,
                cancellationRate: 0,
                revenueInCents: 0,
                averageTicketInCents: 0,
                peakHour: null,
              },
              occupancyByRoom: [],
              occupancyByDay: [],
              revenueByRoom: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    render(<ReportsPage />);

    expect(await screen.findByText("Sem dados no período.")).toBeInTheDocument();
    expect(screen.getByText("Sem salas no período.")).toBeInTheDocument();
    expect(screen.getByText("Sem dados", { selector: ".text-2xl" })).toBeInTheDocument();
  });
});
