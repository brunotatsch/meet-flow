import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@web/components/badge";

describe("Badge", () => {
  it("renderiza o texto e aplica a classe do variant", () => {
    render(<Badge variant="destructive">Cancelada</Badge>);

    expect(screen.getByText("Cancelada")).toHaveClass("bg-destructive");
  });
});
