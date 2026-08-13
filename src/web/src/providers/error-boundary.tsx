import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@web/components/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Error boundary de React só existe como classe: não há equivalente em hooks para
 * `getDerivedStateFromError`/`componentDidCatch`. Cobre erros de render da árvore
 * abaixo dela; erros de handler de evento ou de `fetch` continuam tratados onde
 * acontecem (ver `@web/lib/api`).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Erro não tratado na árvore de componentes.", error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Um erro inesperado interrompeu esta página. Você pode tentar novamente ou recarregar.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.reset}>
            Tentar novamente
          </Button>
          <Button onClick={() => window.location.reload()}>Recarregar página</Button>
        </div>
      </div>
    );
  }
}
