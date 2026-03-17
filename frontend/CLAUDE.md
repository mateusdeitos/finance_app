# CLAUDE.md — Frontend

This file provides guidance to Claude Code (claude.ai/code) when working with the frontend.

## Project Overview

React/TypeScript frontend for a couples' finance management app.

## Stack

- **Bundler**: Vite
- **Framework**: React 19
- **Language**: TypeScript
- **Routing**: TanStack Router
- **Data fetching**: TanStack Query
- **Forms**: React Hook Form
- **Component library**: Mantine
- **Styling**: CSS Modules (alongside Mantine)

## Commands

```bash
npm run dev       # start dev server
npm run build     # production build
npm run preview   # preview production build
```

## Project Structure

```
src/
  api/           # API client functions (raw fetch/axios calls, no hooks here)
  hooks/         # Custom hooks (data fetching, mutations)
  components/    # Shared/reusable UI components
  pages/         # Route-level page components
  types/         # TypeScript namespaces and types
  utils/         # Pure utility functions
```

## TypeScript Types

All domain types must be defined inside **namespaces**:

```ts
// src/types/transactions.ts
export namespace Transactions {
  export type Transaction = {
    id: number
    amount: number
    // ...
  }
}
```

## Data Fetching Pattern

Every query must be wrapped in a custom hook that returns `{ query, invalidate }`:

```ts
export function useTransactions() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['transactions'], queryFn: fetchTransactions })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['transactions'] })
  return { query, invalidate }
}
```

Every mutation must be wrapped in a custom hook that returns only `{ mutation }`. Invalidation is the query hook's responsibility, not the mutation's:

```ts
export function useCreateTransaction() {
  const mutation = useMutation({ mutationFn: createTransaction })
  return { mutation }
}
```

## Authentication / Route Protection

Use TanStack Router's `beforeLoad` on protected routes to check authentication (by calling the "get current user" endpoint). This is preferred over a standalone `PrivateRoute` component. If the user is not authenticated, redirect to the login page.

## Mobile First

The app targets mobile devices as the primary experience. Always design and implement UI with mobile in mind first, then adapt for larger screens if needed.

- Use relative units (`rem`, `%`, `vh`/`vw`) over fixed pixel values
- Touch targets must be large enough for easy tapping
- Avoid hover-only interactions — all functionality must be accessible via touch
- Test layouts at mobile viewport sizes before desktop

## Component Guidelines

- Components must be **small and focused** — single responsibility
- Avoid large monolithic components; split into smaller pieces
- Use **Mantine** for all UI components
- Apply custom styles with **CSS Modules** (`.module.css` files colocated with the component)
