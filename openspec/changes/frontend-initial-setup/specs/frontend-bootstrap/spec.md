## ADDED Requirements

### Requirement: Project scaffold exists and builds
The frontend project SHALL be located at `frontend/` in the repo root and SHALL produce a working build via `npm run build`.

#### Scenario: Dev server starts
- **WHEN** developer runs `npm run dev` inside `frontend/`
- **THEN** Vite starts a dev server and the app is accessible in the browser

#### Scenario: Production build succeeds
- **WHEN** developer runs `npm run build` inside `frontend/`
- **THEN** Vite outputs a production bundle to `frontend/dist/` without errors

### Requirement: TypeScript is configured
The project SHALL have a `tsconfig.json` with strict mode enabled and path aliases for `src/` (`@/`).

#### Scenario: Type errors are caught at build time
- **WHEN** a TypeScript type error exists in the source
- **THEN** `npm run build` fails with a descriptive error message

### Requirement: TanStack Query provider is mounted
The app SHALL wrap the component tree with `QueryClientProvider` so any component can use `useQuery` and `useMutation`.

#### Scenario: QueryClient is available
- **WHEN** a component calls `useQueryClient()`
- **THEN** it receives the shared `QueryClient` instance without error

### Requirement: Mantine provider is mounted
The app SHALL wrap the component tree with `MantineProvider` so all Mantine components render correctly with the default theme.

#### Scenario: Mantine component renders
- **WHEN** a page renders a Mantine `Button`
- **THEN** it displays with correct Mantine styles applied
