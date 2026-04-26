/**
 * Creates two fresh users with an accepted connection between them.
 * Each test gets isolated users to avoid cross-test interference.
 *
 * Returns auth tokens, user IDs, account IDs, and connection details
 * for both the primary user and their partner.
 */

import { getAuthTokenForUser, apiFetchAs } from "./api";

export interface UserAndPartnerResult {
  /** Auth token for the primary user */
  userToken: string;
  /** Primary user's ID */
  userId: number;
  /** Primary user's personal account ID */
  userAccountId: number;
  /** Primary user's shared account ID (from the connection) */
  userConnAccountId: number;

  /** Auth token for the partner user */
  partnerToken: string;
  /** Partner user's ID */
  partnerId: number;
  /** Partner user's personal account ID */
  partnerAccountId: number;
  /** Partner user's shared account ID (from the connection) */
  partnerConnAccountId: number;

  /** The connection ID between both users */
  connectionId: number;
}

export async function createUserAndPartner(
  prefix = "e2e-shared",
): Promise<UserAndPartnerResult> {
  const uid = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const userEmail = `${uid}-user@financeapp.local`;
  const partnerEmail = `${uid}-partner@financeapp.local`;

  // 1. Auth both users (test-login auto-creates them)
  const userToken = await getAuthTokenForUser(userEmail);
  const partnerToken = await getAuthTokenForUser(partnerEmail);

  // 2. Create personal accounts for both
  const userAccountRes = await apiFetchAs(userToken, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: `Conta ${uid}`, initial_balance: 0 }),
  });
  const userAccount = (await userAccountRes.json()) as { id: number };

  const partnerAccountRes = await apiFetchAs(partnerToken, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: `Partner ${uid}`, initial_balance: 0 }),
  });
  const partnerAccount = (await partnerAccountRes.json()) as { id: number };

  // 3. Get partner user ID
  const meRes = await apiFetchAs(partnerToken, "/api/auth/me");
  const partnerUser = (await meRes.json()) as { id: number };

  // 4. Get user ID
  const userMeRes = await apiFetchAs(userToken, "/api/auth/me");
  const user = (await userMeRes.json()) as { id: number };

  // 5. Create connection (user → partner) and accept
  const connRes = await apiFetchAs(userToken, "/api/user-connections", {
    method: "POST",
    body: JSON.stringify({
      to_user_id: partnerUser.id,
      from_default_split_percentage: 50,
    }),
  });
  const connection = (await connRes.json()) as { id: number };

  await apiFetchAs(partnerToken, `/api/user-connections/${connection.id}/accepted`, {
    method: "PATCH",
  });

  // 6. Find connection accounts for both sides
  const userAccountsRes = await apiFetchAs(userToken, "/api/accounts");
  const userAccounts = (await userAccountsRes.json()) as Array<{
    id: number;
    user_connection?: { id: number };
  }>;
  const userConnAccount = userAccounts.find((a) => a.user_connection?.id === connection.id);
  if (!userConnAccount) {
    throw new Error("Could not find user's connection account");
  }

  const partnerAccountsRes = await apiFetchAs(partnerToken, "/api/accounts");
  const partnerAccounts = (await partnerAccountsRes.json()) as Array<{
    id: number;
    user_connection?: { id: number };
  }>;
  const partnerConnAccount = partnerAccounts.find((a) => a.user_connection?.id === connection.id);
  if (!partnerConnAccount) {
    throw new Error("Could not find partner's connection account");
  }

  return {
    userToken,
    userId: user.id,
    userAccountId: userAccount.id,
    userConnAccountId: userConnAccount.id,
    partnerToken,
    partnerId: partnerUser.id,
    partnerAccountId: partnerAccount.id,
    partnerConnAccountId: partnerConnAccount.id,
    connectionId: connection.id,
  };
}
