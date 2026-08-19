import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { CheckoutCancelPage } from "@web/features/booking-flow/routes/checkout-cancel-page";
import { CheckoutSuccessPage } from "@web/features/booking-flow/routes/checkout-success-page";
import { CHECKOUT_STATUS_POLL_INTERVAL_MS } from "@web/features/booking-flow/use-checkout-status";
import { PublicBookingLayout } from "@web/layouts/public-booking-layout";

const booking = {
  id: "22222222-2222-4222-8222-222222222222",
  roomId: "11111111-1111-4111-8111-111111111111",
  startsAt: "2030-06-04T09:00:00-03:00",
  endsAt: "2030-06-04T10:00:00-03:00",
  status: "confirmed",
  totalInCents: 12_000,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function checkoutStatus(state: "processing" | "confirmed" | "expired" | "payment_failed") {
  return {
    state,
    booking,
    timeZone: "America/Sao_Paulo",
  };
}

function renderReturnPage(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/:companySlug/agendar",
        element: <PublicBookingLayout />,
        children: [
          { index: true, element: <p>Wizard</p> },
          { path: "sucesso", element: <CheckoutSuccessPage /> },
          { path: "cancelado", element: <CheckoutCancelPage /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );

  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CheckoutSuccessPage", () => {
  it("confirma uma reserva gratuita sem afirmar que houve pagamento", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderReturnPage(`/hotel-central/agendar/sucesso?booking_id=${booking.id}&free=1`);

    expect(screen.getByRole("heading", { name: "Reserva confirmada" })).toBeInTheDocument();
    expect(
      screen.getByText("Esta reserva não exige pagamento. Guarde o código abaixo."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Total pago")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("não consulta a API quando o session_id está ausente", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderReturnPage("/hotel-central/agendar/sucesso");

    expect(
      screen.getByRole("heading", { name: "Não foi possível localizar o pagamento" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta pelo session id e mostra a reserva somente quando o backend confirma", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, checkoutStatus("confirmed")));
    vi.stubGlobal("fetch", fetchMock);

    renderReturnPage("/hotel-central/agendar/sucesso?session_id=cs_test_123");

    expect(await screen.findByRole("heading", { name: "Reserva confirmada" })).toBeInTheDocument();
    expect(screen.getByText(booking.id)).toBeInTheDocument();
    expect(screen.getByText("Total pago")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/public/hotel-central/checkout-sessions/cs_test_123",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("faz polling automático enquanto o webhook ainda está sendo processado", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, checkoutStatus("processing")))
      .mockResolvedValueOnce(jsonResponse(200, checkoutStatus("confirmed")));
    vi.stubGlobal("fetch", fetchMock);

    renderReturnPage("/hotel-central/agendar/sucesso?session_id=cs_test_poll");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { name: "Pagamento em processamento" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECKOUT_STATUS_POLL_INTERVAL_MS);
    });

    expect(screen.getByRole("heading", { name: "Reserva confirmada" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["expired", "A reserva temporária expirou"],
    ["payment_failed", "Pagamento não confirmado"],
  ] as const)("mostra o estado terminal %s sem afirmar sucesso", async (state, title) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, checkoutStatus(state))));

    renderReturnPage(`/hotel-central/agendar/sucesso?session_id=cs_test_${state}`);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reserva confirmada" })).not.toBeInTheDocument();
  });

  it("permite tentar novamente depois de um erro de rede", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse(200, checkoutStatus("confirmed")));
    vi.stubGlobal("fetch", fetchMock);

    renderReturnPage("/hotel-central/agendar/sucesso?session_id=cs_test_retry");

    await screen.findByRole("heading", { name: "Não conseguimos confirmar agora" });
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("heading", { name: "Reserva confirmada" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("CheckoutCancelPage", () => {
  it("explica a expiração do hold e permite reiniciar o agendamento", () => {
    const expiresAt = encodeURIComponent("2030-06-04T12:15:00.000Z");

    renderReturnPage(`/hotel-central/agendar/cancelado?expires_at=${expiresAt}`);

    expect(screen.getByRole("heading", { name: "Pagamento cancelado" })).toBeInTheDocument();
    expect(screen.getByText(/permanece reservado temporariamente até/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escolher outro horário" })).toHaveAttribute(
      "href",
      "/hotel-central/agendar",
    );
  });
});
