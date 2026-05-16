import { ActionIcon, useMantineColorScheme, type MantineColorScheme } from '@mantine/core'
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { CommonTestIds } from '@/testIds'

const order: MantineColorScheme[] = ['light', 'dark', 'auto']

const config: Record<MantineColorScheme, { icon: typeof IconSun; label: string }> = {
  light: { icon: IconSun, label: 'Tema: claro' },
  dark: { icon: IconMoon, label: 'Tema: escuro' },
  auto: { icon: IconDeviceDesktop, label: 'Tema: automático' },
}

export function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const { icon: Icon, label } = config[colorScheme]

  const cycle = () => {
    const next = order[(order.indexOf(colorScheme) + 1) % order.length]
    setColorScheme(next)
  }

  return (
    <ActionIcon
      variant="default"
      size="lg"
      onClick={cycle}
      aria-label={label}
      title={label}
      data-testid={CommonTestIds.ThemeToggle}
      data-color-scheme={colorScheme}
    >
      <Icon size={18} />
    </ActionIcon>
  )
}
