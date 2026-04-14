# Roadmap: Couples Finance App — Backend

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- 🔄 **v1.1 Charges** — Phases 5–8 (in progress)

## Phases

<details>
<summary>✅ v1.0 Recurrence Redesign (Phases 1–4) — SHIPPED 2026-04-10</summary>

- [x] Phase 1: Domain & Validation (3/3 plans) — completed 2026-04-09
- [x] Phase 2: Service & API (2/2 plans) — completed 2026-04-09
- [x] Phase 3: Frontend (1/1 plan) — completed 2026-04-10
- [x] Phase 4: Tests (2/2 plans) — completed 2026-04-10

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Charges (Phases 5–8)

- [x] **Phase 5: Charge Domain & DB** — Charge entity, status machine, DB migrations, and transaction charge_id enhancement
- [ ] **Phase 6: Charge Repository, Service & API (CRUD + Listing)** — Repository, create/reject/cancel/list service methods with handlers, IDOR protection, badge endpoint
- [ ] **Phase 7: Accept + Atomic Transfer** — Charge acceptance triggers atomic dual-transfer creation with race-condition guard
- [ ] **Phase 8: Frontend** — Charges listing page, create/accept/reject/cancel forms, sidebar badge

## Phase Details

### Phase 5: Charge Domain & DB
**Goal**: The system has a complete, validated Charge data model and database schema that other phases can build on
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: CHG-01, CHG-02, CHG-07, TXN-01, TXN-02
**Success Criteria** (what must be TRUE):
  1. A `Charge` domain struct exists with all required fields (id, connection_id, payer/charger user IDs, amount, description, status, nullable transaction links, timestamps)
  2. The `charges` table exists in the database with correct constraints (FK to user_connections ON DELETE RESTRICT, self-user check, amount > 0, transaction-pair consistency check, status index)
  3. The `transactions` table has a nullable `charge_id` FK column and the Go domain/entity models reflect this field
  4. Domain-layer status transition validation rejects any transition from a terminal state (paid/rejected/cancelled) and any invalid forward transition
  5. Running `just migrate-up` on a fresh DB applies both migrations without errors
**Plans:** 2 plans
Plans:
- [x] 05-01-PLAN.md — Charge domain model, GORM entity, and Transaction ChargeID enhancement
- [x] 05-02-PLAN.md — DB migrations (charges table + transactions charge_id column)

### Phase 6: Charge Repository, Service & API (CRUD + Listing)
**Goal**: Users can create, reject, cancel, and list charges through a working API with IDOR protection
**Depends on**: Phase 5
**Requirements**: CHG-03, CHG-05, CHG-06, CHG-08, CHG-12, CHG-13, CHG-14
**Success Criteria** (what must be TRUE):
  1. Authenticated user can POST /api/charges to create a charge linked to an accepted connection; request fails with 400 if the connection is not accepted or the payer is not a member
  2. Authenticated user (charger only) can POST /api/charges/:id/cancel to cancel their own pending charge; request fails with 403 for any other user
  3. Authenticated user (payer only) can POST /api/charges/:id/reject to reject a pending charge; request fails with 403 for any other user
  4. Any user not party to a charge receives 403 (not 404 information leak) when attempting to view or act on it
  5. GET /api/charges returns sent charges (authored by caller) and received charges (caller is payer) separately filterable by status and period
  6. GET /api/charges/pending-count returns the count of pending charges where the caller is the payer (action required from them); returns 0 when none exist
**Plans**: TBD
**UI hint**: no

### Phase 7: Accept + Atomic Transfer
**Goal**: Accepting a charge atomically settles the debt by creating a linked transfer pair in a single database transaction, with no possibility of double-acceptance
**Depends on**: Phase 6
**Requirements**: CHG-04, CHG-09, CHG-10, CHG-11
**Success Criteria** (what must be TRUE):
  1. Authenticated payer can POST /api/charges/:id/accept; charge transitions to paid and exactly two linked transfer transactions appear in both users' accounts
  2. Both the charge status update and both transfer inserts succeed or all are rolled back — no partial state is possible
  3. A second concurrent accept request for the same charge is rejected with a conflict error; only one transfer pair is created regardless of concurrency
  4. The two created transfer transactions each have their `charge_id` field set to the originating charge ID
  5. Attempting to accept a charge where the caller is not the payer returns 403; attempting to accept a non-pending charge returns an appropriate domain error
**Plans**: TBD
**UI hint**: no

### Phase 8: Frontend
**Goal**: Users can manage their charges entirely through the web interface, with real-time visibility of pending actions via the sidebar badge
**Depends on**: Phase 7
**Requirements**: FE-01, FE-02, FE-03, FE-04, FE-05, FE-06, FE-07, FE-08
**Success Criteria** (what must be TRUE):
  1. User can navigate to a Charges page from the sidebar and see sent and received charges in distinct sections with status labels
  2. User can open a create-charge form, select a connection and period, and submit; the new charge appears immediately in the sent section
  3. User can accept a received pending charge by specifying a source account; the charge moves to paid and no longer appears in the pending list
  4. User can reject a received pending charge with a single confirmation action; user (author) can cancel a sent pending charge with a single confirmation action
  5. The sidebar nav badge displays the count of received pending charges requiring the user's action and disappears when no pending charges exist
  6. After any accept/reject/cancel action, the sidebar badge count updates without requiring a full page reload
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Domain & Validation | v1.0 | 3/3 | Complete | 2026-04-09 |
| 2. Service & API | v1.0 | 2/2 | Complete | 2026-04-09 |
| 3. Frontend | v1.0 | 1/1 | Complete | 2026-04-10 |
| 4. Tests | v1.0 | 2/2 | Complete | 2026-04-10 |
| 5. Charge Domain & DB | v1.1 | 2/2 | Complete | 2026-04-14 |
| 6. Charge Repository, Service & API (CRUD + Listing) | v1.1 | 0/? | Not started | - |
| 7. Accept + Atomic Transfer | v1.1 | 0/? | Not started | - |
| 8. Frontend | v1.1 | 0/? | Not started | - |

---
*Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 started: 2026-04-14*
