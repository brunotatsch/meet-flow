import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingPage } from "@web/features/admin-billing/billing-page";

const { redirectToExternalUrlMock } = vi.hoisted(() => ({
  redirectToExternalUrlMock: vi.fn(),
}));

vi.mock("@web/lib/external-navigation", () => ({
  redirectToExternalUrl: redirectToExternalUrlMock,
}));

const plans = [
  {
    key: "free",
    name: "Gratuito",
    version: 1,
    limits: { rooms: 2, users: 2, bookings: 50 },
  },
  {
    key: "starter",
    name: "Starter",
    version: 1,
    limits: { rooms: 10, users: 5, bookings: 500 },
  },
  {
    key: "pro",
    name: "Pro",
    version: 1,
    limits: { rooms: 50, users: 25, bookings: 5_000 },
  },
] as const;

const freeBilling = {
  subscription: {
    status: "canceled",
    planKey: "free",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  },
  plan: plans[0],
  usage: { rooms: 1, users: 2, bookings: 12 },
  accessMode: "read_write",
  plans,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  redirectToExternalUrlMock.mockReset();
});

describe("BillingPage", () => {
  it("mostra o plano gratuito, uso atual e limites explícitos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, freeBilling)));

    render(<BillingPage />);

    expect(await screen.findByRole("heading", { name: "Plano e cobrança" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Gratuito" })).toHaveLength(2);
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.getByText("12 de 50")).toBeInTheDocument();
    expect(screen.getByText("Limite atingido")).toBeInTheDocument();
  });

  it("cria Checkout com o planKey escolhido e navega para a URL externa", async () => {
    const user = userEvent.setup();
    let checkoutBody: unknown;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/billing") && init?.method === "GET") {
          return Promise.resolve(jsonResponse(200, freeBilling));
        }
        if (input.endsWith("/billing/checkout") && init?.method === "POST") {
          checkoutBody = JSON.parse(init.body as string);
          return Promise.resolve(
            jsonResponse(201, {
              url: "https://checkout.stripe.test/session",
              sessionId: "cs_test_123",
              expiresAt: "2030-01-01T00:31:00.000Z",
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input} ${init?.method}`);
      }),
    );

    render(<BillingPage />);
    await user.click(await screen.findByRole("button", { name: "Escolher Starter" }));

    await waitFor(() =>
      expect(redirectToExternalUrlMock).toHaveBeenCalledWith(
        "https://checkout.stripe.test/session",
      ),
    );
    expect(checkoutBody).toEqual({ planKey: "starter" });
  });

  it("abre o Customer Portal para uma assinatura paga", async () => {
    const user = userEvent.setup();
    const activeBilling = {
      ...freeBilling,
      subscription: {
        status: "active",
        planKey: "starter",
        currentPeriodEnd: "2030-02-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      plan: plans[1],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/billing") && init?.method === "GET") {
          return Promise.resolve(jsonResponse(200, activeBilling));
        }
        if (input.endsWith("/billing/portal") && init?.method === "POST") {
          return Promise.resolve(jsonResponse(201, { url: "https://billing.stripe.test/portal" }));
        }
        throw new Error(`fetch não mockado para ${input} ${init?.method}`);
      }),
    );

    render(<BillingPage />);
    await user.click(await screen.findByRole("button", { name: "Gerenciar cobrança" }));

    await waitFor(() =>
      expect(redirectToExternalUrlMock).toHaveBeenCalledWith("https://billing.stripe.test/portal"),
    );
  });

  it("explica o modo somente leitura e mantém o acesso ao portal", async () => {
    const pastDueBilling = {
      ...freeBilling,
      subscription: {
        status: "past_due",
        planKey: "starter",
        currentPeriodEnd: "2030-02-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      plan: plans[1],
      accessMode: "read_only",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, pastDueBilling)));

    render(<BillingPage />);

    expect(await screen.findByText("Conta em modo somente leitura")).toBeInTheDocument();
    expect(screen.getByText("Pagamento em atraso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerenciar cobrança" })).toBeEnabled();
  });

  it("mostra cancelamento agendado sem tratar a assinatura como encerrada", async () => {
    const cancelingBilling = {
      ...freeBilling,
      subscription: {
        status: "active",
        planKey: "starter",
        currentPeriodEnd: "2030-02-01T00:00:00.000Z",
        cancelAtPeriodEnd: true,
      },
      plan: plans[1],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, cancelingBilling)));

    render(<BillingPage />);

    expect(await screen.findByText(/O cancelamento está agendado/)).toHaveTextContent(
      "1 de fevereiro de 2030",
    );
    expect(screen.getByText("Ativa")).toBeInTheDocument();
  });

  it("permite tentar novamente quando o resumo falha", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(500, { code: "INTERNAL_ERROR", message: "Falha temporária." }),
      )
      .mockResolvedValueOnce(jsonResponse(200, freeBilling));
    vi.stubGlobal("fetch", fetchMock);

    render(<BillingPage />);

    expect(
      await screen.findByText("Não foi possível carregar os dados de cobrança."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findAllByRole("heading", { name: "Gratuito" })).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
