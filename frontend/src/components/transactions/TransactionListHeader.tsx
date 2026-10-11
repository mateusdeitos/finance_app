import classes from "./TransactionListHeader.module.css";

/**
 * Desktop-only column header strip that sits above the first group.
 *
 * Layout 1b folds category and account into each row's metadata line, so the
 * strip is down to the two columns that still line up with a cell below:
 * the description and the value.
 */
export function TransactionListHeader() {
  return (
    <div className={classes.header}>
      <span />
      <span className={classes.labels}>
        <span>Descrição</span>
        <span className={classes.amountLabel}>Valor</span>
      </span>
    </div>
  );
}
