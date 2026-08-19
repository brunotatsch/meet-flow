import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InvitationAcceptPage } from "@web/features/admin-team/invitation-accept-page";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@web/lib/auth-client", () => ({ useSession: useSessionMock }));

const invitation = {
  id: "invite-1",
  email: "pessoa@example.com",
  role: "staff",
  status: "pending",
  expiresAt: "2030-01-03T00:00:00.000Z",
  organizationName: "Hotel Convite",
  actionable: true,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/convite/invite-1"]}>
      <Routes>
        <Route path="/admin/convite/:invitationId" element={<InvitationAcceptPage />} />
        <Route path="/admin" element={<p>Painel aceito</p>} />
        <Route path="/admin/login" element={<p>Tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionMock.mockReset();
});

describe("InvitationAcceptPage", () => {
  it("mostra mensagem específica para convite expirado", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse(200, { ...invitation, status: "expired", actionable: false })),
      ),
    );

    renderPage();
    expect(await screen.findByText(/Este convite expirou/)).toBeInTheDocument();
  });

  it("destinatário sem conta cria acesso e aceita em uma chamada", async () => {
    const user = userEvent.setup();
    let registrationBody: unknown;
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (init?.method === "GET") return Promise.resolve(jsonResponse(200, invitation));
        if (input.endsWith("/register")) {
          registrationBody = JSON.parse(init?.body as string);
          return Promise.resolve(
            jsonResponse(201, {
              user: { id: "user-1", name: "Pessoa Nova", email: invitation.email },
              company: {
                id: "11111111-1111-4111-8111-111111111111",
                name: invitation.organizationName,
                slug: "hotel-convite",
                type: "hotel",
                timezone: "America/Sao_Paulo",
              },
              role: "staff",
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Entrar em Hotel Convite");
    await user.type(screen.getByLabelText("Seu nome"), "Pessoa Nova");
    await user.type(screen.getByLabelText("Crie uma senha"), "senha-muito-segura");
    await user.click(screen.getByRole("button", { name: "Criar conta e aceitar" }));

    expect(await screen.findByText("Painel aceito")).toBeInTheDocument();
    expect(registrationBody).toEqual({ name: "Pessoa Nova", password: "senha-muito-segura" });
  });

  it("conta autenticada aceita sem formulário de cadastro", async () => {
    const user = userEvent.setup();
    let accepted = false;
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (init?.method === "GET") return Promise.resolve(jsonResponse(200, invitation));
        if (input.endsWith("/accept")) {
          accepted = true;
          return Promise.resolve(jsonResponse(200, { success: true }));
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Aceitar convite" }));

    expect(await screen.findByText("Painel aceito")).toBeInTheDocument();
    expect(accepted).toBe(true);
  });
});
