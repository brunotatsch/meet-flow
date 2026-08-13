import { useEffect, useState } from "react";

export type FetchState<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

interface KeyedResult<T> {
  key: string;
  state: FetchState<T>;
}

/**
 * Busca `fetcher()` de novo sempre que `key` muda, sem `setState` síncrono no
 * corpo do efeito.
 *
 * `react-hooks/set-state-in-effect` (parte do conjunto de regras do React
 * Compiler) proíbe resetar o estado para "carregando" como a primeira linha do
 * efeito - o padrão que o próprio react.dev recomendava antes. Aqui "carregando"
 * é **derivado**: é o que sobra quando o resultado guardado ainda não é da `key`
 * atual, nunca um `setState` explícito disparado a cada troca de dependência.
 *
 * `key: null` pausa a busca (por exemplo, uma sala ainda não escolhida).
 */
export function useKeyedFetch<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): FetchState<T> {
  const [keyedResult, setKeyedResult] = useState<KeyedResult<T> | null>(null);

  useEffect(() => {
    if (key === null) return;

    const controller = new AbortController();

    fetcher(controller.signal)
      .then((data) => setKeyedResult({ key, state: { status: "ready", data } }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setKeyedResult({ key, state: { status: "error" } });
      });

    return () => controller.abort();
    // `fetcher` fica de fora de propósito: é uma closure nova a cada render, e
    // incluí-la reexecutaria o efeito em todo render em vez de só quando `key`
    // muda, que é a única coisa que deveria disparar uma nova busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null || keyedResult?.key !== key) return { status: "loading" };
  return keyedResult.state;
}
