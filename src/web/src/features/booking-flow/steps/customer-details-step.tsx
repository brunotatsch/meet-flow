import { useState, type FormEvent } from "react";
import { CreateBookingObjectSchema } from "@shared/schemas/booking.schema";
import { Button } from "@web/components/button";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { useBookingWizardContext } from "../use-booking-wizard-context";

const CustomerDetailsSchema = CreateBookingObjectSchema.pick({
  customerName: true,
  customerEmail: true,
  customerPhone: true,
});

type FieldErrors = Partial<Record<"customerName" | "customerEmail" | "customerPhone", string>>;

export function CustomerDetailsStep() {
  const { state, dispatch } = useBookingWizardContext();
  const [customerName, setCustomerName] = useState(state.customer?.customerName ?? "");
  const [customerEmail, setCustomerEmail] = useState(state.customer?.customerEmail ?? "");
  const [customerPhone, setCustomerPhone] = useState(state.customer?.customerPhone ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = CustomerDetailsSchema.safeParse({
      customerName,
      customerEmail,
      customerPhone: customerPhone || undefined,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors | undefined;
        if (field && !nextErrors[field]) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    dispatch({ type: "SUBMIT_CUSTOMER", customer: parsed.data });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Seus dados</h1>

      <form onSubmit={handleSubmit} className="mt-4 flex max-w-md flex-col gap-4" noValidate>
        <div>
          <Label htmlFor="customer-name">Nome</Label>
          <Input
            id="customer-name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            invalid={Boolean(errors.customerName)}
            aria-describedby={errors.customerName ? "customer-name-error" : undefined}
            className="mt-1.5"
          />
          {errors.customerName && (
            <p id="customer-name-error" role="alert" className="mt-1 text-sm text-destructive">
              {errors.customerName}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="customer-email">E-mail</Label>
          <Input
            id="customer-email"
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            invalid={Boolean(errors.customerEmail)}
            aria-describedby={errors.customerEmail ? "customer-email-error" : undefined}
            className="mt-1.5"
          />
          {errors.customerEmail && (
            <p id="customer-email-error" role="alert" className="mt-1 text-sm text-destructive">
              {errors.customerEmail}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="customer-phone">Telefone (opcional)</Label>
          <Input
            id="customer-phone"
            type="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            invalid={Boolean(errors.customerPhone)}
            aria-describedby={errors.customerPhone ? "customer-phone-error" : undefined}
            className="mt-1.5"
          />
          {errors.customerPhone && (
            <p id="customer-phone-error" role="alert" className="mt-1 text-sm text-destructive">
              {errors.customerPhone}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <Button type="button" variant="outline" onClick={() => dispatch({ type: "BACK" })}>
            Voltar
          </Button>
          <Button type="submit">Continuar</Button>
        </div>
      </form>
    </div>
  );
}
