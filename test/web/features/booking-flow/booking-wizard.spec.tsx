import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { BookingWizard } from "@web/features/booking-flow/booking-wizard";
import { PublicBookingLayout } from "@web/layouts/public-booking-layout";

const room = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sala Atlântico",
  description: "Vista para o mar",
  capacity: 10,
  hourlyRateInCents: 12_000,
  amenities: ["projetor"],
  photoUrl: null,
};

function availabilityFixture() {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const iso = day.toISOString().slice(0, 10);

  return {
    roomId: room.id,
    date: iso,
    timezone: "America/Sao_Paulo",
    slots: [
      { startsAt: `${iso}T09:00:00-03:00`, endsAt: `${iso}T10:00:00-03:00`, available: true, priceInCents: 12_000 },
      { startsAt: `${iso}T10:00:00-03:00`, endsAt: `${iso}T11:00:00-03:00`, available: false, priceInCents: 12_000 },
      { startsAt: `${iso}T11:00:00-03:00`, endsAt: `${iso}T12:00:00-03:00`, available: true, priceInCents: 12_000 },
    ],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderWizard() {
  const router = createMemoryRouter(
    [
      {
        path: "/:companySlug/agendar",
        element: <PublicBookingLayout />,
        children: [{ index: true, element: <BookingWizard /> }],
      },
    ],
    { initialEntries: ["/hotel-central/agendar"] },
  );

  return render(<RouterProvider router={router} />);
}

async function advanceToReview(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "Escolha uma sala" });
  await user.click(await screen.findByRole("button", { name: "Selecionar" }));

  await screen.findByRole("heading", { name: "Data e horário" });
  await user.click(await screen.findByRole("button", { name: /09:00 às 10:00, disponível/ }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));

  await screen.findByRole("heading", { name: "Seus dados" });
  await user.type(screen.getByLabelText("Nome"), "Ana Prado");
  await user.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
  await user.click(screen.getByRole("button", { name: "Continuar" }));

  await screen.findByRole("heading", { name: "Revise e confirme" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BookingWizard", () => {
  it("completa o caminho feliz: sala -> horário -> dados -> revisão -> sucesso", async () => {
    const user = userEvent.setup();
    const availability = availabilityFixture();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.includes("/availability")) return Promise.resolve(jsonResponse(200, availability));
        if (input.endsWith("/bookings")) {
          return Promise.resolve(
            jsonResponse(201, {
              id: "22222222-2222-4222-8222-222222222222",
              companyId: "33333333-3333-4333-8333-333333333333",
              roomId: room.id,
              customerName: "Ana Prado",
              customerEmail: "ana@exemplo.com",
              customerPhone: null,
              startsAt: availability.slots[0]!.startsAt,
              endsAt: availability.slots[0]!.endsAt,
              status: "confirmed",
              totalInCents: 12_000,
              notes: null,
              createdAt: "2030-01-01T00:00:00.000Z",
              updatedAt: "2030-01-01T00:00:00.000Z",
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderWizard();
    await advanceToReview(user);

    expect(screen.getByText("Sala Atlântico")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    await screen.findByText("Reserva confirmada");
    expect(screen.getByText("22222222-2222-4222-8222-222222222222")).toBeInTheDocument();
  });

  it("no 409 ao confirmar, mostra mensagem clara e devolve ao passo de horário", async () => {
    const user = userEvent.setup();
    const availability = availabilityFixture();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.includes("/availability")) return Promise.resolve(jsonResponse(200, availability));
        if (input.endsWith("/bookings")) {
          return Promise.resolve(
            jsonResponse(409, {
              code: "BOOKING_CONFLICT",
              message: "O horário escolhido acabou de ser reservado para esta sala.",
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderWizard();
    await advanceToReview(user);

    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    await screen.findByRole("heading", { name: "Data e horário" });
    expect(
      screen.getByText("Este horário acabou de ser reservado. Escolha outro horário."),
    ).toBeInTheDocument();

    // O slot escolhido antes não continua marcado como selecionado.
    expect(screen.getByRole("button", { name: /09:00 às 10:00, disponível/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it('preserva o horário escolhido ao clicar "Voltar" a partir do passo de dados', async () => {
    const user = userEvent.setup();
    const availability = availabilityFixture();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.includes("/availability")) return Promise.resolve(jsonResponse(200, availability));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderWizard();
    await screen.findByRole("heading", { name: "Escolha uma sala" });
    await user.click(await screen.findByRole("button", { name: "Selecionar" }));

    await screen.findByRole("heading", { name: "Data e horário" });
    const nineToTen = await screen.findByRole("button", { name: /09:00 às 10:00, disponível/ });
    await user.click(nineToTen);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByRole("heading", { name: "Seus dados" });
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    await screen.findByRole("heading", { name: "Data e horário" });
    expect(await screen.findByRole("button", { name: /09:00 às 10:00, disponível/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });

  it("não deixa selecionar um slot ocupado", async () => {
    const user = userEvent.setup();
    const availability = availabilityFixture();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/rooms")) return Promise.resolve(jsonResponse(200, [room]));
        if (input.includes("/availability")) return Promise.resolve(jsonResponse(200, availability));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderWizard();
    await screen.findByRole("heading", { name: "Escolha uma sala" });
    await user.click(await screen.findByRole("button", { name: "Selecionar" }));
    await screen.findByRole("heading", { name: "Data e horário" });

    const occupied = await screen.findByRole("button", { name: /10:00 às 11:00, ocupado/ });
    expect(occupied).toBeDisabled();

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled());
  });
});
