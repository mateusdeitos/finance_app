import { useMutation } from "@tanstack/react-query";
import { parseImportCSV } from "@/api/transactions";
import { Transactions } from "@/types/transactions";

export function useParseImportCSV() {
  const mutation = useMutation({
    mutationFn: ({
      file,
      accountId,
      typeDefinitionRule,
    }: {
      file: File;
      accountId: number;
      typeDefinitionRule: Transactions.TypeDefinitionRule;
    }) => parseImportCSV(file, accountId, typeDefinitionRule),
  });
  return { mutation };
}
