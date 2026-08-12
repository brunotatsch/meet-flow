-- Prevenção de double-booking no banco, não na aplicação.
--
-- Nada aqui é gerado pelo drizzle-kit: coluna gerada, extensão e constraint de
-- exclusão parcial estão fora do que o Drizzle sabe expressar. Por isso `period`
-- também não existe no schema TypeScript: o Postgres a mantém, a aplicação nunca
-- a escreve, e o drizzle-kit não a enxerga no snapshot (logo, não tenta removê-la).

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- Intervalo semiaberto [): reservas encostadas (fim de uma == início da outra)
-- não se sobrepõem.
ALTER TABLE "bookings"
  ADD COLUMN "period" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;--> statement-breakpoint

-- Invariante central: para uma mesma sala, dois períodos que se cruzam não podem
-- coexistir. Reservas canceladas ficam fora do índice e liberam o horário.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("room_id" WITH =, "period" WITH &&)
  WHERE ("status" <> 'cancelled');
