import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "@web/components/skeleton";

describe("Skeleton", () => {
  it("expõe role=status para leitores de tela", () => {
    render(<Skeleton className="h-4 w-32" />);

    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
  });
});
