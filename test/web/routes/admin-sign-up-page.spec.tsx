import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AdminSignUpPage } from "@web/routes/admin-sign-up-page";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: "/admin/sign-up", element: <AdminSignUpPage /> },
      { path: "/admin", element: <p>Painel</p> },
    ],
    { initialEntries: ["/admin/sign-up"] },
  );

  return render(<RouterProvider router={router} />);
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Seu nome"), "Bruno Tatsch");
  await user.type(screen.getByLabelText("E-mail"), "bruno@exemplo.com");
  await user.type(screen.getByLabelText("Senha"), "senha-muito-segura");
  await user.type(screen.getByLabelText("Nome da empresa"), "Hotel Central");
  await user.type(screen.getByLabelText("Endereço público"), "hotel-central");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminSignUpPage", () => {
  it("cria a conta e a empresa, depois vai para /admin", async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/sign-up")) {
          postedBody = JSON.parse(init!.body as string);
          return Promise.resolve(
            jsonResponse(201, {
              user: { id: "user-1", name: "Bruno Tatsch", email: "bruno@exemplo.com" },
              company: {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Hotel Central",
                slug: "hotel-central",
                type: "hotel",
                timezone: "America/Sao_Paulo",
              },
              role: "owner",
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await screen.findByText("Painel");
    expect(postedBody).toMatchObject({
      user: { name: "Bruno Tatsch", email: "bruno@exemplo.com" },
      company: { name: "Hotel Central", slug: "hotel-central", type: "hotel" },
    });
  });

  it("no 409 de slug já usado, mostra o erro no campo de endereço público", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/sign-up")) {
          return Promise.resolve(
            jsonResponse(409, {
              code: "SLUG_ALREADY_TAKEN",
              message: "Este slug já está em uso por outra empresa.",
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Este slug já está em uso por outra empresa.")).toBeInTheDocument();
    expect(screen.queryByText("Painel")).not.toBeInTheDocument();
  });

  it("valida o formato do slug no cliente antes de chamar a API", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await user.type(screen.getByLabelText("Seu nome"), "Bruno Tatsch");
    await user.type(screen.getByLabelText("E-mail"), "bruno@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-muito-segura");
    await user.type(screen.getByLabelText("Nome da empresa"), "Hotel Central");
    await user.type(screen.getByLabelText("Endereço público"), "hotel central");

    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Endereço público")).toHaveAttribute("aria-invalid", "true");
  });
});
