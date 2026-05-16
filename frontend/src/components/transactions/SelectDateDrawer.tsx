import { Button, Drawer, Stack } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useState } from 'react'
import { useDrawerContext } from '@/utils/renderDrawer'
import { TransactionsTestIds } from '@/testIds'
import { localDateStr } from '@/utils/parseDate'

interface SelectDateDrawerProps {
  /** Initial value (YYYY-MM-DD) rendered in the picker. Defaults to today. */
  initialDate?: string
  /** Title shown in the drawer header. */
  title?: string
}

export function SelectDateDrawer({ initialDate, title = 'Alterar data' }: SelectDateDrawerProps = {}) {
  const { opened, close, reject } = useDrawerContext<string>()
  const [date, setDate] = useState<string | null>(initialDate ?? localDateStr(new Date()))

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="bottom"
      title={title}
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
