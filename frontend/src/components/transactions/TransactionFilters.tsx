import { AccountFilter } from './filters/AccountFilter'
import { AdvancedFilter } from './filters/AdvancedFilter'
import { CategoryFilter } from './filters/CategoryFilter'
import { GroupBySelector } from './filters/GroupBySelector'
import { TagFilter } from './filters/TagFilter'
import { TextSearch } from './filters/TextSearch'
import classes from './TransactionFilters.module.css'

interface TransactionFiltersProps {
  orientation?: 'row' | 'column'
  hideTextSearch?: boolean
}

export function TransactionFilters({ orientation = 'row', hideTextSearch }: TransactionFiltersProps) {
  const inline = orientation === 'column'
  return (
    <div className={inline ? classes.column : classes.row}>
      {!hideTextSearch && <TextSearch />}
      <TagFilter inline={inline} />
      <CategoryFilter inline={inline} />
      <AccountFilter inline={inline} />
      <AdvancedFilter inline={inline} />
      <GroupBySelector />
    </div>
  )
}
