import { RouterProvider } from "react-router-dom";
import { ToastProvider } from "@web/components/toast";
import { ErrorBoundary } from "@web/providers/error-boundary";
import { router } from "@web/routes/router";

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ErrorBoundary>
  );
}
