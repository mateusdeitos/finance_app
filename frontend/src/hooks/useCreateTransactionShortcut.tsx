import { useEffect, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { renderDrawer } from '@/utils/renderDrawer'
import { CreateTransactionDrawer } from '@/components/transactions/CreateTransactionDrawer'

/**
 * Opens the create-transaction drawer in response to the `?new=<type>` search
 * param used by the PWA app shortcuts (long-press the installed icon →
 * "Nova Despesa" / "Nova Receita" / "Nova Transferência").
 *
 * The param is stripped (replace, so it doesn't add a history entry) before the
 * drawer opens, so a page refresh or back-navigation doesn't reopen it. A ref
 * guards against the param's brief presence reopening the drawer between the
 * navigate call and the resulting re-render.
 */
export function useCreateTransactionShortcut() {
  const newType = useSearch({
    from: '/_authenticated/transactions',
    select: (s) => s.new,
  })
  const navigate = useNavigate({ from: '/transactions' })
  const handledRef = useRef(false)

  useEffect(() => {
    if (!newType || handledRef.current) return
    handledRef.current = true
    void navigate({ search: (prev) => ({ ...prev, new: undefined }), replace: true })
    void renderDrawer(() => <CreateTransactionDrawer initialType={newType} />)
  }, [newType, navigate])
}
