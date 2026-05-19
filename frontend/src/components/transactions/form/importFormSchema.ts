import { z } from "zod";
import { baseTransactionFields, applySharedRefinements } from "./transactionFormSchema";
import { Transactions } from "@/types/transactions";

export const importRowFormSchema = z
  .object({
    ...baseTransactionFields,
    // Sobrescreve campos com validação diferente no contexto de importação
    date: z.string(), // ISO string, não objeto Date
    // Metadados da linha de importação
    row_index: z.number().int(),
    original_description: z.string(),
    status: z.enum(["pending"]),
    parse_errors: z.array(z.string()),
    action: z.enum(["import", "skip"]),
    import_status: z.enum(["idle", "loading", "success", "error"]),
    import_error: z.string(),
    // Transient: existing transactions flagged as possible duplicates of this
    // row. Recomputed on every date/amount/description edit; never persisted.
    duplicate_matches: z.array(z.custom<Transactions.Transaction>()),
  })
  .superRefine((data, ctx) => {
    // Validação só se aplica a linhas marcadas para importar
    if (data.action !== "import") return;

    applySharedRefinements(data, ctx);
  });

export const importFormSchema = z.object({
  accountId: z.number().int(),
  rows: z.array(importRowFormSchema),
  // Detection thresholds returned by the parse endpoint; surfaced in the
  // duplicate drawer so displayed values track the backend.
  duplicate_criteria: z
    .object({
      description_similarity_threshold: z.number(),
      amount_tolerance_cents: z.number().int(),
    })
    .nullable(),
});

export type ImportRowFormValues = z.infer<typeof importRowFormSchema>;
export type ImportFormValues = z.infer<typeof importFormSchema>;
