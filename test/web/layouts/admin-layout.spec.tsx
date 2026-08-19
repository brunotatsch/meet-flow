import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AdminLayout } from "@web/layouts/admin-layout";

const { useSessionMock, signOutMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@web/lib/auth-client", () => ({
  useSession: useSessionMock,
  signOut: signOutMock,
}));

const appSession = {
  user: { id: "u1", name: "Owner", email: "owner@example.com" },
  company: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Hotel",
    slug: "hotel",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  },
  role: "owner",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(appSession), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderAdminRoute() {
  const router = createMemoryRouter(
    [
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <p>Painel</p> },
          { path: "agenda", element: <p>Tela de agenda</p> },
          { path: "billing", element: <p>Tela de planos</p> },
          { path: "equipe", element: <p>Tela de equipe</p> },
        ],
      },
      { path: "/admin/login", element: <p>Tela de login</p> },
    ],
    { initialEntries: ["/admin"] },
  );

  return render(<RouterProvider router={router} />);
}

describe("AdminLayout", () => {
  it("mostra a tela de carregamento enquanto a sessão está pendente", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true });

    renderAdminRoute();

    expect(screen.getByText("Verificando sessão...")).toBeInTheDocument();
  });

  it("redireciona para /admin/login sem sessão", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });

    renderAdminRoute();

    expect(screen.getByText("Tela de login")).toBeInTheDocument();
    expect(screen.queryByText("Painel")).not.toBeInTheDocument();
  });

  it("renderiza o outlet quando há sessão", () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1" }, session: { id: "s1" } },
      isPending: false,
    });

    renderAdminRoute();

    expect(screen.getByText("Painel")).toBeInTheDocument();
  });

  it("navega entre Salas e Agenda pela navegação persistente", async () => {
    const user = userEvent.setup();
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1" }, session: { id: "s1" } },
      isPending: false,
    });

    renderAdminRoute();
    await user.click(screen.getByRole("link", { name: "Agenda" }));

    expect(await screen.findByText("Tela de agenda")).toBeInTheDocument();
  });

  it("abre a gestão do plano pela navegação persistente", async () => {
    const user = userEvent.setup();
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1" }, session: { id: "s1" } },
      isPending: false,
    });

    renderAdminRoute();
    await user.click(await screen.findByRole("link", { name: "Plano" }));

    expect(await screen.findByText("Tela de planos")).toBeInTheDocument();
  });

  it("esconde Equipe e Plano de staff usando a matriz compartilhada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...appSession, role: "staff" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1" }, session: { id: "s1" } },
      isPending: false,
    });

    renderAdminRoute();
    expect(await screen.findByText("Painel")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Equipe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Plano" })).not.toBeInTheDocument();
  });

  it('"Sair" encerra a sessão e volta para o login', async () => {
    const user = userEvent.setup();
    signOutMock.mockResolvedValue(undefined);
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1" }, session: { id: "s1" } },
      isPending: false,
    });

    renderAdminRoute();
    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(signOutMock).toHaveBeenCalled();
    expect(await screen.findByText("Tela de login")).toBeInTheDocument();
  });
});
