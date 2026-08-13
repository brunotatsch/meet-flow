import { useOutletContext } from "react-router-dom";
import { LoadingScreen } from "@web/components/loading-screen";
import type { PublicBookingContext } from "@web/layouts/public-booking-layout";
import { BookingWizardProvider } from "./booking-wizard-provider";
import { StepIndicator } from "./step-indicator";
import { CustomerDetailsStep } from "./steps/customer-details-step";
import { ReviewStep } from "./steps/review-step";
import { RoomSelectionStep } from "./steps/room-selection-step";
import { ScheduleStep } from "./steps/schedule-step";
import { SuccessStep } from "./steps/success-step";
import { useBookingWizard } from "./use-booking-wizard";

/**
 * Orquestrador dos 4 passos do agendamento público.
 *
 * O passo atual (e a identidade do que foi escolhido - sala, data, horário) fica
 * sincronizado na URL via `useBookingWizard`, então um F5 no meio do fluxo não
 * perde o progresso. Isso é só na carga inicial: editar a URL manualmente depois
 * de montado não pula o estado do wizard, porque a sincronização é de mão única
 * (estado -> URL) depois da reidratação - é assim que se evita alguém colar uma
 * URL com `step=revisao` sem ter passado pelos passos anteriores.
 */
export function BookingWizard() {
  const { companySlug } = useOutletContext<PublicBookingContext>();
  const { state, dispatch, hydrating } = useBookingWizard(companySlug);

  if (hydrating) {
    return <LoadingScreen label="Carregando sua reserva..." />;
  }

  return (
    <BookingWizardProvider value={{ companySlug, state, dispatch }}>
      {state.step !== "sucesso" && <StepIndicator current={state.step} />}
      {state.step === "sala" && <RoomSelectionStep />}
      {state.step === "horario" && <ScheduleStep />}
      {state.step === "dados" && <CustomerDetailsStep />}
      {state.step === "revisao" && <ReviewStep />}
      {state.step === "sucesso" && <SuccessStep />}
    </BookingWizardProvider>
  );
}
