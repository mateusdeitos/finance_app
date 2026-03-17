## Why

The project currently has no frontend. This change bootstraps the React/TypeScript frontend with all tooling configured so development can begin immediately.

## What Changes

- Add `frontend/` directory with a fully configured Vite + React 19 + TypeScript project
- Configure TanStack Router with a file-based route for a Hello World page
- Set up TanStack Query provider
- Install and configure Mantine as the component library
- Provide baseline `package.json`, `vite.config.ts`, `tsconfig.json`, and entry files

## Capabilities

### New Capabilities

- `frontend-bootstrap`: Project scaffold — package.json, vite config, tsconfig, entry point, and providers wired up
- `hello-world-route`: Initial `/` route rendering a Hello World page, proving routing and rendering work end to end

### Modified Capabilities

<!-- none -->

## Impact

- Creates the `frontend/` directory at the repo root
- No changes to the backend
- New npm dependencies: react, react-dom, vite, @vitejs/plugin-react, typescript, @tanstack/react-router, @tanstack/react-query, react-hook-form, @mantine/core, @mantine/hooks, @emotion/react
