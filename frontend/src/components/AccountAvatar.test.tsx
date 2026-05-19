import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueryKeys } from "@/utils/queryKeys";
import { Transactions } from "@/types/transactions";
import { CommonTestIds, TransactionsTestIds } from "@/testIds";
import { TransactionRow } from "./transactions/TransactionRow";

const NO_AVATAR = null;
const FROM_USER_AVATAR = "https://example.com/from-user.png";
const TO_USER_AVATAR = "https://example.com/to-user.png";

const VIEWER_ID = 1; // connection from-user
const PARTNER_ID = 2; // connection to-user

const privateAccount: Transactions.Account = {
  id: 23,
  user_id: VIEWER_ID,
  name: "Nubank",
  initial_balance: 0,
  is_active: true,
};

const sharedAccount: Transactions.Account = {
  id: 28,
  user_id: VIEWER_ID,
  name: "Amanda",
  initial_balance: 0,
  is_active: true,
  user_connection: {
    id: 3,
    from_user_id: VIEWER_ID,
    from_account_id: 28,
    from_default_split_percentage: 50,
    to_user_id: PARTNER_ID,
    to_account_id: 29,
    to_default_split_percentage: 50,
    connection_status: "accepted",
    from_user_avatar_url: FROM_USER_AVATAR,
    from_user_name: "Mateus",
    to_user_avatar_url: TO_USER_AVATAR,
    to_user_name: "Amanda",
  },
};

// A transfer between privateAccount and sharedAccount, seen by the from-user.
// `operationType` picks the side the visible row sits on: "credit" → money
// lands in `account_id` (shared is the destination), "debit" → leaves it.
function transfer(accountId: number, operationType: Transactions.OperationType): Transactions.Transaction {
  const linkedId = accountId === privateAccount.id ? sharedAccount.id : privateAccount.id;
  const linkedOp: Transactions.OperationType = operationType === "credit" ? "debit" : "credit";
  return {
    id: 1113,
    user_id: VIEWER_ID,
    original_user_id: VIEWER_ID,
    type: "transfer",
    account_id: accountId,
    amount: 44790,
    operation_type: operationType,
    date: "2026-04-08T00:00:00Z",
    description: "Kiwify",
    linked_transactions: [
      {
        id: 1112,
        user_id: VIEWER_ID,
        original_user_id: VIEWER_ID,
        type: "transfer",
        account_id: linkedId,
        amount: 44790,
        operation_type: linkedOp,
        date: "2026-04-08T00:00:00Z",
        description: "Kiwify",
      },
    ],
  };
}

// Renders a transfer row and returns the `src` of each avatar in the
// source → destination group (null when an avatar falls back to initials).
function transferAvatarSrcs(tx: Transactions.Transaction): (string | null)[] {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData([QueryKeys.Me], { id: VIEWER_ID, name: "Viewer", email: "v@e.com" });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <TransactionRow
          transaction={tx}
          groupBy="date"
          accounts={[privateAccount, sharedAccount]}
          categories={[]}
          currentUserId={VIEWER_ID}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  const group = container.querySelector(`[data-testid="${TransactionsTestIds.TransferAvatarGroup}"]`);
  return [...(group?.querySelectorAll(`[data-testid="${CommonTestIds.AvatarAccount}"]`) ?? [])].map(
    (a) => a.querySelector("img")?.getAttribute("src") ?? null,
  );
}

// Regression: the avatar of a shared account in a transfer row must show the
// *partner* (the other connection user), whether the shared account is the
// transfer source or destination. A previous `direction="to"` prop reversed
// the lookup, so a shared destination account wrongly showed the viewer.
describe("TransactionRow — transfer avatar for a shared account", () => {
  test("shared account as destination shows the partner avatar", () => {
    expect(transferAvatarSrcs(transfer(sharedAccount.id, "credit"))).toEqual([NO_AVATAR, TO_USER_AVATAR]);
  });

  test("shared account as source shows the partner avatar", () => {
    expect(transferAvatarSrcs(transfer(sharedAccount.id, "debit"))).toEqual([TO_USER_AVATAR, NO_AVATAR]);
  });
});
