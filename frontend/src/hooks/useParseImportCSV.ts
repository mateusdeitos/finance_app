import { useMutation } from "@tanstack/react-query";
import { parseImportCSV } from "@/api/transactions";
import { Transactions } from "@/types/transactions";

export function useParseImportCSV() {
  const mutation = useMutation({
    mutationFn: ({
      file,
      accountId,
      decimalSeparator,
    }: {
      file: File;
      accountId: number;
      decimalSeparator: Transactions.DecimalSeparatorValue;
    }) => parseImportCSV(file, accountId, decimalSeparator),
  });
  return { mutation };
}
