## 1. Project Scaffold

- [x] 1.1 Create `frontend/` directory at the repo root
- [x] 1.2 Create `frontend/package.json` with all required dependencies (react 19, vite, typescript, tanstack router, tanstack query, react-hook-form, mantine v7)
- [x] 1.3 Create `frontend/vite.config.ts` with `@vitejs/plugin-react` and `@tanstack/router-vite-plugin`
- [x] 1.4 Create `frontend/tsconfig.json` with strict mode and `@/` path alias for `src/`
- [x] 1.5 Create `frontend/index.html` as the Vite entry point

## 2. App Entry Point & Providers

- [x] 2.1 Create `frontend/src/main.tsx` that mounts the React app
- [x] 2.2 Wrap the app with `QueryClientProvider` (TanStack Query)
- [x] 2.3 Wrap the app with `MantineProvider`
- [x] 2.4 Create `frontend/src/App.tsx` that renders the `RouterProvider`

## 3. Routing

- [x] 3.1 Create `frontend/src/routes/__root.tsx` as the root route layout
- [x] 3.2 Create `frontend/src/routes/index.tsx` as the Hello World page at `/`
- [x] 3.3 Create `frontend/src/router.ts` that instantiates the router from the generated route tree
- [x] 3.4 Commit the auto-generated `frontend/src/routeTree.gen.ts`

## 4. Validation

- [x] 4.1 Run `npm install` inside `frontend/` and confirm no errors
- [x] 4.2 Run `npm run dev` and confirm the Hello World page renders at `/`
- [x] 4.3 Run `npm run build` and confirm the production build succeeds
