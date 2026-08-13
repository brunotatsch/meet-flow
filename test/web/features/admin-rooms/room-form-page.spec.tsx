import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { RoomFormPage } from "@web/features/admin-rooms/room-form-page";

const existingRoom = {
  id: "22222222-2222-4222-8222-222222222222",
  companyId: "11111111-1111-4111-8111-111111111111",
  name: "Sala Atlântico",
  description: "Vista para o mar",
  capacity: 10,
  hourlyRateInCents: 12_050,
  amenities: ["projetor", "wifi"],
  photoUrl: null,
  isActive: true,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderCreatePage() {
  return render(
    <MemoryRouter initialEntries={["/admin/rooms/new"]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/rooms/new" element={<RoomFormPage />} />
          <Route path="/admin" element={<p>Lista de salas</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function renderEditPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/rooms/${existingRoom.id}/edit`]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/rooms/:id/edit" element={<RoomFormPage />} />
          <Route path="/admin" element={<p>Lista de salas</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoomFormPage - criação", () => {
  it("cria a sala com o valor em reais convertido para centavos, sem erro de ponto flutuante", async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/rooms") && init?.method === "POST") {
          postedBody = JSON.parse(init.body as string);
          return Promise.resolve(jsonResponse(201, { ...existingRoom, ...(postedBody as object) }));
        }
        throw new Error(`fetch não mockado para ${input} ${init?.method}`);
      }),
    );

    renderCreatePage();

    await user.type(screen.getByLabelText("Nome"), "Sala Pacífico");
    await user.clear(screen.getByLabelText("Capacidade"));
    await user.type(screen.getByLabelText("Capacidade"), "8");
    await user.clear(screen.getByLabelText("Valor por hora (R$)"));
    await user.type(screen.getByLabelText("Valor por hora (R$)"), "19.99");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await screen.findByText("Lista de salas");
    expect(postedBody).toMatchObject({
      name: "Sala Pacífico",
      capacity: 8,
      hourlyRateInCents: 1_999,
    });
  });

  it("no 409 de nome duplicado, mostra o erro no campo nome", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith("/rooms") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse(409, {
              code: "DUPLICATE_ROOM_NAME",
              message: 'Já existe uma sala chamada "Sala Atlântico".',
            }),
          );
        }
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderCreatePage();

    await user.type(screen.getByLabelText("Nome"), "Sala Atlântico");
    await user.type(screen.getByLabelText("Capacidade"), "8");
    await user.type(screen.getByLabelText("Valor por hora (R$)"), "100");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const nameError = await screen.findByText('Já existe uma sala chamada "Sala Atlântico".');
    expect(nameError).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true");
    // Não navegou: o formulário continua na tela para corrigir.
    expect(screen.queryByText("Lista de salas")).not.toBeInTheDocument();
  });
});

describe("RoomFormPage - edição", () => {
  it("pré-preenche o formulário com os dados da sala existente, incluindo o valor em reais", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith(`/rooms/${existingRoom.id}`)) return Promise.resolve(jsonResponse(200, existingRoom));
        throw new Error(`fetch não mockado para ${input}`);
      }),
    );

    renderEditPage();

    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Sala Atlântico"));
    expect(screen.getByLabelText("Capacidade")).toHaveValue(10);
    expect(screen.getByLabelText("Valor por hora (R$)")).toHaveValue(120.5);
    expect(screen.getByLabelText("Comodidades")).toHaveValue("projetor, wifi");
  });
});
