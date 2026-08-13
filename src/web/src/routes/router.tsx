import { createBrowserRouter } from "react-router-dom";
import { BookingWizard } from "@web/features/booking-flow/booking-wizard";
import { AdminLayout } from "@web/layouts/admin-layout";
import { PublicBookingLayout } from "@web/layouts/public-booking-layout";
import { AdminHomePage } from "./admin-home-page";
import { AdminLoginPage } from "./admin-login-page";
import { HomePage } from "./home-page";
import { NotFoundPage } from "./not-found-page";

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/admin/login", element: <AdminLoginPage /> },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [{ index: true, element: <AdminHomePage /> }],
  },
  {
    path: "/:companySlug/agendar",
    element: <PublicBookingLayout />,
    children: [{ index: true, element: <BookingWizard /> }],
  },
  { path: "*", element: <NotFoundPage /> },
]);
