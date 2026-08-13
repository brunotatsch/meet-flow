import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { RoomSchedulePage } from "@web/features/admin-rooms/room-schedule-page";

const room = {
  id: "22222222-2222-4222-8222-222222222222",
  companyId: "11111111-1111-4111-8111-111111111111",
  name: "Sala Atlântico",
  description: null,
  capacity: 10,
  hourlyRateInCents: 12_000,
  amenities: [],
  photoUrl: null,
  isActive: true,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

const mondaySchedule = {
  id: "44444444-4444-4444-8444-444444444444",
  roomId: room.id,
  weekday: 1,
  opensAt: "09:00:00",
  closesAt: "18:00:00",
  slotMinutes: 60,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/rooms/${room.id}/schedule`]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/rooms/:id/schedule" element={<RoomSchedulePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoomSchedulePage", () => {
  it("carrega a agenda existente com o dia aberto marcado e os fechados desmarcados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith(`/rooms/${room.id}`)) return Promise.resolve(jsonResponse(200, room));
        if (input.endsWith(`/rooms/${room.id}/schedules`))
          return Promise.resolve(jsonResponse(200, [mondaySchedule]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();

    await screen.findByText("Agenda de Sala Atlântico");

    const mondayCheckbox = screen.getByRole("checkbox", { name: "Segunda-feira" });
    const tuesdayCheckbox = screen.getByRole("checkbox", { name: "Terça-feira" });

    expect(mondayCheckbox).toBeChecked();
    expect(tuesdayCheckbox).not.toBeChecked();
    expect(screen.getByLabelText("Abre")).toHaveValue("09:00");
  });

  it("salva a agenda com segundos anexados e só os dias marcados", async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith(`/rooms/${room.id}/schedules`) && init?.method === "PUT") {
          putBody = JSON.parse(init.body as string);
          return Promise.resolve(jsonResponse(200, []));
        }
        if (input.endsWith(`/rooms/${room.id}/schedules`))
          return Promise.resolve(jsonResponse(200, [mondaySchedule]));
        if (input.endsWith(`/rooms/${room.id}`)) return Promise.resolve(jsonResponse(200, room));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Agenda de Sala Atlântico");

    await user.click(screen.getByRole("button", { name: "Salvar agenda" }));

    await waitFor(() =>
      expect(putBody).toEqual([{ weekday: 1, opensAt: "09:00:00", closesAt: "18:00:00", slotMinutes: 60 }]),
    );
    expect(await screen.findByText("Agenda salva")).toBeInTheDocument();
  });

  it('"Replicar para todos os dias" copia horário e duração para a semana inteira', async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith(`/rooms/${room.id}`)) return Promise.resolve(jsonResponse(200, room));
        if (input.endsWith(`/rooms/${room.id}/schedules`))
          return Promise.resolve(jsonResponse(200, [mondaySchedule]));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderPage();
    await screen.findByText("Agenda de Sala Atlântico");

    const mondayRow = screen.getByText("Segunda-feira").closest(".rounded-lg") as HTMLElement;
    await user.click(within(mondayRow).getByRole("button", { name: /Replicar/ }));

    for (const day of ["Domingo", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]) {
      expect(screen.getByRole("checkbox", { name: day })).toBeChecked();
    }
  });
});
