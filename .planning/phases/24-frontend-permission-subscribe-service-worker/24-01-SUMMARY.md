---
phase: 24-frontend-permission-subscribe-service-worker
plan: "01"
subsystem: backend
tags: [push-notifications, vapid, web-push, swagger, tdd]
dependency_graph:
  requires: []
  provides: [GET /api/push-subscriptions/vapid-public-key, per-type push title]
  affects: [frontend/usePushSubscription, service-worker notification rendering]
tech_stack:
  added: []
  patterns: [handler-thin-constructor-injection, tdd-red-green, per-type-title-switch]
key_files:
  created:
    - backend/internal/service/notification_build_payload_test.go
  modified:
    - backend/internal/domain/push_subscription.go
    - backend/internal/handler/push_subscription_handler.go
    - backend/internal/handler/push_subscription_handler_test.go
    - backend/cmd/server/main.go
    - backend/internal/service/notification_service.go
    - backend/docs/docs.go
    - backend/docs/swagger.json
    - backend/docs/swagger.yaml
decisions:
  - "VAPID public key served from backend env (single source of truth) — VITE_VAPID_PUBLIC_KEY rejected per D-24-1"
  - "Per-type Portuguese title added server-side in buildPayload switch — SW renders payload.title as-is (no SW-side copy logic)"
  - "just generate-mocks NOT needed — PushSubscriptionService interface is untouched; only handler struct fields and constructor signature changed"
  - "buildPayload unit tests placed in a new file without integration build tag so they run under go test -short"
metrics:
  completed_date: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 24 Plan 01: VAPID Public Key Endpoint + Per-Type Push Titles Summary

Backend prerequisites for Phase 24 Wave 2: VAPID public-key delivery endpoint and per-type Portuguese push notification titles in buildPayload, implemented TDD with atomic commits.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add VAPID public-key endpoint (D-24-1) | a88206e | domain/push_subscription.go, handler/push_subscription_handler.go, handler/push_subscription_handler_test.go, cmd/server/main.go, docs/ |
| 2 (RED) | Failing buildPayload tests (D-24-2) | 7ba78cd | service/notification_build_payload_test.go |
| 2 (GREEN) | Per-type push title in buildPayload (D-24-2) | ec77027 | service/notification_service.go |

## Verification Gates

- `go build ./...` — PASS
- `go vet -tags=integration ./internal/...` — PASS
- `go test -short ./...` — PASS (all packages, including new buildPayload unit tests)
- Route ordering: `/vapid-public-key` registered at line 211 before bare `GET ""` at line 212 — confirmed
- Swagger docs regenerated: `backend/docs/{docs.go,swagger.json,swagger.yaml}` include the new endpoint and `domain.VapidPublicKeyResponse` schema

## Mock Regeneration

`just generate-mocks` was NOT needed. The `PushSubscriptionService` interface (Subscribe/Unsubscribe/Status) is completely untouched. Only the `PushSubscriptionHandler` struct gained a `vapidPublicKey string` field and its constructor signature changed from `NewPushSubscriptionHandler(services *service.Services)` to `NewPushSubscriptionHandler(services *service.Services, vapidPublicKey string)` — neither is a mocked interface.

## Deviations from Plan

None — plan executed exactly as written. All task 1 infrastructure (domain struct, handler method/field, constructor, route, swagger) was in the working tree at plan start (from a prior partial implementation); these were staged and committed as task 1. Task 2 followed strict TDD: RED commit with failing tests, then GREEN commit with implementation.

## Known Stubs

None. The endpoint returns `cfg.VAPID.PublicKey` directly (no mock data). The title switch covers all defined `domain.NotificationType*` constants plus a `"Finance App"` default.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | handler/push_subscription_handler.go | VapidPublicKey endpoint serves a non-secret public key (VAPID public keys are designed to be public per RFC 8292); endpoint requires auth which is strictly safe — accepted per T-24-01 |

## Self-Check: PASSED

- `backend/internal/service/notification_build_payload_test.go` — FOUND
- `backend/internal/domain/push_subscription.go` (VapidPublicKeyResponse) — FOUND
- `backend/internal/handler/push_subscription_handler.go` (VapidPublicKey method) — FOUND
- `backend/cmd/server/main.go` (vapid-public-key route before bare GET) — FOUND
- `backend/internal/service/notification_service.go` (Nova cobrança) — FOUND
- Commits a88206e, 7ba78cd, ec77027 — FOUND in git log
