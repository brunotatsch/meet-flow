import { Check } from "lucide-react";
import { cn } from "@web/lib/utils";
import { NAVIGABLE_STEPS, type WizardStep } from "./booking-wizard-reducer";

const STEP_LABEL: Record<WizardStep, string> = {
  sala: "Sala",
  horario: "Data e horário",
  dados: "Seus dados",
  revisao: "Revisão",
  sucesso: "Confirmado",
};

export function StepIndicator({ current }: { current: WizardStep }) {
  const currentIndex = NAVIGABLE_STEPS.indexOf(current);

  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Progresso do agendamento">
      {NAVIGABLE_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step === current;

        return (
          <li key={step} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary text-primary",
                  !isCompleted && !isCurrent && "border-border text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-xs",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {STEP_LABEL[step]}
              </span>
            </div>
            {index < NAVIGABLE_STEPS.length - 1 && (
              <div className={cn("h-px flex-1", isCompleted ? "bg-primary" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
