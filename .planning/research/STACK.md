# Stack Research: Charges Feature

**Project:** Couples Finance App — v1.1 Charges Milestone
**Researched:** 2026-04-14
**Mode:** Ecosystem (focused on new additions only)

---

## New Dependencies Required

### Backend (Go)

**None required.**

The Charges feature maps cleanly onto patterns already established in the codebase. Every technical need has a direct precedent:

| Need | Existing Mechanism | Location |
|------|--------------------|----------|
| Lifecycle state (pending/accepted/rejected/cancelled) | `UserConnectionStatusEnum` string enum + DB column | `internal/domain/user_connection.go` |
| Atomic accept → auto-create transfers | `DBTransaction.Begin/Commit/Rollback` + `TransactionService.Create` | `internal/repository/db_transaction.go`, `transaction_create.go` |
| CRUD + filtering | Repository pattern with filter structs | every existing `*_repository.go` |
| Authorization (only parties can act) | `pkg/appcontext.GetUserIDFromContext` + service-level ownership checks | `transaction_service.go`, `user_connection_service.go` |
| Error taxonomy | `pkg/errors` with `ErrorCode` + `ErrorTag` | `pkg/errors/errors.go` |
| HTTP routing + Swagger | Echo v4 + swaggo/swag | `internal/handler/` |

### Frontend (React/TypeScript)

**None required.**

| Need | Existing Mechanism |
|------|--------------------|
| API calls | `@tanstack/react-query` v5 (already used for all resources) |
| Forms (create charge, accept/reject) | `react-hook-form` + `zod` v4 (already used in transaction forms) |
| List + badge rendering | `@mantine/core` v7 (Badge, Table, Notification components built-in) |
| Routing (new charges page) | `@tanstack/react-router` v1 (file-based routes, just add a new route file) |
| Date display | `dayjs` (already a dependency) |
| Icons (pending/paid badges) | `@tabler/icons-react` (already a dependency) |

---

## Existing Stack Leverage

**DB transactions for accept-flow atomicity.** The `DBTransactionImpl` pattern (`Begin → work → Commit`, `defer Rollback`) is already used in `transactionService.Create`. Accepting a charge (update charge status + create two transfer transactions) fits exactly into this pattern — no saga library, no outbox, no distributed coordination needed. The operation is local to a single PostgreSQL database.

**State machine as a Go string enum + DB CHECK constraint.** The `UserConnectionStatusEnum` (`pending`, `accepted`, `rejected`) shows the established pattern: a typed string in the domain, a Postgres ENUM or CHECK constraint in the migration, and status-transition validation in the service layer. Charges need: `pending → accepted | rejected | cancelled`. This is 4 states, 3 transitions — implementable as a `switch` in the service with a `ServiceError(ErrCodeForbidden)` for invalid transitions.

**Transfer creation already works cross-user.** The existing `TransactionService.Create` handles cross-user transfers via `SplitSettings` + `UserConnection`. The charge accept flow creates two transfers (debtor's debit + creditor's credit). This is structurally identical to how split expenses already produce linked transactions for both users.

**Settlement model shows the "linked-record" pattern.** The `settlements` table links to `source_transaction_id` and `parent_transaction_id`. A `charges` table can follow the same FK-to-transactions pattern to record which transfers a charge produced on acceptance.

**`samber/lo` already present.** Slice utilities for filter/map operations on charge lists are already available at no additional cost.

**Mantine Badge for sidebar count.** Mantine v7's `Badge` and `Indicator` components handle the "pending charges count" sidebar badge without any extra notification library.

---

## What NOT to Add

**No workflow/state-machine library** (e.g., `stateless`, `go-fsm`, `looplab/fsm`). With 4 states and 3 transitions, a library adds abstraction overhead that outweighs any benefit. A `switch` statement in the service is more readable, testable, and consistent with how `UserConnectionStatusEnum` transitions are already handled.

**No notification/push library** (e.g., Firebase FCM, `gorush`, WebSocket broker). The PROJECT.md feature list specifies a "sidebar badge for pending charges requiring action" — this is a polling-based count (a `GET /charges?status=pending&role=receiver` endpoint returning a count). No real-time push is in scope for v1.1. Adding FCM or WebSockets would be a separate milestone with significant infrastructure cost.

**No message queue / outbox pattern** (e.g., Kafka, RabbitMQ, Watermill). The accept-charge → create-transfers flow is a single synchronous DB transaction in PostgreSQL. Message queues solve distributed consistency problems; this is a monolith with one database.

**No dedicated charge-state audit/history table** (unless explicitly required). The charge entity's `updated_at` + status column is sufficient for v1.1. A full event-sourced history (every status transition logged) can be deferred.

**No new ORM or query builder.** GORM is already handling all queries. The charges repository will follow the same `Search(filter)` / `Create` / `Update` pattern as every other repository in the codebase.

**No frontend state management library** (Redux, Zustand, Jotai). React Query's server-state cache handles all charge data. The existing pattern — `useQuery` for lists, `useMutation` for actions — is sufficient.

---

## Recommendation

**Zero new dependencies for the Charges feature.** The existing stack covers every requirement:

- Lifecycle state: typed Go enum + Postgres column
- Atomic accept-flow: existing `DBTransaction` wrapper
- Transfer creation: existing `TransactionService.Create`
- CRUD API: Echo handlers following the existing handler pattern
- Frontend list + badge: React Query + Mantine (already installed)
- Forms: react-hook-form + Zod (already installed)

The codebase has explicit precedents for every sub-problem. Adding dependencies would introduce surface area without solving anything new. The implementation is a new domain entity (`Charge`), a new repository, a new service, new handlers, and new frontend routes — all following established patterns in the codebase.

**Confidence: HIGH** — all findings based on direct inspection of the codebase (go.mod, domain types, service/handler patterns, migration history).
