import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { CancellationPage } from "@web/features/public-cancellation/cancellation-page";

const validToken = `booking.${"a".repeat(64)}.${"b".repeat(64)}`;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage(initialPath: string) {
  const router = createMemoryRouter(
    [{ path: "/cancelar-reserva", element: <CancellationPage /> }],
    { initialEntries: [initialPath] },
  );

  return { router, ...render(<RouterProvider router={router} />) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CancellationPage", () => {
  it("lê o token somente do fragmento, o remove da URL e exige confirmação explícita", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);

    const { router } = renderPage(
      `/cancelar-reserva?origem=email&token=query-token#token=${encodeURIComponent(validToken)}`,
    );

    expect(screen.getByRole("heading", { name: "Cancelar esta reserva?" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(router.state.location.hash).toBe("");
      expect(router.state.location.search).toBe("?origem=email");
    });

    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    expect(await screen.findByRole("heading", { name: "Reserva cancelada" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/public/bookings/cancel",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ token: validToken }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain(validToken);
  });

  it("recusa token ausente, curto ou fornecido apenas na query sem chamar a API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { router } = renderPage("/cancelar-reserva?token=nao-e-aceito#token=curto");

    expect(
      screen.getByRole("heading", { name: "Link de cancelamento inválido" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Nenhuma alteração");
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(router.state.location.search).toBe("");
      expect(router.state.location.hash).toBe("");
    });
  });

  it("mostra que o link expirou quando a API responde 410", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(410, {
          code: "CANCELLATION_LINK_EXPIRED",
          message: "Link expirado.",
        }),
      ),
    );

    renderPage(`/cancelar-reserva#token=${validToken}`);
    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    expect(
      await screen.findByRole("heading", { name: "Link de cancelamento expirado" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Nenhuma alteração foi feita");
    expect(screen.queryByText("Reserva cancelada")).not.toBeInTheDocument();
  });

  it("trata como inválido um token rejeitado pelo backend", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          code: "INVALID_CANCELLATION_TOKEN",
          message: "Token inválido.",
        }),
      ),
    );

    renderPage(`/cancelar-reserva#token=${validToken}`);
    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    expect(
      await screen.findByRole("heading", { name: "Link de cancelamento inválido" }),
    ).toBeInTheDocument();
  });

  it("informa falha transitória e permite tentar novamente sem pedir outro token", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse(200, { status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);

    renderPage(`/cancelar-reserva#token=${validToken}`);
    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    expect(
      await screen.findByRole("heading", { name: "Não foi possível cancelar agora" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("A reserva não foi alterada");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("heading", { name: "Reserva cancelada" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
