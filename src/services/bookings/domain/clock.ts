/**
 * Fonte do "agora" do domínio.
 *
 * Existe para que nenhuma regra chame `new Date()` direto: o motor de
 * disponibilidade decide, a partir do relógio, quais slots já começaram e
 * portanto somem da grade. Com `new Date()` solto, o teste dessa regra dependeria
 * da hora em que a suíte roda e a cobertura de transição de horário de verão
 * seria impossível de escrever.
 *
 * A implementação de produção (`SystemClock`) vive em `infra/`, porque ler o
 * relógio do processo é um efeito colateral, não uma regra de negócio.
 */
export abstract class Clock {
  abstract now(): Date;
}
