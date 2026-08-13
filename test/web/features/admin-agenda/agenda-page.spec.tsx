import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { AgendaPage } from "@web/features/admin-agenda/agenda-page";

const session = {
  user: { id: "user-1", name: "Bruno Tatsch", email: "bruno@exemplo.com" },
  company: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Hotel Central",
    slug: "hotel-central",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  },
  role: "owner",
};

const roomAtlantico = {
  id: "22222222-2222-4222-8222-222222222222",
  companyId: session.company.id,
  name: "Sala Atlântico",
  description: null,
  capacity: 10,
  hourlyRateInCents: 12_000,
  amenities: [],
  photoUrl: null,
  isActive: true,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

const roomPacifico = { ...roomAtlantico, id: "33333333-3333-4333-8333-333333333333", name: "Sala Pacífico" };

const TODAY = new Date().toISOString().slice(0, 10);

function bookingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    companyId: session.company.id,
    roomId: roomAtlantico.id,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    customerPhone: "11999999999",
    startsAt: `${TODAY}T09:00:00-03:00`,
    endsAt: `${TODAY}T10:00:00-03:00`,
    status: "confirmed",
    totalInCents: 12_000,
    notes: null,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AgendaPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgendaPage", () => {
  it("mostra uma coluna por sala ativa e os blocos de reserva com o horário local", async () => {
    const booking = bookingFixture();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [roomAtlantico, roomPacifico]));
        if (input.includes("/bookings?date=")) return Promise.resolve(jsonResponse(200, [booking]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    expect(await screen.findByText("Sala Atlântico")).toBeInTheDocument();
    expect(screen.getByText("Sala Pacífico")).toBeInTheDocument();
    expect(screen.getByText("Ana Prado")).toBeInTheDocument();
    expect(screen.getByText(/09:00–10:00/)).toBeInTheDocument();
    expect(screen.getByText(/Horários em America\/Sao_Paulo/)).toBeInTheDocument();
  });

  it("mostra o estado vazio quando não há reservas no dia", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [roomAtlantico]));
        if (input.includes("/bookings?date=")) return Promise.resolve(jsonResponse(200, []));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    expect(await screen.findByText("Nenhuma reserva neste dia.")).toBeInTheDocument();
  });

  it("ao clicar num bloco, abre o painel de detalhe com o contato do cliente", async () => {
    const user = userEvent.setup();
    const booking = bookingFixture();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [roomAtlantico]));
        if (input.includes("/bookings?date=")) return Promise.resolve(jsonResponse(200, [booking]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await user.click(await screen.findByText("Ana Prado"));

    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveTextContent("ana@exemplo.com");
    expect(panel).toHaveTextContent("11999999999");
    expect(panel).toHaveTextContent("Sala Atlântico");
  });

  it("cancela a reserva só depois de confirmar, com toast de sucesso", async () => {
    const user = userEvent.setup();
    const booking = bookingFixture();
    let deleteCalled = false;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [roomAtlantico]));
        if (input.endsWith(`/bookings/${booking.id}`) && init?.method === "DELETE") {
          deleteCalled = true;
          return Promise.resolve(jsonResponse(200, { ...booking, status: "cancelled" }));
        }
        if (input.includes("/bookings?date=")) {
          return Promise.resolve(jsonResponse(200, deleteCalled ? [] : [booking]));
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await user.click(await screen.findByText("Ana Prado"));

    await user.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    // Ainda não chamou a API: só mostrou a confirmação inline.
    expect(deleteCalled).toBe(false);
    expect(screen.getByText(/Não pode ser desfeito/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    expect(await screen.findByText("Reserva cancelada")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navega para o dia seguinte e busca a agenda de novo", async () => {
    const user = userEvent.setup();
    const requestedDates: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [roomAtlantico]));
        if (input.includes("/bookings?date=")) {
          requestedDates.push(new URL(input, "http://localhost").searchParams.get("date")!);
          return Promise.resolve(jsonResponse(200, []));
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Nenhuma reserva neste dia.");

    await user.click(screen.getByRole("button", { name: "Próximo dia" }));

    await waitFor(() => expect(requestedDates).toHaveLength(2));
    expect(requestedDates[0]).not.toBe(requestedDates[1]);
  });
});
