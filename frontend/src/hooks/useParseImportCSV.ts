import { useMutation } from "@tanstack/react-query";
import { parseImportCSV } from "@/api/transactions";
import { Transactions } from "@/types/transactions";

export function useParseImportCSV() {
  const mutation = useMutation({
    mutationFn: ({
      file,
      accountId,
      decimalSeparator,
      typeDefinitionRule,
    }: {
      file: File;
      accountId: number;
      decimalSeparator: Transactions.DecimalSeparatorValue;
      typeDefinitionRule: Transactions.TypeDefinitionRule;
    }) => parseImportCSV(file, accountId, decimalSeparator, typeDefinitionRule),
  });
  return { mutation };
}
