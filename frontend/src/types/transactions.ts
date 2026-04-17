export namespace Transactions {
  export type TransactionType = "expense" | "income" | "transfer";
  export type OperationType = "credit" | "debit";
  export type RecurrenceType = "monthly" | "weekly" | "daily" | "yearly";
  export type GroupBy = "date" | "category" | "account";

  export interface Tag {
    id: number;
    user_id: number;
    name: string;
    created_at?: string;
    updated_at?: string;
  }

  export interface UserConnection {
    id: number;
    from_user_id: number;
    from_account_id: number;
    from_default_split_percentage: number;
    to_user_id: number;
    to_account_id: number;
    to_default_split_percentage: number;
    connection_status: "pending" | "accepted" | "rejected";
    created_at?: string;
    updated_at?: string;
    from_user_avatar_url?: string;
    from_user_name?: string;
    to_user_avatar_url?: string;
    to_user_name?: string;
  }

  export interface Account {
    id: number;
    user_id: number;
    name: string;
    description?: string;
    initial_balance: number;
    is_active: boolean;
    avatar_background_color?: string;
    created_at?: string;
    updated_at?: string;
    user_connection?: UserConnection;
  }

  export interface Category {
    id: number;
    user_id: number;
    name: string;
    emoji?: string;
    parent_id?: number;
    parent?: Category;
    children?: Category[];
    created_at?: string;
    updated_at?: string;
  }

  export interface TransactionRecurrence {
    id: number;
    user_id: number;
    type: RecurrenceType;
    installments: number;
    created_at?: string;
    updated_at?: string;
  }

  export interface Settlement {
    id: number;
    user_id: number;
    amount: number;
    type: "credit" | "debit";
    account_id: number;
    source_transaction_id: number;
    parent_transaction_id: number;
    created_at?: string;
    updated_at?: string;
  }

  export interface Transaction {
    id: number;
    transaction_recurrence_id?: number;
    installment_number?: number;
    user_id: number;
    original_user_id?: number;
    type: TransactionType;
    account_id: number;
    category_id?: number;
    amount: number;
    operation_type: OperationType;
    date: string;
    description: string;
    tags?: Tag[];
    linked_transactions?: Transaction[];
    transaction_recurrence?: TransactionRecurrence;
    settlements_from_source?: Settlement[];
    /**
     * When set, this row is not a real transaction but a synthetic entry
     * produced by the listing endpoint to surface a settlement whose source
     * transaction lives on a different (non-filtered) account. The row is
     * read-only: it should not offer edit/delete, and its id is a negative
     * sentinel that does not correspond to any real transaction.
     */
    origin_settlement_id?: number;
    created_at?: string;
    updated_at?: string;
  }

  export interface TransactionGroup {
    key: string;
    label: string;
    transactions: Transaction[];
  }

  export interface FetchParams {
    month: number;
    year: number;
    accountIds?: number[];
    categoryIds?: number[];
    tagIds?: number[];
    types?: TransactionType[];
    query?: string;
  }

  export interface ActiveFilters {
    accountIds: number[];
    categoryIds: number[];
    tagIds: number[];
    types: TransactionType[];
  }

  export interface FetchBalanceParams {
    month: number;
    year: number;
    accumulated: boolean;
    accountIds?: number[];
    categoryIds?: number[];
    tagIds?: number[];
  }

  export interface BalanceResult {
    balance: number;
  }

  export interface TransactionSuggestion {
    id: number;
    description: string;
    type: TransactionType;
    amount: number;
    account_id: number;
    category_id?: number;
    tags?: Tag[];
  }

  export interface RecurrenceSettings {
    type: RecurrenceType;
    current_installment: number;
    total_installments: number;
  }

  export interface SplitSetting {
    connection_id: number;
    percentage?: number;
    amount?: number;
  }

  export interface CreateTransactionPayload {
    transaction_type: TransactionType;
    account_id?: number;
    category_id?: number;
    amount: number;
    date: string;
    description: string;
    destination_account_id?: number;
    tags?: { id?: number; name: string }[];
    recurrence_settings?: RecurrenceSettings;
    split_settings?: SplitSetting[];
  }

  type PropagationSettings = "current" | "current_and_future" | "all";

  export interface UpdateTransactionPayload {
    transaction_type?: TransactionType;
    account_id?: number;
    category_id?: number | null;
    amount?: number;
    date?: string;
    description?: string;
    destination_account_id?: number;
    tags?: { id?: number; name: string }[];
    recurrence_settings?: RecurrenceSettings;
    split_settings?: SplitSetting[];
    propagation_settings?: PropagationSettings;
  }

  // --- CSV Import ---

  export type ImportRowStatus = "pending" | "duplicate";
  export type ImportRowAction = "import" | "skip" | "duplicate";

  export interface ParsedImportRow {
    row_index: number;
    status: ImportRowStatus;
    date?: string; // ISO string (backend sends time.Time serialised)
    description: string;
    type: TransactionType;
    amount: number; // cents
    category_id?: number;
    category_inferred: boolean;
    destination_account_id?: number;
    recurrence_type?: RecurrenceType;
    recurrence_count?: number;
    parse_errors?: string[];
  }

  export type DecimalSeparatorValue = "comma" | "dot";
  export type TypeDefinitionRule = "positive_as_income" | "positive_as_expense";

  export interface ImportCSVResponse {
    rows: ParsedImportRow[];
    total_rows: number;
    duplicate_count: number;
    error_count: number;
  }

  export interface ImportRowState {
    row_index: number;
    action: ImportRowAction;
    date: string; // YYYY-MM-DD
    description: string;
    type: TransactionType;
    amount: number; // cents
    account_id: number;
    category_id: number | null;
    destination_account_id: number | null;
    recurrence_type: RecurrenceType | null;
    recurrence_count: number | null;
    split_settings: SplitSetting[] | null;
    parse_errors?: string[];
    import_status: "idle" | "loading" | "success" | "error";
    import_error?: string;
  }

  /** Maps backend error tags to user-facing Portuguese messages. */
  export const IMPORT_ERROR_MESSAGES: Record<string, string> = {
    "IMPORT.EMPTY_FILE": "O arquivo está vazio.",
    "IMPORT.INVALID_LAYOUT":
      "Layout inválido: verifique se o cabeçalho contém as colunas obrigatórias (Data, Descrição, Tipo, Valor).",
    "IMPORT.MAX_ROWS_EXCEEDED": "O arquivo não pode ter mais de 100 linhas de dados.",
    "IMPORT.NO_ROWS": "O arquivo não contém nenhuma linha de dados.",
  };
}
