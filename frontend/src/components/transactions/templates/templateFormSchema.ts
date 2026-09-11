import { z } from "zod";
import {
  applySharedRefinements,
  splitSettingSchema,
} from "@/components/transactions/form/transactionFormSchema";

/**
 * Reduced transaction-field schema for templates (MNG-01). Field names are
 * identical to `TransactionFormValues` where they overlap so the copied
 * Controller blocks and `SplitSettingsFields` bind unchanged — but `amount`,
 * `date`, and all recurrence fields are OMITTED (templates never carry them)
 * and `name` is ADDED.
 *
 * Reuses `applySharedRefinements` from the transaction schema for the
 * transfer-destination / category-required / self-transfer checks, passing a
 * constant "recurrence disabled" shape since templates have no recurrence UI.
 */
export const templateFormSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório"),
    transaction_type: z.enum(["expense", "income", "transfer"]),
    description: z.string().min(1, "Descrição é obrigatória"),
    account_id: z.number("Selecione uma conta").int(),
    category_id: z.number().int().nullable(),
    destination_account_id: z.number().int().nullable(),
    tags: z.array(z.string()),
    split_settings: z.array(splitSettingSchema),
  })
  .superRefine((data, ctx) => {
    if (!data.account_id) {
      ctx.addIssue({ code: "custom", message: "Selecione uma conta", path: ["account_id"] });
    }
    applySharedRefinements(
      {
        category_id: data.category_id,
        transaction_type: data.transaction_type,
        account_id: data.account_id,
        destination_account_id: data.destination_account_id,
        recurrenceEnabled: false,
        recurrenceType: null,
        recurrenceCurrentInstallment: null,
        recurrenceTotalInstallments: null,
      },
      ctx,
    );
  });

export type TemplateFormValues = z.infer<typeof templateFormSchema>;
