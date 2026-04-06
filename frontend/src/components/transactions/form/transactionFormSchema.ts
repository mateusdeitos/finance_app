import { z } from "zod";

const splitSettingSchema = z.object({
  connection_id: z.number().int(),
  percentage: z.number().int().min(1).max(100).optional(),
  amount: z.number().int().optional(),
});

export const transactionFormSchema = z
  .object({
    transaction_type: z.enum(["expense", "income", "transfer"]),
    date: z.date({ error: "Data é obrigatória" }),
    description: z.string().min(1, "Descrição é obrigatória"),
    amount: z.number().int().min(1, "Valor deve ser maior que zero"),
    account_id: z.number().int().nullable(),
    category_id: z.number().int().nullable(),
    destination_account_id: z.number().int().nullable(),
    tags: z.array(z.string()),
    split_settings: z.array(splitSettingSchema),
    recurrenceEnabled: z.boolean(),
    recurrenceType: z.enum(["monthly", "weekly", "daily", "yearly"]),
    recurrenceEndDateMode: z.boolean(),
    recurrenceEndDate: z.string().nullable(),
    recurrenceRepetitions: z.number().int().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.account_id) {
      ctx.addIssue({ code: "custom", message: "Selecione uma conta", path: ["account_id"] });
    }

    if (data.transaction_type === "transfer" && !data.destination_account_id) {
      ctx.addIssue({
        code: "custom",
        message: "Selecione a conta de destino",
        path: ["destination_account_id"],
      });
    }

    if (data.recurrenceEnabled) {
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
  });

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
