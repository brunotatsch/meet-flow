import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { AgendaPage } from "@web/features/admin-agenda/agenda-page";
import { shiftIsoDate, startOfIsoWeek } from "@web/lib/format-time";

const TODAY = new Date().toISOString().slice(0, 10);
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
const room = {
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

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    companyId: session.company.id,
    roomId: room.id,
    customerName: "Ana Prado",
    customerEmail: "ana@exemplo.com",
    customerPhone: null,
    startsAt: `${TODAY}T09:00:00-03:00`,
    endsAt: `${TODAY}T10:00:00-03:00`,
    status: "confirmed",
    totalInCents: 12_000,
    notes: null,
    expiresAt: null,
    stripeCheckoutSessionId: null,
    checkedInAt: null,
    checkedOutAt: null,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function roomBlock() {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    companyId: session.company.id,
    roomId: room.id,
    startsAt: `${TODAY}T11:00:00-03:00`,
    endsAt: `${TODAY}T12:00:00-03:00`,
    reason: "Manutenção do projetor",
    createdBy: "user-1",
    recurrenceGroupId: null,
    createdAt: "2030-01-01T00:00:00.000Z",
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

describe("operações avançadas da agenda", () => {
  it("mostra bloqueios de sala com tratamento visual distinto das reservas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.includes("/bookings?")) return Promise.resolve(jsonResponse(200, []));
        if (input.includes("/room-blocks?")) {
          return Promise.resolve(
            jsonResponse(200, {
              timezone: session.company.timezone,
              items: [roomBlock()],
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    expect(
      await screen.findByLabelText("Bloqueio: Manutenção do projetor, 11:00–12:00"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma reserva neste dia.")).not.toBeInTheDocument();
  });

  it("carrega a semana inteira em uma única requisição, independentemente das salas", async () => {
    const bookingRequests: string[] = [];
    const secondRoom = { ...room, id: "33333333-3333-4333-8333-333333333333", name: "Sala Sul" };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room, secondRoom]));
        if (input.includes("/bookings?")) {
          bookingRequests.push(input);
          return Promise.resolve(jsonResponse(200, []));
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nenhuma reserva neste dia.");
    await user.click(screen.getByRole("button", { name: "Semana" }));
    await screen.findByText("Nenhuma reserva nesta semana.");

    expect(bookingRequests.filter((url) => url.includes("weekStart="))).toHaveLength(1);
    expect(screen.getByText("Sala Atlântico")).toBeInTheDocument();
    expect(screen.getByText("Sala Sul")).toBeInTheDocument();
  });

  it("cria um walk-in pelo endpoint administrativo", async () => {
    let posted: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.endsWith("/bookings") && init?.method === "POST") {
          posted = JSON.parse(String(init.body)) as Record<string, unknown>;
          return Promise.resolve(jsonResponse(201, booking()));
        }
        if (input.includes("/bookings?")) return Promise.resolve(jsonResponse(200, []));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Nova reserva manual" }));
    await user.type(screen.getByLabelText("Nome"), "Cliente Balcão");
    await user.type(screen.getByLabelText("E-mail"), "balcao@exemplo.com");
    await user.click(screen.getByRole("button", { name: "Criar reserva" }));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted).toMatchObject({
      roomId: room.id,
      customerName: "Cliente Balcão",
      customerEmail: "balcao@exemplo.com",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(await screen.findByText("Reserva manual criada")).toBeInTheDocument();
  });

  it("pede confirmação explícita ao fazer check-in fora da janela", async () => {
    const confirm = vi.fn(() => true);
    const checkInBodies: Record<string, unknown>[] = [];
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.endsWith(`/bookings/${booking().id}/check-in`) && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          checkInBodies.push(body);
          if (body.confirmOutsideWindow === false) {
            return Promise.resolve(
              jsonResponse(409, {
                code: "CHECK_IN_OUTSIDE_WINDOW_CONFIRMATION_REQUIRED",
                message: "Confirme para continuar.",
              }),
            );
          }
          return Promise.resolve(
            jsonResponse(200, booking({ checkedInAt: new Date().toISOString() })),
          );
        }
        if (input.includes("/bookings?")) return Promise.resolve(jsonResponse(200, [booking()]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText("Ana Prado"));
    await user.click(screen.getByRole("button", { name: "Fazer check-in" }));

    await waitFor(() => expect(checkInBodies).toHaveLength(2));
    expect(confirm).toHaveBeenCalledOnce();
    expect(checkInBodies).toEqual([
      { confirmOutsideWindow: false },
      { confirmOutsideWindow: true },
    ]);
    expect(await screen.findByText("Check-in registrado")).toBeInTheDocument();
  });

  it("confirma o drag e trata conflito 409 sem mover o bloco localmente", async () => {
    const confirm = vi.fn(() => true);
    let patchCalled = false;
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.endsWith(`/bookings/${booking().id}/reschedule`) && init?.method === "PATCH") {
          patchCalled = true;
          return Promise.resolve(
            jsonResponse(409, { code: "BOOKING_CONFLICT", message: "Horário ocupado." }),
          );
        }
        if (input.includes("/bookings?")) return Promise.resolve(jsonResponse(200, [booking()]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Semana" }));
    const card = (await screen.findByText("Ana Prado")).closest("button")!;
    const weekStart = startOfIsoWeek(TODAY);
    const targetDate = Array.from({ length: 7 }, (_, index) => shiftIsoDate(weekStart, index)).find(
      (day) => day !== TODAY,
    )!;
    const target = screen.getByTestId(`week-cell-${room.id}-${targetDate}`);
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(patchCalled).toBe(true));
    expect(confirm).toHaveBeenCalledOnce();
    expect(await screen.findByText("O novo horário já está ocupado.")).toBeInTheDocument();
  });
});
