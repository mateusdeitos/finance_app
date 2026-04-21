import { Button, Drawer, Stack } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useState } from 'react'
import { useDrawerContext } from '@/utils/renderDrawer'
import { TransactionsTestIds } from '@/testIds'

export function SelectDateDrawer() {
  const { opened, close, reject } = useDrawerContext<Date>()
  const [date, setDate] = useState<Date | null>(new Date())

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="bottom"
      title="Alterar data"
      data-testid={TransactionsTestIds.DrawerSelectDate}
      styles={{
        content: {
          borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0',
          height: 'auto',
          maxHeight: '80dvh',
        },
        body: { paddingBottom: 'var(--mantine-spacing-xl)' },
      }}
    >
      <Stack gap="md">
        <DateInput
          value={date}
          onChange={setDate}
          label="Nova data"
          placeholder="Selecione uma data"
          valueFormat="DD/MM/YYYY"
          data-testid={TransactionsTestIds.InputBulkDate}
        />
        <Button
          onClick={() => date && close(date)}
          disabled={!date}
          style={{ alignSelf: 'flex-start' }}
          data-testid={TransactionsTestIds.BtnApplyDate}
        >
          Aplicar
        </Button>
      </Stack>
    </Drawer>
  )
}
