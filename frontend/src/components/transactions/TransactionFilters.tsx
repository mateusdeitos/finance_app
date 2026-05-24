import { AccountFilter } from './filters/AccountFilter'
import { AdvancedFilter } from './filters/AdvancedFilter'
import { CategoryFilter } from './filters/CategoryFilter'
import { ClearFiltersButton } from './ClearFiltersButton'
import { GroupBySelector } from './filters/GroupBySelector'
import { TagFilter } from './filters/TagFilter'
import { TextSearch } from './filters/TextSearch'
import classes from './TransactionFilters.module.css'

interface TransactionFiltersProps {
  orientation?: 'row' | 'column'
  hideTextSearch?: boolean
  scrollable?: boolean
  /** Hide the Contas chip — useful when accounts live in a persistent sidebar. */
  hideAccountFilter?: boolean
  /** Hide the Categorias chip — useful when categories live in a persistent sidebar. */
  hideCategoryFilter?: boolean
}

export function TransactionFilters({
  orientation = 'row',
  hideTextSearch,
  scrollable,
  hideAccountFilter,
  hideCategoryFilter,
}: TransactionFiltersProps) {
  const inline = orientation === 'column'
  const className = inline
    ? classes.column
    : `${classes.row}${scrollable ? ` ${classes.scrollable}` : ''}`
  return (
    <div className={className}>
      {!hideTextSearch && <TextSearch />}
      <TagFilter inline={inline} />
      {!hideCategoryFilter && <CategoryFilter inline={inline} />}
      {!hideAccountFilter && <AccountFilter inline={inline} />}
      <AdvancedFilter inline={inline} />
      <GroupBySelector />
      <ClearFiltersButton />
    </div>
  )
}
