import { CSSProperties } from 'react'
import { ActionIcon, Loader, TextInput, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconPlus, IconTrash } from '@tabler/icons-react'
import { Transactions } from '@/types/transactions'
import { CategorySpendingNode } from '@/hooks/useCategorySpending'
import { useInlineRename } from '@/hooks/useInlineRename'
import { formatBalance } from '@/utils/formatCents'
import { tintColor } from '@/utils/categoryColors'
import { CategoriesTestIds } from '@/testIds'
import { CategoryTile } from './CategoryTile'
import { ShareBar } from './ShareBar'
import { InlineNewCategory } from './InlineNewCategory'
import classes from './CategorySpendingCard.module.css'

interface Handlers {
  onDelete: (category: Transactions.Category) => void
  onSaveName: (category: Transactions.Category, name: string) => Promise<void>
  onEditEmoji: (category: Transactions.Category) => void
}

interface Props extends Handlers {
  node: CategorySpendingNode
  grandTotal: number
  maxTotal: number
  defaultExpanded?: boolean
  pendingParentId: number | null
  onAddChild: (parent: Transactions.Category) => void
  onCancelCreate: () => void
  onCreateChild: (name: string, parentId: number) => Promise<void>
}

function stop(e: React.MouseEvent) {
  e.stopPropagation()
}

export function CategorySpendingCard({
  node,
  grandTotal,
  maxTotal,
  defaultExpanded = true,
  pendingParentId,
  onAddChild,
  onCancelCreate,
  onCreateChild,
  onDelete,
  onSaveName,
  onEditEmoji,
}: Props) {
  const { category, color, total, count, children } = node
  const [expanded, { toggle, open: forceExpand }] = useDisclosure(defaultExpanded)
  const rename = useInlineRename(category.name, (name) => onSaveName(category, name))

  const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0
  const barPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0
  const childMax = children.reduce((m, c) => Math.max(m, c.total), 0)
  const isPendingChild = pendingParentId === category.id

  function handleAddChild(e: React.MouseEvent) {
    stop(e)
    forceExpand()
    onAddChild(category)
  }

  return (
    <div
      className={classes.card}
      style={{ '--cat-color': color } as CSSProperties}
      data-testid={CategoriesTestIds.Card(category.id)}
    >
      <div
        className={classes.header}
        onClick={toggle}
        data-category-name={category.name}
        data-testid={CategoriesTestIds.BtnToggle(category.id)}
      >
        <div className={classes.titleRow}>
          <span onClick={stop}>
            <CategoryTile
              color={color}
              emoji={category.emoji}
              size={42}
              onClick={() => onEditEmoji(category)}
              title="Mudar emoji"
              testId={CategoriesTestIds.BtnEmoji(category.id)}
            />
          </span>

          <div className={classes.nameBlock}>
            {rename.editing ? (
              <span onClick={stop}>
                <TextInput
                  ref={rename.inputRef}
                  value={rename.value}
                  onChange={(e) => rename.setValue(e.currentTarget.value)}
                  onBlur={rename.commit}
                  onKeyDown={rename.handleKeyDown}
                  size="sm"
                  error={rename.error}
                  rightSection={rename.saving ? <Loader size={14} /> : null}
                  data-testid={CategoriesTestIds.InputName}
                />
              </span>
            ) : (
              <UnstyledButton
                onClick={(e) => {
                  stop(e)
                  rename.start()
                }}
                data-testid={CategoriesTestIds.BtnName}
              >
                <span className={classes.name}>{category.name}</span>
              </UnstyledButton>
            )}
            <div className={classes.count}>{count} {count === 1 ? 'lançamento' : 'lançamentos'}</div>
          </div>

          {grandTotal > 0 && <span className={classes.pct}>{pct}%</span>}

          <div className={classes.actions} onClick={stop}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={handleAddChild}
              title="Adicionar subcategoria"
              data-testid={CategoriesTestIds.BtnAddSubcategory}
            >
              <IconPlus size={17} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              size="md"
              onClick={() => onDelete(category)}
              title="Excluir categoria"
              data-testid={CategoriesTestIds.BtnDelete}
            >
              <IconTrash size={17} />
            </ActionIcon>
          </div>

          <span className={`${classes.chevron} ${expanded ? classes.chevronOpen : ''}`}>
            <IconChevronDown size={16} />
          </span>
        </div>

        <div>
          <div className={classes.value} data-testid={CategoriesTestIds.CardTotal(category.id)}>
            {formatBalance(total)}
          </div>
          <div className={classes.valueBar}>
            <ShareBar color={color} pct={barPct} height={7} />
          </div>
        </div>
      </div>

      {expanded && (children.length > 0 || isPendingChild) && (
        <div className={classes.children}>
          <div className={classes.rail}>
            <div className={classes.railLine} />
            <div className={classes.childList}>
              {children.map((child) => (
                <CategoryChildRow
                  key={child.category.id}
                  node={child}
                  color={color}
                  childMax={childMax}
                  onDelete={onDelete}
                  onSaveName={onSaveName}
                  onEditEmoji={onEditEmoji}
                />
              ))}
              {isPendingChild && (
                <InlineNewCategory
                  depth={1}
                  onSave={(name) => onCreateChild(name, category.id)}
                  onCancel={onCancelCreate}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ChildProps extends Handlers {
  node: CategorySpendingNode
  color: string
  childMax: number
}

function CategoryChildRow({ node, color, childMax, onDelete, onSaveName, onEditEmoji }: ChildProps) {
  const { category, total, count } = node
  const rename = useInlineRename(category.name, (name) => onSaveName(category, name))
  const barPct = childMax > 0 ? (total / childMax) * 100 : 0

  return (
    <div className={classes.childRow} data-category-name={category.name}>
      <div className={classes.elbow} />
      <CategoryTile
        color={color}
        emoji={category.emoji}
        size={30}
        radius={9}
        onClick={() => onEditEmoji(category)}
        title="Mudar emoji"
        testId={CategoriesTestIds.BtnEmoji(category.id)}
      />
      <div className={classes.childMain}>
        <div className={classes.childTopLine}>
          {rename.editing ? (
            <TextInput
              ref={rename.inputRef}
              value={rename.value}
              onChange={(e) => rename.setValue(e.currentTarget.value)}
              onBlur={rename.commit}
              onKeyDown={rename.handleKeyDown}
              size="xs"
              error={rename.error}
              rightSection={rename.saving ? <Loader size={12} /> : null}
              data-testid={CategoriesTestIds.InputName}
            />
          ) : (
            <UnstyledButton onClick={rename.start} data-testid={CategoriesTestIds.BtnName}>
              <span className={classes.childName}>{category.name}</span>
            </UnstyledButton>
          )}
          <span className={classes.childValue}>{formatBalance(total)}</span>
        </div>
        <div className={classes.childBarLine}>
          <div className={classes.childBar}>
            <ShareBar color={tintColor(color, 0.72)} pct={barPct} height={5} />
          </div>
          <span className={classes.childCount}>{count} lanç.</span>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => onDelete(category)}
            title="Excluir subcategoria"
            data-testid={CategoriesTestIds.BtnDelete}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </div>
      </div>
    </div>
  )
}
