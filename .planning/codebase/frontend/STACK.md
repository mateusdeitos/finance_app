# Technology Stack — Frontend

**Analysis Date:** 2026-04-09

## Languages

**Primary:**
- TypeScript 5.7 — all source files in `src/`

## Runtime

**Environment:**
- Node.js (version managed externally; no `.nvmrc` present)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19 — UI framework; uses React Compiler (`babel-plugin-react-compiler`)
- Vite 6.2 — dev server and production bundler

**Routing:**
- TanStack Router 1.166 — file-based routing with code generation; config in `vite.config.ts` via `@tanstack/router-plugin/vite`; generated route tree at `src/routeTree.gen.ts`

**Data Fetching:**
- TanStack Query 5.71 — server state management; `QueryClient` singleton in `src/queryClient.ts`
- `@tanstack/zod-adapter` — bridges Zod schemas to TanStack Router search param validation

**Forms:**
- React Hook Form 7.55 — form state; always used with `FormProvider` + `useFormContext` pattern
- `@hookform/resolvers` 5.2 — connects Zod schemas to RHF via `zodResolver`

**Validation:**
- Zod 4.3 — schema definitions; schemas live alongside their form components

**Component Library:**
- Mantine 7.17 (core + dates + hooks) — all UI components; custom theme at `src/theme.ts`
- `@tabler/icons-react` 3.40 — icon set used exclusively with Mantine components

**Styling:**
- CSS Modules — colocated `.module.css` files for component-specific overrides on top of Mantine

**Date Handling:**
- dayjs 1.11 — date formatting/manipulation (imported but Mantine dates uses it internally)

## Key Dependencies

**Critical:**
- `@mantine/dates` — `DatePickerInput` used in transaction/recurrence forms
- `@mantine/hooks` — `useDisclosure`, `useTimeout`, `useIsMobile`-related hooks
- `zod` v4 — validation throughout; note v4 API differs from v3 (e.g. `z.object({ error: ... })`)

**Infrastructure:**
- `vite-plugin-pwa` 1.2 — PWA manifest + service worker (auto-update); config in `vite.config.ts`

## Configuration

**Environment:**
- `VITE_API_URL` — backend base URL (defaults to `http://localhost:8080` in all API files)
- Loaded via `import.meta.env.VITE_API_URL`

**Build:**
- `vite.config.ts` — path alias `@` → `./src`, router plugin, PWA plugin
- `tsconfig.json` — strict mode implied by `tsc -b` in build script

**Path Alias:**
- `@/` resolves to `src/` — use in all imports instead of relative paths

## Platform Requirements

**Development:**
- `npm run dev` — Vite dev server on port 5173 (or `PORT` env var)

**Production:**
- `npm run build` — TypeScript check + Vite bundle
- Deployed as static SPA; backend served separately on Google Cloud Run
- PWA: service worker auto-updates; icons at `public/icon-192.png` and `public/icon-512.png`

## Testing

**E2E:**
- Playwright 1.58 — tests in `e2e/`
- Commands: `npm run e2e`, `npm run e2e:ui`
- Requires `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_BACKEND_URL`

**Unit/Integration:**
- Not present — no Jest/Vitest config found

---

*Stack analysis: 2026-04-09*
