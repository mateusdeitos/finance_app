/* eslint-disable preserve-caught-error */
/**
 * Composed fixtures for Playwright e2e tests. Built on top of the API primitives
 * in `./api.ts` — keeps per-spec `beforeAll` blocks readable.
 *
 * Convention: each fixture returns the minimum set of IDs/tokens needed by its
 * caller, and does NOT perform cleanup (global fixtures are torn down by the
 * docker-compose stack between CI runs).
 *
 * Extracted from `bulk-update-transfer.spec.ts:67-104` — see CONTEXT.md D-FIX-1.
 */

import { apiCreateUserConnection, apiFetchAs, getAuthTokenForUser } from "./api";

export interface PartnerConnectionResult {
  /** Auth token for the partner user (use with apiFetchAs). */
  partnerToken: string;
  /** ID of the established user_connection. */
  connectionId: number;
  /** ID of the primary user's account backing this connection. */
  connAccountId: number;
}

export interface SetupPartnerConnectionOptions {
  /** Partner user email. Defaults to a phase-specific address to avoid collisions. */
  email?: string;
  /** Connection status to leave the connection in. Defaults to 'accepted'. */
  status?: "accepted" | "pending";
  /** Split percentage recorded on the connection. Defaults to 50. */
  splitPercentage?: number;
}

const DEFAULT_PARTNER_EMAIL = "e2e-bulk-division-partner@financeapp.local";
const PRIMARY_USER_EMAIL = "e2e-test@financeapp.local";

/**
 * Ensures an accepted (or pending) user_connection exists between the primary
 * e2e user and the given partner. Idempotent across repeated CI runs: if a
 * connection already exists (ALREADY_EXISTS), the helper re-uses it.
 *
 * Steps:
 *   1. Get partner's auth token via test-login.
 *   2. Create a partner account (needed for the connection to have a backing
 *      account on the partner side). Names are unique per-run via Date.now().
 *   3. Fetch partner's /api/auth/me to get the partner user ID.
 *   4. Create a user connection from the primary user to the partner.
 *   5. If status === 'accepted', PATCH the connection to accepted.
 *   6. On ALREADY_EXISTS: find the first connection with the requested status
 *      and re-use its ID (idempotency for repeated CI runs).
 *   7. Find the primary user's account that backs this connection.
 *
 * Helper does NOT:
 *   - Create categories (spec beforeAll handles those)
 *   - Create transactions (per-test beforeEach handles those)
 *   - Return a cleanup function (partner user + connection are global fixtures
 *     seeded by docker-compose; torn down between CI runs)
 */
export async function setupPartnerConnection(
  opts: SetupPartnerConnectionOptions = {},
): Promise<PartnerConnectionResult> {
  const email = opts.email ?? DEFAULT_PARTNER_EMAIL;
  const status = opts.status ?? "accepted";
  const splitPercentage = opts.splitPercentage ?? 50;

  const partnerToken = await getAuthTokenForUser(email);

  // Ensure partner has at least one account — required for the connection to
  // materialize on the partner side. Names are unique per-run via Date.now().
  await apiFetchAs(partnerToken, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: `Partner Div ${Date.now()}`, initial_balance: 0 }),
  });

  const meRes = await apiFetchAs(partnerToken, "/api/auth/me");
  const partnerUser = (await meRes.json()) as { id: number };

  let connectionId: number;
  try {
    const conn = await apiCreateUserConnection(partnerUser.id, splitPercentage);
    connectionId = conn.id;
    if (status === "accepted") {
      await apiFetchAs(partnerToken, `/api/user-connections/${connectionId}/accepted`, {
        method: "PATCH",
      });
    }
  } catch (err) {
    // ALREADY_EXISTS is the happy path on second and subsequent CI runs.
    // The partner user is a global fixture seeded by docker-compose, so the
    // connection persists between runs until the stack is torn down.
    if (String(err).includes("ALREADY_EXISTS")) {
      const connRes = await apiFetchAs(partnerToken, "/api/user-connections");
      const connections = (await connRes.json()) as Array<{
        id: number;
        connection_status: string;
      }>;
      const existing = connections.find((c) => c.connection_status === status);
      if (!existing) {
        throw new Error(
          `setupPartnerConnection: connection exists but none have status '${status}'. ` +
            `Available statuses: ${connections.map((c) => c.connection_status).join(", ")}`,
        );
      }
      connectionId = existing.id;
    } else {
      throw err;
    }
  }

  // Find the primary user's account whose user_connection backs this connection.
  const primaryToken = await getAuthTokenForUser(PRIMARY_USER_EMAIL);
  const accountsRes = await apiFetchAs(primaryToken, "/api/accounts");
  const allAccounts = (await accountsRes.json()) as Array<{
    id: number;
    user_connection?: { id: number };
  }>;
  const connAccount = allAccounts.find((a) => a.user_connection?.id === connectionId);
  if (!connAccount) {
    throw new Error(
      `setupPartnerConnection: no connection account found for connection ${connectionId}. ` +
        `Check that the primary user has an account linked to this connection.`,
    );
  }

  return {
    partnerToken,
    connectionId,
    connAccountId: connAccount.id,
  };
}
