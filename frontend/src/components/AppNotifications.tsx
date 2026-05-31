import { Notifications } from '@mantine/notifications'
import { useIsMobile } from '@/hooks/useIsMobile'

// Mantine's `position` is a single prop, not responsive. On phones, top-center
// keeps toasts under the notch and one-handed-readable; on desktop top-right
// stays out of the content's way. Safe-area offset and message contrast are
// handled globally in index.css.
export function AppNotifications() {
  const isMobile = useIsMobile()

  return (
    <Notifications
      position={isMobile ? 'top-center' : 'top-right'}
      autoClose={4000}
      limit={3}
    />
  )
}
