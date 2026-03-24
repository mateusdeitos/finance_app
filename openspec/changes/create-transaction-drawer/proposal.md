## Why

Users have no way to create transactions from the transactions list screen. Adding a dedicated "New Transaction" button and form drawer removes the need to navigate away from the list, keeping the user in context while managing finances.

## What Changes

- Add a "New Transaction" button in the period filter row (top right), visible on both desktop and mobile.
- The button opens a right-side drawer with a form containing all fields required to create a transaction.
- On successful submission, the transactions query is invalidated so the list refreshes automatically.
- The date, category, and account values from the last successful submission are persisted in `localStorage` and used to prefill the form the next time it opens.
- The description field behaves as an autocomplete: as the user types, it queries the backend for transactions with similar descriptions (using PostgreSQL text search). Selecting a suggestion populates all form fields except `date` and recurrence settings.
- The tags field supports searching existing tags by name (autocomplete) and creating new tags inline by typing a name that doesn't exist yet.

## Form Fields

| Field               | Condition                                |
| ------------------- | ---------------------------------------- |
| Type                | Always (`expense`, `income`, `transfer`) |
| Date                | Always                                   |
| Description         | Always (autocomplete)                    |
| Amount              | Always                                   |
| Category            | Always (except transfer)                 |
| Account             | Always                                   |
| Destination Account | Only when type = `transfer`              |
| Split Settings      | Only when type ≠ `transfer`              |
| Recurrence Settings | Always                                   |
| Tags                | Always (autocomplete + create inline)    |

## Capabilities

### New Capabilities

- `create-transaction-drawer`: Frontend capability — right-side drawer form for creating transactions, with autocomplete description, localStorage prefill, and post-submit query invalidation.

### Modified Capabilities

- Backend: new `GET /api/transactions/suggestions` endpoint returning distinct transactions matching a description query (using existing PostgreSQL text search), used by the autocomplete field.

## Impact

- Frontend: new drawer component, new API call for suggestions, localStorage persistence layer.
- Backend: one new handler method + route for the suggestions endpoint; reuses existing repository text search.
- No schema or migration changes required.
