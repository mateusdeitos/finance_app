import { Transactions } from "@/types/transactions";
import classes from "./TransactionListHeader.module.css";

interface TransactionListHeaderProps {
  groupBy: Transactions.GroupBy;
}

/**
 * Desktop-only column header strip that sits above the first group. Uses the
 * same 5-column grid template as TransactionRow so the labels align with the
 * cells below. The Categoria / Conta columns are hidden via opacity (instead
 * of being removed) when grouping collapses them — keeps the grid template
 * stable across groupings.
 */
export function TransactionListHeader({ groupBy }: TransactionListHeaderProps) {
  return (
    <div className={classes.header}>
      <span />
      <span>Descrição</span>
      <span style={{ visibility: groupBy === "category" ? "hidden" : undefined }}>
        Categoria
      </span>
      <span style={{ visibility: groupBy === "account" ? "hidden" : undefined }}>
        Conta
      </span>
      <span style={{ textAlign: "right" }}>Valor</span>
    </div>
  );
}
