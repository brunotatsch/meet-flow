import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@web/components/button";

describe("Button", () => {
  it("renderiza o texto e responde a clique", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Confirmar</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fica desabilitado e não dispara clique", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Indisponível
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Indisponível" });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("com asChild, repassa as classes para o filho em vez de renderizar um <button>", () => {
    render(
      <Button asChild>
        <a href="/destino">Ir</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Ir" });
    expect(link).toHaveAttribute("href", "/destino");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
