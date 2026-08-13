import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@web/lib/utils";

export type ToastVariant = "default" | "success" | "error";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Em ms. `0` mantém o toast até ser fechado manualmente. */
  durationMs?: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  error: XCircle,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  success: "border-border bg-card text-card-foreground [&_svg]:text-primary",
  error: "border-destructive/50 bg-card text-card-foreground [&_svg]:text-destructive",
};

/**
 * Fila de toasts em memória, sem biblioteca externa: a única funcionalidade que
 * pediria uma (swipe-to-dismiss) não está no escopo da MVP-09.
 * `aria-live="polite"` + `role="status"` fazem leitores de tela anunciarem cada
 * toast sem interromper o que já estava sendo lido.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "default", durationMs = DEFAULT_DURATION_MS }: ToastInput) => {
      const id = crypto.randomUUID();

      setItems((current) => [...current, { id, title, description, variant }]);

      if (durationMs > 0) {
        setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
        >
          {items.map((item) => {
            const Icon = VARIANT_ICON[item.variant];

            return (
              <div
                key={item.id}
                role="status"
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 shadow-lg",
                  VARIANT_CLASSES[item.variant],
                )}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Fechar notificação"
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  }

  return context;
}
