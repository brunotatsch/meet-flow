import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@web/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
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

Textarea.displayName = "Textarea";
