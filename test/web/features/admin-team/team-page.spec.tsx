import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { TeamPage } from "@web/features/admin-team/team-page";

const baseSession = {
  user: { id: "owner-1", name: "Olivia Owner", email: "owner@example.com" },
  company: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Hotel Equipe",
    slug: "hotel-equipe",
    type: "hotel",
    timezone: "America/Sao_Paulo",
  },
  role: "owner",
};

const overview = {
  members: [
    {
      id: "member-owner",
      userId: "owner-1",
      name: "Olivia Owner",
      email: "owner@example.com",
      role: "owner",
      createdAt: "2030-01-01T00:00:00.000Z",
    },
    {
      id: "member-staff",
      userId: "staff-1",
      name: "Silvia Staff",
      email: "staff@example.com",
      role: "staff",
      createdAt: "2030-01-02T00:00:00.000Z",
    },
  ],
  invitations: [],
};

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
        <TeamPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("TeamPage", () => {
  it("owner lista membros, altera papéis e vê remoção", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, baseSession));
        if (input.endsWith("/team")) return Promise.resolve(jsonResponse(200, overview));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    expect(await screen.findByText("Silvia Staff")).toBeInTheDocument();
    expect(screen.getByLabelText("Papel de Silvia Staff")).toHaveValue("staff");
    expect(screen.getByRole("button", { name: "Remover Silvia Staff" })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Papel")).getByRole("option", { name: "Owner" }),
    ).toBeInTheDocument();
  });

  it("manager pode convidar, mas não vê alteração nem remoção", async () => {
    const managerSession = {
      ...baseSession,
      user: { id: "manager-1", name: "Marina Manager", email: "manager@example.com" },
      role: "manager",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, managerSession));
        if (input.endsWith("/team")) return Promise.resolve(jsonResponse(200, overview));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Silvia Staff");

    expect(screen.queryByLabelText("Papel de Silvia Staff")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover Silvia Staff" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convidar" })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Papel")).queryByRole("option", { name: "Owner" }),
    ).not.toBeInTheDocument();
  });

  it("cria convite e apresenta aviso/link enquanto o outbox não está conectado", async () => {
    const user = userEvent.setup();
    let posted: unknown;
    let teamCalls = 0;
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/me")) return Promise.resolve(jsonResponse(200, baseSession));
        if (input.endsWith("/team") && init?.method === "GET") {
          teamCalls += 1;
          return Promise.resolve(jsonResponse(200, overview));
        }
        if (input.endsWith("/team/invitations") && init?.method === "POST") {
          posted = JSON.parse(init.body as string);
          return Promise.resolve(
            jsonResponse(201, {
              invitation: {
                id: "invite-1",
                email: "novo@example.com",
                role: "staff",
                status: "pending",
                expiresAt: "2030-01-03T00:00:00.000Z",
                createdAt: "2030-01-01T00:00:00.000Z",
                acceptUrl: "https://example.com/admin/convite/invite-1",
              },
              delivery: {
                status: "queued",
                message: "Convite enfileirado. Copie o link de aceite.",
              },
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input} ${init?.method}`);
      }),
    );

    renderPage();
    await screen.findByText("Silvia Staff");
    await user.type(screen.getByLabelText("E-mail"), "novo@example.com");
    await user.click(screen.getByRole("button", { name: "Convidar" }));

    expect(
      await screen.findByText("Convite enfileirado. Copie o link de aceite."),
    ).toBeInTheDocument();
    expect(posted).toEqual({ email: "novo@example.com", role: "staff" });
    await waitFor(() => expect(teamCalls).toBeGreaterThan(1));
  });
});
