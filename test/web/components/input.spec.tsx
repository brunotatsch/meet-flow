import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";

describe("Input", () => {
  it("aceita digitação e associa o Label pelo htmlFor/id", async () => {
    render(
      <>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" />
      </>,
    );

    const input = screen.getByLabelText("E-mail");
    await userEvent.type(input, "bruno@exemplo.com");

    expect(input).toHaveValue("bruno@exemplo.com");
  });

  it("marca aria-invalid quando invalid está ativo", () => {
    render(<Input invalid aria-label="Campo com erro" />);

    expect(screen.getByLabelText("Campo com erro")).toHaveAttribute("aria-invalid", "true");
  });
});
