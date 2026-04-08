import { z } from "zod";

export const splitSettingSchema = z.object({
  connection_id: z.number().int(),
  percentage: z.number().int().min(1).max(100).optional(),
  amount: z.number().int().optional(),
});

/**
 * Campos compartilhados entre o form de criação/edição e o schema de linha de importação.
 * Cada schema especializado pode sobrescrever campos com restrições diferentes via spread.
 *
 * Convenções de sobrescrita no import:
 * - `description`/`amount`: sem `.min()` — validação é condicional por `action` no superRefine
 * - `account_id`: non-nullable — sempre setado pelo selector antes do review
 * - `recurrenceType`: nullable — import admite linhas sem parcelamento
 * - `date`: `z.string()` — import armazena ISO string, não objeto Date
 */
export const baseTransactionFields = {
  transaction_type: z.enum(["expense", "income", "transfer"]),
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.number().int().min(1, "Valor deve ser maior que zero"),
  account_id: z.number("Selecione uma conta").int(),
  category_id: z.number().int().nullable(),
  destination_account_id: z.number().int().nullable(),
  split_settings: z.array(splitSettingSchema),
  recurrenceEnabled: z.boolean(),
  recurrenceType: z.enum(["monthly", "weekly", "daily", "yearly"]).nullable(),
  recurrenceEndDateMode: z.boolean(),
  recurrenceEndDate: z.string().nullable(),
  recurrenceRepetitions: z.number().int().nullable(),
} as const;

type SharedRefinementData = {
  category_id: number | null;
  transaction_type: string;
  destination_account_id: number | null;
  recurrenceEnabled: boolean;
  recurrenceType: string | null;
  recurrenceEndDateMode: boolean;
  recurrenceEndDate: string | null;
  recurrenceRepetitions: number | null;
};

/**
 * Regras de validação compartilhadas: conta destino para transferências e configurações de recorrência.
 * Chamada dentro do superRefine de cada schema especializado.
 */
export function applySharedRefinements(data: SharedRefinementData, ctx: z.RefinementCtx) {
  if (data.transaction_type === "transfer" && !data.destination_account_id) {
    ctx.addIssue({
      code: "custom",
      message: "Selecione a conta de destino",
      path: ["destination_account_id"],
    });
  }

  if (data.transaction_type !== "transfer" && !data.category_id) {
    ctx.addIssue({
      code: "custom",
      message: "Selecione uma categoria",
      path: ["category_id"],
    });
  }

  if (data.recurrenceEnabled) {
    if (!data.recurrenceType) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o tipo da recorrência",
        path: ["recurrenceType"],
      });
    }
    if (data.recurrenceEndDateMode) {
      if (!data.recurrenceEndDate) {
        ctx.addIssue({
          code: "custom",
          message: "Informe a data de término",
          path: ["recurrenceEndDate"],
        });
      }
    } else {
      if (!data.recurrenceRepetitions || data.recurrenceRepetitions < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Informe o número de repetições",
          path: ["recurrenceRepetitions"],
        });
      }
    }
  }
}

export const transactionFormSchema = z
  .object({
    ...baseTransactionFields,
    // Sobrescreve para non-nullable: o form sempre inicializa com "monthly"
    date: z.date({ error: "Data é obrigatória" }),
    tags: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (!data.account_id) {
      ctx.addIssue({ code: "custom", message: "Selecione uma conta", path: ["account_id"] });
    }
    applySharedRefinements(data, ctx);
  });

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
