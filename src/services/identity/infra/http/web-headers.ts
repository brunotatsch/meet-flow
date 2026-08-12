import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Converte os cabeçalhos do Fastify (Node) para o `Headers` da Fetch API, que é o
 * que o Better Auth consome.
 */
export function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
      continue;
    }

    if (value !== undefined) headers.append(name, value);
  }

  return headers;
}

/**
 * Copia os cabeçalhos de uma `Response` do Better Auth para a resposta do Fastify.
 *
 * `Set-Cookie` é tratado à parte porque um login pode emitir mais de um cookie
 * (sessão e `dont_remember`, por exemplo) e `Headers.get()` os juntaria em uma
 * string única, quebrando os dois. `getSetCookie()` preserva a lista.
 *
 * `Content-Length` é descartado: quem serializa o corpo daqui em diante é o Fastify,
 * e um valor herdado da `Response` original pode não bater com o que ele envia.
 */
export function applyWebHeaders(reply: FastifyReply, headers: Headers): void {
  const setCookie = headers.getSetCookie();

  if (setCookie.length > 0) reply.header("set-cookie", setCookie);

  headers.forEach((value, name) => {
    const lowerCased = name.toLowerCase();
    if (lowerCased === "set-cookie" || lowerCased === "content-length") return;
    reply.header(name, value);
  });
}
