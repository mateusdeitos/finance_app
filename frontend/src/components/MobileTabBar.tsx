import { Badge, Indicator, UnstyledButton } from '@mantine/core'
import {
  IconReceipt2,
  IconWallet,
  IconTree,
  IconCreditCard,
  IconDots,
  type Icon as TablerIcon,
} from '@tabler/icons-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { useChargesPendingCount } from '@/hooks/useChargesPendingCount'
import { useNotificationUnreadCount } from '@/hooks/useNotificationUnreadCount'
import { renderDrawer } from '@/utils/renderDrawer'
import { MobileMoreDrawer } from '@/components/MobileMoreDrawer'
import { tapHaptic } from '@/utils/haptics'
import { CommonTestIds, MobileNavTestIds, NotificationsTestIds } from '@/testIds'
import classes from './MobileTabBar.module.css'

type Tab = {
  to: string
  label: string
  icon: TablerIcon
}

const tabs: Tab[] = [
  { to: '/transactions', label: 'Transações', icon: IconReceipt2 },
  { to: '/accounts', label: 'Contas', icon: IconWallet },
  { to: '/categories', label: 'Categorias', icon: IconTree },
  { to: '/charges', label: 'Cobranças', icon: IconCreditCard },
]

export function MobileTabBar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { query: pendingQuery } = useChargesPendingCount()
  const pendingCount = pendingQuery.data?.count ?? 0

  const { query: unreadQuery } = useNotificationUnreadCount((d) => d.count)
  const unreadCount = unreadQuery.data ?? 0

  const [moreOpen, setMoreOpen] = useState(false)

  function openMore() {
    tapHaptic()
    setMoreOpen(true)
    void renderDrawer(() => <MobileMoreDrawer />).finally(() => setMoreOpen(false))
  }

  return (
    <nav className={classes.bar} data-testid={MobileNavTestIds.TabBar} aria-label="Navegação principal">
      {tabs.map(({ to, label, icon: Icon }) => {
        const active = currentPath === to || currentPath.startsWith(`${to}/`)
        const showBadge = to === '/charges' && pendingCount > 0
        return (
          <Link
            key={to}
            to={to}
            className={classes.tab}
            data-active={active ? '' : undefined}
            data-testid={MobileNavTestIds.Tab(to.slice(1))}
            onClick={() => { if (!active) tapHaptic() }}
          >
            <span className={classes.iconWrap}>
              <Icon size={20} stroke={1.8} />
              {showBadge && (
                <Badge
                  size="xs"
                  circle
                  color="red"
                  className={classes.badge}
                  data-testid={CommonTestIds.NavBadge(to.slice(1))}
                >
                  {pendingCount}
                </Badge>
              )}
            </span>
            <span className={classes.label}>{label}</span>
          </Link>
        )
      })}
      <UnstyledButton
        className={classes.tab}
        onClick={openMore}
        data-active={moreOpen ? '' : undefined}
        data-testid={MobileNavTestIds.MoreTab}
        aria-label={unreadCount > 0 ? `Mais — ${unreadCount} notificações não lidas` : 'Mais'}
      >
        <Indicator
          disabled={unreadCount === 0}
          color="blue"
          size={8}
          position="top-end"
          offset={4}
          data-testid={NotificationsTestIds.MaisTabIndicator}
          aria-hidden
        >
          <span className={classes.iconWrap}>
            <IconDots size={20} stroke={1.8} />
          </span>
        </Indicator>
        <span className={classes.label}>Mais</span>
      </UnstyledButton>
    </nav>
  )
}
