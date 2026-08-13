import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "@web/components/toast";

function TriggerToast() {
  const { toast } = useToast();

  return (
    <button
      type="button"
      onClick={() => toast({ title: "Reserva criada", description: "Sala Atlântico às 09:00", variant: "success" })}
    >
      Disparar
    </button>
  );
}

describe("ToastProvider / useToast", () => {
  it("mostra o toast disparado e permite fechá-lo", async () => {
    render(
      <ToastProvider>
        <TriggerToast />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Disparar" }));

    expect(screen.getByText("Reserva criada")).toBeInTheDocument();
    expect(screen.getByText("Sala Atlântico às 09:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Fechar notificação" }));

    expect(screen.queryByText("Reserva criada")).not.toBeInTheDocument();
  });

  it("lança um erro claro quando usado fora do provider", () => {
    function Broken() {
      useToast();
      return null;
    }

    expect(() => render(<Broken />)).toThrow(/useToast precisa estar dentro/);
  });
});
