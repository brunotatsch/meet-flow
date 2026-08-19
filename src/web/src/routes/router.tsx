import { createBrowserRouter } from "react-router-dom";
import { AgendaPage } from "@web/features/admin-agenda/agenda-page";
import { BillingPage } from "@web/features/admin-billing/billing-page";
import { ReportsPage } from "@web/features/admin-reports/reports-page";
import { RoomBlocksPage } from "@web/features/admin-rooms/room-blocks-page";
import { RoomFormPage } from "@web/features/admin-rooms/room-form-page";
import { RoomListPage } from "@web/features/admin-rooms/room-list-page";
import { RoomSchedulePage } from "@web/features/admin-rooms/room-schedule-page";
import { InvitationAcceptPage } from "@web/features/admin-team/invitation-accept-page";
import { TeamPage } from "@web/features/admin-team/team-page";
import { BookingWizard } from "@web/features/booking-flow/booking-wizard";
import { CheckoutCancelPage } from "@web/features/booking-flow/routes/checkout-cancel-page";
import { CheckoutSuccessPage } from "@web/features/booking-flow/routes/checkout-success-page";
import { CancellationPage } from "@web/features/public-cancellation/cancellation-page";
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
  { path: "/admin/convite/:invitationId", element: <InvitationAcceptPage /> },
  { path: "/cancelar-reserva", element: <CancellationPage /> },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <RoomListPage /> },
      { path: "rooms/new", element: <RoomFormPage /> },
      { path: "rooms/:id/edit", element: <RoomFormPage /> },
      { path: "rooms/:id/schedule", element: <RoomSchedulePage /> },
      { path: "rooms/:id/blocks", element: <RoomBlocksPage /> },
      { path: "agenda", element: <AgendaPage /> },
      { path: "equipe", element: <TeamPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "relatorios", element: <ReportsPage /> },
    ],
  },
  {
    path: "/:companySlug/agendar",
    element: <PublicBookingLayout />,
    children: [
      { index: true, element: <BookingWizard /> },
      { path: "sucesso", element: <CheckoutSuccessPage /> },
      { path: "cancelado", element: <CheckoutCancelPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
