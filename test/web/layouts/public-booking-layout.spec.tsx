import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider, useOutletContext } from "react-router-dom";
import { PublicBookingLayout, type PublicBookingContext } from "@web/layouts/public-booking-layout";

function StepPlaceholder() {
  const { companySlug } = useOutletContext<PublicBookingContext>();
  return <p>slug={companySlug}</p>;
}

describe("PublicBookingLayout", () => {
  it("resolve :companySlug da URL e repassa via outlet context", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/:companySlug/agendar",
          element: <PublicBookingLayout />,
          children: [{ index: true, element: <StepPlaceholder /> }],
        },
      ],
      { initialEntries: ["/hotel-central/agendar"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByText("slug=hotel-central")).toBeInTheDocument();
  });
});
