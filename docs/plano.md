# Plano de Execução & Arquitetura: SaaS de Agendamento de Salas (Hotéis & Coworkings)

Este documento define a arquitetura técnica, regras de design de software, estrutura de pastas e o roteiro modular de implementação (dividido em etapas para prompts de Codex/Claude) para o desenvolvimento do SaaS de agendamento de salas.

---

## 1. Visão Geral do Produto & Arquitetura

### 1.1. Proposta de Valor
Plataforma SaaS multi-tenant voltada para hotéis e espaços de coworking gerenciarem suas salas de reuniões e eventos. Oferece um dashboard administrativo para gestão de recursos e um fluxo de agendamento público *step-by-step* (wizard com cards visuais, seleção de horários/períodos e checkout integrado via Stripe).

### 1.2. Stack Tecnológica
- **Runtime & Package Manager**: Bun
- **Linguagem**: TypeScript (Strict Mode)
- **Backend**: Fastify
- **Banco de Dados**: PostgreSQL
- **ORM / Query Builder**: Drizzle ORM + Drizzle Kit
- **Autenticação**: Better Auth (com suporte a organizações/tenancy)
- **Pagamentos & Assinaturas**: Stripe (SDK oficial + Webhooks seguros)
- **Frontend**: React (Vite) + TailwindCSS / Lucide Icons / Shadcn-style components
- **Validação & Contratos**: Zod (compartilhado entre backend e frontend em `src/shared`)
- **Testes**: Vitest (Unitários e E2E)

---

## 2. Regras Rígidas de Design e Arquitetura

### 2.1. Regra de Dependência em Camadas
A direção das dependências deve ser estritamente preservada:
$$\text{infra} \longrightarrow \text{application} \longrightarrow \text{domain}$$

- **Domain (`src/services/<service-name>/domain`)**:
  - Entidades puras, objetos de valor (Value Objects), regras de negócio centrais e erros de domínio.
  - **Zero dependências** de frameworks, ORMs ou bibliotecas externas de infraestrutura.
  - **Repositórios abstratos**: Devem ser definidos obrigatoriamente como **classes abstratas** (não interfaces), garantindo contratos tipados em runtime e facilidade de injeção.
    ```typescript
    export abstract class RoomRepository {
      abstract findById(id: string, companyId: string): Promise<Room | null>;
      abstract listByCompany(companyId: string, filters?: RoomFilters): Promise<Room[]>;
      abstract save(room: Room): Promise<void>;
      abstract update(room: Room): Promise<void>;
    }
    ```

- **Application (`src/services/<service-name>/application`)**:
  - Casos de uso (Use Cases / Commands / Queries) e DTOs de entrada/saída.
  - Orquestra fluxos entre repositórios e serviços de domínio.
  - **Regra:** *Serviço não chama serviço*. A comunicação entre domínios/serviços desacoplados deve ocorrer através de orquestradores de aplicação, handlers de eventos de domínio ou fila/event-bus, nunca por acoplamento direto síncrono entre serviços de domínio.

- **Infra (`src/services/<service-name>/infra`)**:
  - Implementação concreta dos repositórios via Drizzle ORM (`DrizzleRoomRepository extends RoomRepository`).
  - Controladores Fastify, rotas HTTP, plugins e integrações externas (Stripe, Better Auth client).

- **Shared (`src/shared/`)**:
  - Schemas Zod de validação compartilhados.
  - Tipos inferidos (`z.infer<typeof ...>`).
  - Enums (ex: `BookingStatus`, `RoomType`, `PaymentStatus`).
  - Definições de eventos de integração.

---

## 3. Estrutura de Pastas do Projeto

```text
.
├── .env / .env.example / .env.test
├── package.json
├── drizzle.config.ts
├── eslint.config.ts · prettier.config.js
├── tsconfig.json · tsconfig.services.json · tsconfig.web.json
├── vite.config.ts              # testes unitários dos serviços
├── vite.web.config.ts          # dev/build do frontend
├── vitest.e2e.config.ts        # e2e (usa .env.test)
├── scripts/                    # dev.sh, wait-for-postgres.sh, migration-run.sh
├── src/
│   ├── shared/                 # Contratos Zod, Enums, Interfaces de Eventos
│   │   ├── schemas/            # Schemas de validação de salas, reservas, auth, etc.
│   │   ├── enums/              # BookingStatus, CompanyType, Tier, etc.
│   │   └── types/              # DTOs utilitários
│   ├── services/               # Módulos de Backend desacoplados
│   │   ├── identity/           # Configuração e extensões do Better Auth
│   │   ├── companies/          # Gestão de Tenancy / Hotéis / Coworkings
│   │   ├── rooms/              # Gestão de Salas, Capacidade, Comodidades
│   │   │   ├── domain/         # Room Entity, RoomRepository (abstract class)
│   │   │   ├── application/    # CreateRoomUseCase, ListRoomsUseCase
│   │   │   └── infra/          # DrizzleRoomRepository, RoomController, Routes
│   │   ├── bookings/           # Motor de Reservas e Disponibilidade
│   │   │   ├── domain/         # Booking Entity, BookingRepository (abstract class), Slot
│   │   │   ├── application/    # CheckAvailabilityUseCase, CreateBookingUseCase
│   │   │   └── infra/          # DrizzleBookingRepository, BookingController, Routes
│   │   └── billing/            # Stripe Subscriptions, Checkout & Webhooks
│   │       ├── domain/         # Subscription Entity, Invoice, PaymentRepository
│   │       ├── application/    # HandleStripeWebhookUseCase, CreateCheckoutSessionUseCase
│   │       └── infra/          # StripeClient, WebhookController
│   └── web/                    # Frontend React SPA
│       ├── index.html
│       ├── src/
│       │   ├── assets/
│       │   ├── components/     # UI atoms & molecules (Buttons, Inputs, Cards, Badges)
│       │   ├── features/       # Módulos de interface por funcionalidade
│       │   │   ├── booking-flow/  # Step-by-Step Wizard (Cards, Calendário, Form)
│       │   │   ├── admin-rooms/   # CRUD de salas e capacidade
│       │   │   ├── admin-calendar/# Visualização diária/semanal de reservas
│       │   │   └── billing/       # Gestão de plano Stripe do hotel/coworking
│       │   ├── hooks/          # React hooks personalizados
│       │   ├── lib/            # Axios/Fetch client, auth-client
│       │   └── routes/         # Router e layouts (Admin Layout, Public Booking Layout)
├── test/
│   ├── services/               # Testes unitários (*.spec.ts) e E2E (*.e2e-spec.ts)
│   └── web/                    # Testes de componentes frontend
└── docs/
    ├── architecture.md
    └── database-schema.md
```

---

## 4. Roteiro de Implementação em Fases (Prompts para Codex / Claude)

A execução foi fatiada em sprints modulares e independentes para execução facilitada com agentes de código:

### Etapa 1: Fundação, Tooling e Banco de Dados (Drizzle + PostgreSQL)
- **Objetivo**: Inicializar projeto Bun, Fastify, Drizzle ORM, scripts de migração e schemas iniciais.
- **Entregáveis**:
  1. Configuração de `tsconfig.json`, `drizzle.config.ts` e scripts de execução.
  2. Drizzle Schemas: `companies`, `users`, `rooms`, `bookings`, `subscriptions`.
  3. Estrutura base de `src/shared` com Zod schemas e enums.

### Etapa 2: Módulo Core de Salas (Rooms Service) & Regra de Abstração
- **Objetivo**: Implementar o CRUD completo de salas com respeito estrito às camadas.
- **Entregáveis**:
  1. `Room` entity e `RoomRepository` (classe abstrata em `rooms/domain`).
  2. Use Cases: `CreateRoomUseCase`, `ListRoomsUseCase`, `UpdateRoomCapacityUseCase`.
  3. `DrizzleRoomRepository` em `infra/` implementando a classe abstrata.
  4. Rotas Fastify e testes unitários com repositório in-memory (`InMemoryRoomRepository`).

### Etapa 3: Motor de Disponibilidade & Reservas (Booking Engine)
- **Objetivo**: Implementar cálculo de slots de horários e prevenção de double-booking.
- **Entregáveis**:
  1. Algoritmo de checagem de colisão de horários no PostgreSQL (ranges / timestamps).
  2. `BookingRepository` (classe abstrata) e `CreateBookingUseCase`.
  3. Bloqueio pessimista ou transação com isolamento no Drizzle para evitar agendamentos concorrentes na mesma sala/horário.

### Etapa 4: Autenticação Multi-tenant (Better Auth) & RBAC
- **Objetivo**: Configurar autenticação segura, organizações (Hotéis/Coworkings) e permissões.
- **Entregáveis**:
  1. Configuração do Better Auth com plugin de Organizations/Multi-tenancy.
  2. Middleware de autenticação Fastify injetando `tenantId` e validação de sessão.
  3. Isolamento multi-tenant garantido em todas as queries (`companyId`).

### Etapa 5: Frontend - Wizard Step-by-Step de Agendamento
- **Objetivo**: Interface pública moderna e componentizada para o cliente final agendar.
- **Entregáveis**:
  1. **Passo 1 (Card Selection)**: Visualização das salas em cards com fotos, capacidade, recursos e preço/hora.
  2. **Passo 2 (Date & Time Slots)**: Grade interativa de horários disponíveis.
  3. **Passo 3 (Customer Details)**: Formulário rápido de identificação com validação Zod.
  4. **Passo 4 (Confirmação & Checkout)**: Resumo da reserva e acionamento de pagamento/confirmação.

### Etapa 6: Integração de Faturamento (Stripe Subscriptions & Checkout)
- **Objetivo**: Monetização do SaaS e cobrança de reservas.
- **Entregáveis**:
  1. Configuração do SDK Stripe e criação de Sessões de Checkout.
  2. Webhook handler seguro no Fastify (`/api/v1/webhooks/stripe`) com validação de assinatura.
  3. Atualização automática do status da assinatura do tenant e liberação da reserva.

### Etapa 7: Dashboard Administrativo & Gestão de Calendário
- **Objetivo**: Painel do hotel/coworking para visualizar reservas em formato de linha do tempo.
- **Entregáveis**:
  1. Visão de calendário diário/semanal por sala.
  2. Check-in/Check-out manual de reuniões.
  3. Relatórios rápidos de ocupação e receita.

---

## 5. Exemplo de Implementação de Contratos & Repositórios

### Contrato Zod Compartilhado (`src/shared/schemas/room.schema.ts`)
```typescript
import { z } from 'zod';

export const CreateRoomSchema = z.object({
  name: z.string().min(3).max(100),
  capacity: z.number().int().positive(),
  hourlyRateInCents: z.number().int().nonnegative(),
  amenities: z.array(z.string()).default([]),
  description: z.string().optional(),
});

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
```

### Classe Abstrata de Repositório (`src/services/rooms/domain/room.repository.ts`)
```typescript
import { Room } from './room.entity';

export interface RoomFilters {
  minCapacity?: number;
  isActive?: boolean;
}

export abstract class RoomRepository {
  abstract findById(id: string, companyId: string): Promise<Room | null>;
  abstract listByCompany(companyId: string, filters?: RoomFilters): Promise<Room[]>;
  abstract create(room: Room): Promise<void>;
  abstract update(room: Room): Promise<void>;
  abstract delete(id: string, companyId: string): Promise<void>;
}
```
