# CLAUDE.md — Landing

This file provides guidance to Claude Code (claude.ai/code) when working with the marketing landing page.

## Project Overview

Static marketing site for Dividim (a couples' finance management app), deployed to Cloudflare Pages. This is a deliberately separate, lighter tech context from `frontend/` — no Mantine, no TanStack Router/Query, no forms/validation stack. It has no backend of its own and no real user data.

## Stack

- **Framework**: Astro (`output: 'static'`, no adapter)
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite`
- **Interactivity**: React islands (`@astrojs/react`) hydrated with `client:visible`, animated with Motion (`motion/react`)
- **Deploy**: Cloudflare Pages, direct-upload via `wrangler pages deploy` (see `terraform/` and `.github/workflows/deploy-landing.yml` / `preview-landing.yml` at the repo root)

## Commands

```bash
npm run dev       # start dev server
npm run build     # production build (outputs to dist/)
npm run preview   # preview production build
```

## Project Structure

```
src/
  layouts/BaseLayout.astro   # <html>, meta/OG tags, favicon, global styles
  components/                # static .astro sections (Header, Hero, FeatureHighlights, ...)
  components/islands/        # animated React islands (client:visible only)
  pages/index.astro          # composes all sections
  styles/global.css          # Tailwind v4 entrypoint + brand color tokens (@theme)
terraform/                   # separate Terraform root module (Cloudflare provider) — see repo-root infra/ for the GCP one
```

## Core Conventions

### 1. Static-first

Default every new section to a plain `.astro` component with **zero client JS**. Only reach for a `client:visible` React island when the section genuinely needs scroll-triggered animation or interactivity. Keep each island small and self-contained — no shared state between islands, no global store.

### 2. Mobile first

Same rule as `frontend/CLAUDE.md`: design and validate every section at a mobile viewport (~375px) before expanding to desktop with `sm:`/`md:`/`lg:` breakpoints. One column by default; multi-column grids only from `md:` up. No hover-only interactions. Touch targets ≥ ~44px (`min-h-11`).

### 3. Illustrative charts only — no `recharts`

The chart-shaped visuals here (donut, flow diagram) are hand-rolled SVG with static, fake data, animated via Motion. **Do not** import `recharts` or any of the app's real charting stack into `landing/` — there's no real user data to plot on a marketing page, and it would bloat the bundle for no benefit.

### 4. Copy: pt-BR, reuse real app copy

All copy is Brazilian Portuguese, matching `frontend/`. When a section's content overlaps with existing marketing copy in the app (e.g. `frontend/src/pages/LoginPage.tsx`, `frontend/src/components/login/LoginFeatureList.tsx`), reuse those exact strings instead of rewording them.

### 5. Brand tokens

Color tokens in `src/styles/global.css` (`@theme`) are transcribed 1:1 from `frontend/src/theme.ts`'s Mantine palette (`brand` ≈ Mantine `blue`, `positive` ≈ `green`, `negative` ≈ `red`, `warning` ≈ `yellow`, `neutral` ≈ `grey`). The gold `#FFD700` from the logo (`frontend/public/icon.svg`, copied to `public/favicon.svg`) is a rare accent only — never a background or large fill.

### 6. Env vars

Only one: `PUBLIC_APP_URL` (Astro's `PUBLIC_*` convention — must keep that prefix to be exposed client-side). Every CTA links to `${PUBLIC_APP_URL}/login`. Set locally via `.env` (see `.env.example`), injected in CI via `vars.PUBLIC_APP_URL`.

## Purge de cache no deploy

Landing (apex `dividim.app`) e app (`app.dividim.app`) são CNAMEs *proxied* na mesma zona, então o edge da Cloudflare fica na frente do Pages e um deploy sozinho não invalida o que já está cacheado. Os dois workflows de deploy chamam `.github/actions/cloudflare-purge-cache` logo depois do `wrangler pages deploy`.

Configuração no GitHub:

- `vars.CLOUDFLARE_ZONE_ID` — Zone ID de `dividim.app`. Se não estiver setada o purge é pulado com warning (o deploy não falha).
- Token: por padrão reusa `secrets.CLOUDFLARE_API_TOKEN`, que precisa ganhar o escopo **Zone → Cache Purge → Purge** além do Pages:Edit. Para manter os escopos separados, crie `secrets.CLOUDFLARE_CACHE_PURGE_TOKEN` — quando existe, tem precedência.

O purge é `purge_everything` da zona: purge por hostname/prefixo/tag é exclusivo do plano Enterprise. Como a zona só serve dois sites estáticos e os assets com hash são `immutable`, repopular o edge custa pouco.

## Terraform (`terraform/`)

Separate Terraform root module from the repo-root `infra/` (different provider — Cloudflare, not GCP — different state file, no shared resources). Same conventions as `infra/`: local state only (no `backend.tf`), `outputs.tf` entries document which GitHub variable/secret each value feeds. See `terraform/terraform.tfvars.example` for required variables — `CLOUDFLARE_API_TOKEN` is read from the environment, never from a `.tfvars` file.
