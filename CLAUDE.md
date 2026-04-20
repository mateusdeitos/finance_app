# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo for a couples' finance management app. Two top-level code directories:

- `backend/` — Go service (Echo + GORM + PostgreSQL), deployed on Google Cloud Run.
- `frontend/` — React 19 + TypeScript + Vite SPA (Mantine, TanStack Router/Query, React Hook Form).

Additional top-level folders: `e2e/` lives inside `frontend/`; `infra/` holds deployment config; `openspec/` holds OpenSpec change proposals; root-level `Dockerfile.claude`, `docker-compose.yml`, `docker-compose.e2e.yml`, and `justfile` orchestrate the full stack.

**Before working on a task, read the scoped `CLAUDE.md` for the area you're touching:**

- `backend/CLAUDE.md` — Go architecture, layered design, testing with testcontainers, domain model, mocks.
- `frontend/CLAUDE.md` — React stack, routing, data fetching, component conventions, Playwright e2e.

Tasks that span both layers (e.g. adding a field to an API response + consuming it in the UI) must honor both files. Do **not** assume this repo is single-stack; claims like "there is no frontend here" or "there is no backend here" are wrong.

## Architecture

Layered architecture for the backend:
```
HTTP Handler (Echo) → Service (business logic) → Repository (data access) → PostgreSQL (GORM)
```

See `backend/CLAUDE.md` for the full package map, domain concepts (Transaction, Settlement, UserConnection), middleware/auth, and testing patterns. See `frontend/CLAUDE.md` for the frontend architecture.

## Cross-cutting conventions

- Monetary amounts flow as **cents (int64)** end-to-end — backend domain stores cents, API serializes cents, frontend formats for display.
- Application sets `time.Local = UTC` at startup; all times are UTC across the wire.
- Soft deletes on transactions via `deleted_at`.
- `OriginalUserID` tracks which user originally created a transaction (relevant for shared/split expenses).
- Swagger/OpenAPI is generated from backend handler annotations into `backend/docs/`; run `just generate-docs` (from `backend/`) after changing handler comments — the frontend consumes this spec.

