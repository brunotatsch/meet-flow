import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AdminLoginPage } from "@web/routes/admin-login-page";

const { signInEmailMock } = vi.hoisted(() => ({ signInEmailMock: vi.fn() }));

vi.mock("@web/lib/auth-client", () => ({
  signIn: { email: signInEmailMock },
}));

function renderPage(initialEntries: (string | { pathname: string; state?: unknown })[] = ["/admin/login"]) {
  const router = createMemoryRouter(
    [
      { path: "/admin/login", element: <AdminLoginPage /> },
      { path: "/admin", element: <p>Painel</p> },
      { path: "/admin/rooms/:id/edit", element: <p>Editar sala</p> },
    ],
    { initialEntries },
  );

  return render(<RouterProvider router={router} />);
}

describe("AdminLoginPage", () => {
  it("com credenciais válidas, entra e vai para /admin", async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({ error: null });

    renderPage();

    await user.type(screen.getByLabelText("E-mail"), "bruno@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-muito-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(signInEmailMock).toHaveBeenCalledWith({
      email: "bruno@exemplo.com",
      password: "senha-muito-segura",
    });
    await screen.findByText("Painel");
  });

  it("com credencial inválida, mostra mensagem de erro e não navega", async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({ error: { message: "Invalid credentials" } });

    renderPage();

    await user.type(screen.getByLabelText("E-mail"), "bruno@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("E-mail ou senha incorretos.")).toBeInTheDocument();
    expect(screen.queryByText("Painel")).not.toBeInTheDocument();
  });

  it("depois do login, volta para a rota de onde o guard de sessão redirecionou", async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({ error: null });

    renderPage([
      { pathname: "/admin/login", state: { from: { pathname: "/admin/rooms/42/edit" } } },
    ]);

    await user.type(screen.getByLabelText("E-mail"), "bruno@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-muito-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await screen.findByText("Editar sala");
  });
});
