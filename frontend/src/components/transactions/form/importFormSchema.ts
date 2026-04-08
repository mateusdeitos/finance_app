import { z } from "zod";
import { baseTransactionFields, applySharedRefinements } from "./transactionFormSchema";

export const importRowFormSchema = z
  .object({
    ...baseTransactionFields,
    // Sobrescreve campos com validação diferente no contexto de importação
    date: z.string(), // ISO string, não objeto Date
    // Metadados da linha de importação
    row_index: z.number().int(),
    original_description: z.string(),
    status: z.enum(["pending", "duplicate"]),
    parse_errors: z.array(z.string()),
    action: z.enum(["import", "skip", "duplicate"]),
    import_status: z.enum(["idle", "loading", "success", "error"]),
    import_error: z.string(),
  })
  .superRefine((data, ctx) => {
    // Validação só se aplica a linhas marcadas para importar
    if (data.action !== "import") return;

    applySharedRefinements(data, ctx);
  });

export const importFormSchema = z.object({
  accountId: z.number().int(),
  rows: z.array(importRowFormSchema),
});

export type ImportRowFormValues = z.infer<typeof importRowFormSchema>;
export type ImportFormValues = z.infer<typeof importFormSchema>;
