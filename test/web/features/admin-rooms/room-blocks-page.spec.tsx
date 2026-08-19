import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { RoomBlocksPage } from "@web/features/admin-rooms/room-blocks-page";

const companyId = "11111111-1111-4111-8111-111111111111";
const roomId = "22222222-2222-4222-8222-222222222222";
const blockId = "33333333-3333-4333-8333-333333333333";
const seriesId = "44444444-4444-4444-8444-444444444444";
const room = {
  id: roomId,
  companyId,
  name: "Sala Aurora",
  description: null,
  capacity: 8,
  hourlyRateInCents: 10_000,
  amenities: [],
  photoUrl: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const session = {
  user: { id: "user-1", name: "Ana", email: "ana@exemplo.com" },
  company: {
    id: companyId,
    name: "Hotel Aurora",
    slug: "hotel-aurora",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  },
  role: "owner",
};
const block = {
  id: blockId,
  companyId,
  roomId,
  startsAt: "2026-08-20T12:00:00-03:00",
  endsAt: "2026-08-20T13:00:00-03:00",
  reason: "Manutenção do projetor",
  createdBy: "user-1",
  recurrenceGroupId: seriesId,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? undefined : { "Content-Type": "application/json" },
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/rooms/${roomId}/blocks`]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/rooms/:id/blocks" element={<RoomBlocksPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("RoomBlocksPage", () => {
  it("lista bloqueios recorrentes com estilo e ações próprias", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith(`/rooms/${roomId}`)) return Promise.resolve(jsonResponse(200, room));
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.includes("/room-blocks?"))
          return Promise.resolve(
            jsonResponse(200, { timezone: "America/Sao_Paulo", items: [block] }),
          );
        throw new Error(`fetch não mockado: ${input}`);
      }),
    );

    renderPage();

    expect(await screen.findByText("Bloqueios de Sala Aurora")).toBeInTheDocument();
    expect(screen.getByText("Manutenção do projetor")).toBeInTheDocument();
    expect(screen.getByText("Ocorrência de uma série recorrente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover série" })).toBeInTheDocument();
  });

  it("cria recorrência diária enviando horários de parede", async () => {
    const user = userEvent.setup();
    let postedBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith(`/rooms/${roomId}`)) return Promise.resolve(jsonResponse(200, room));
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.includes("/room-blocks?") && (!init?.method || init.method === "GET"))
          return Promise.resolve(jsonResponse(200, { timezone: "America/Sao_Paulo", items: [] }));
        if (input.endsWith("/room-blocks") && init?.method === "POST") {
          postedBody = JSON.parse(init.body as string);
          return Promise.resolve(
            jsonResponse(201, { timezone: "America/Sao_Paulo", items: [block] }),
          );
        }
        throw new Error(`fetch não mockado: ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Bloqueios de Sala Aurora");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-08-20" } });
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "13:00" } });
    await user.type(screen.getByLabelText("Motivo"), "Almoço da equipe");
    await user.selectOptions(screen.getByLabelText("Repetição"), "daily");
    fireEvent.change(screen.getByLabelText("Repetir até"), { target: { value: "2026-08-22" } });
    await user.click(screen.getByRole("button", { name: "Criar bloqueio" }));

    await waitFor(() =>
      expect(postedBody).toEqual({
        roomId,
        date: "2026-08-20",
        startTime: "12:00",
        endTime: "13:00",
        reason: "Almoço da equipe",
        recurrence: { frequency: "daily", until: "2026-08-22" },
      }),
    );
    expect(await screen.findByText("Bloqueio criado")).toBeInTheDocument();
  });

  it("staff visualiza mas não recebe controles de mutação", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith(`/rooms/${roomId}`)) return Promise.resolve(jsonResponse(200, room));
        if (input.endsWith("/me"))
          return Promise.resolve(jsonResponse(200, { ...session, role: "staff" }));
        if (input.includes("/room-blocks?"))
          return Promise.resolve(
            jsonResponse(200, { timezone: "America/Sao_Paulo", items: [block] }),
          );
        throw new Error(`fetch não mockado: ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Manutenção do projetor");

    expect(screen.queryByRole("button", { name: "Criar bloqueio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover série" })).not.toBeInTheDocument();
  });
});
