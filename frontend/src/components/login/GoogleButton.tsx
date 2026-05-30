import { Button } from '@mantine/core'
import { LoginTestIds } from '@/testIds'
import { GoogleIcon } from './GoogleIcon'
import classes from './GoogleButton.module.css'

export function GoogleButton({
  loading,
  onClick,
}: {
  loading: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="default"
      fullWidth
      loading={loading}
      leftSection={<GoogleIcon />}
      onClick={onClick}
      className={classes.button}
      data-testid={LoginTestIds.GoogleButton}
    >
      {loading ? 'Entrando…' : 'Entrar com Google'}
    </Button>
  )
}
