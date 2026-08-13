import { createBrowserRouter } from "react-router-dom";
import { AgendaPage } from "@web/features/admin-agenda/agenda-page";
import { RoomFormPage } from "@web/features/admin-rooms/room-form-page";
import { RoomListPage } from "@web/features/admin-rooms/room-list-page";
import { RoomSchedulePage } from "@web/features/admin-rooms/room-schedule-page";
import { BookingWizard } from "@web/features/booking-flow/booking-wizard";
import { AdminLayout } from "@web/layouts/admin-layout";
import { PublicBookingLayout } from "@web/layouts/public-booking-layout";
import { AdminLoginPage } from "./admin-login-page";
import { AdminSignUpPage } from "./admin-sign-up-page";
import { HomePage } from "./home-page";
import { NotFoundPage } from "./not-found-page";

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/admin/login", element: <AdminLoginPage /> },
  { path: "/admin/sign-up", element: <AdminSignUpPage /> },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <RoomListPage /> },
      { path: "rooms/new", element: <RoomFormPage /> },
      { path: "rooms/:id/edit", element: <RoomFormPage /> },
      { path: "rooms/:id/schedule", element: <RoomSchedulePage /> },
      { path: "agenda", element: <AgendaPage /> },
    ],
  },
  {
    path: "/:companySlug/agendar",
    element: <PublicBookingLayout />,
    children: [{ index: true, element: <BookingWizard /> }],
  },
  { path: "*", element: <NotFoundPage /> },
]);
