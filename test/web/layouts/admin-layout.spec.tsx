import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

function renderAdminRoute() {
  const router = createMemoryRouter(
    [
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <p>Painel</p> },
          { path: "agenda", element: <p>Tela de agenda</p> },
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
