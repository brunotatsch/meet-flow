import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { RoomListPage } from "@web/features/admin-rooms/room-list-page";

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

const activeRoom = {
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

const inactiveRoom = {
  ...activeRoom,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Sala Pacífico",
  isActive: false,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <RoomListPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoomListPage", () => {
  it("lista as salas, mostra o indicador de status e o link público", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [activeRoom, inactiveRoom]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    await screen.findByText("Sala Atlântico");
    expect(screen.getByText("Sala Pacífico")).toBeInTheDocument();
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByText("Inativa")).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/hotel-central/agendar`)).toBeInTheDocument();
  });

  it("filtra a lista pelo texto buscado", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [activeRoom, inactiveRoom]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Sala Atlântico");

    await user.type(screen.getByLabelText("Buscar sala por nome"), "Pacífico");

    expect(screen.queryByText("Sala Atlântico")).not.toBeInTheDocument();
    expect(screen.getByText("Sala Pacífico")).toBeInTheDocument();
  });

  it("mostra o estado vazio com chamada para ação quando não há salas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, []));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    await screen.findByText("Você ainda não cadastrou nenhuma sala.");
    expect(screen.getByRole("link", { name: "Criar a primeira sala" })).toBeInTheDocument();
  });

  it("desativa uma sala após confirmação no diálogo, com toast de sucesso", async () => {
    const user = userEvent.setup();
    const patchCalls: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith(`/rooms/${activeRoom.id}`) && init?.method === "PATCH") {
          patchCalls.push(JSON.parse(init.body as string));
          return Promise.resolve(jsonResponse(200, { ...activeRoom, isActive: false }));
        }
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [activeRoom]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Sala Atlântico");

    await user.click(screen.getByRole("button", { name: "Desativar" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("não são canceladas");

    await user.click(within(dialog).getByRole("button", { name: "Desativar" }));

    await waitFor(() => expect(patchCalls).toEqual([{ isActive: false }]));
    expect(await screen.findByText("Sala desativada")).toBeInTheDocument();
  });

  it("mostra erro e permite tentar de novo quando a lista falha ao carregar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, session));
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(500, { code: "INTERNAL_ERROR", message: "Erro interno." }));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    expect(
      await screen.findByText("Não foi possível carregar as salas. Recarregue a página para tentar de novo."),
    ).toBeInTheDocument();
  });
});
