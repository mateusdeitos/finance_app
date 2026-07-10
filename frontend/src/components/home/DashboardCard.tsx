import { Card, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

interface Props {
  title: string
  /** Optional control rendered on the right of the header (e.g. a toggle). */
  action?: ReactNode
  children: ReactNode
  testId?: string
}

/** Consistent section container for the home dashboard cards. */
export function DashboardCard({ title, action, children, testId }: Props) {
  return (
    <Card withBorder radius="md" p="md" data-testid={testId}>
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
          <Text fw={700}>{title}</Text>
          {action}
        </Group>
        {children}
      </Stack>
    </Card>
  )
}
