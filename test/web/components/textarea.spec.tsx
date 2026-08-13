import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Textarea } from "@web/components/textarea";

describe("Textarea", () => {
  it("aceita digitação em múltiplas linhas", async () => {
    render(<Textarea aria-label="Descrição" />);

    const textarea = screen.getByLabelText("Descrição");
    await userEvent.type(textarea, "Linha 1{enter}Linha 2");

    expect(textarea).toHaveValue("Linha 1\nLinha 2");
  });

  it("marca aria-invalid quando invalid está ativo", () => {
    render(<Textarea invalid aria-label="Campo com erro" />);

    expect(screen.getByLabelText("Campo com erro")).toHaveAttribute("aria-invalid", "true");
  });
});
