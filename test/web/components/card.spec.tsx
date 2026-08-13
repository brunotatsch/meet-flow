import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/card";

describe("Card", () => {
  it("renderiza título, descrição e conteúdo", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Sala Atlântico</CardTitle>
          <CardDescription>10 pessoas</CardDescription>
        </CardHeader>
        <CardContent>R$ 120,00/hora</CardContent>
      </Card>,
    );

    expect(screen.getByText("Sala Atlântico")).toBeInTheDocument();
    expect(screen.getByText("10 pessoas")).toBeInTheDocument();
    expect(screen.getByText("R$ 120,00/hora")).toBeInTheDocument();
  });
});
