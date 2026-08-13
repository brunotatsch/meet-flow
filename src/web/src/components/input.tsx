import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@web/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Estado de erro visual (borda e anel vermelhos), sem esconder a mensagem de erro em si. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-destructive focus-visible:ring-destructive",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
