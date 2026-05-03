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
}

export function TransactionFilters({ orientation = 'row', hideTextSearch, scrollable }: TransactionFiltersProps) {
  const inline = orientation === 'column'
  const className = inline
    ? classes.column
    : `${classes.row}${scrollable ? ` ${classes.scrollable}` : ''}`
  return (
    <div className={className}>
      {!hideTextSearch && <TextSearch />}
      <TagFilter inline={inline} />
      <CategoryFilter inline={inline} />
      <AccountFilter inline={inline} />
      <AdvancedFilter inline={inline} />
      <GroupBySelector />
      <ClearFiltersButton />
    </div>
  )
}
