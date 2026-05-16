import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Code,
  FileInput,
  Flex,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowLeft, IconFileTypeCsv, IconPlus } from '@tabler/icons-react'
import { AccountDrawer } from '@/components/accounts/AccountDrawer'
import { useAccounts } from '@/hooks/useAccounts'
import { useGroupedAccountOptions } from '@/hooks/useGroupedAccountOptions'
import { useParseImportCSV } from '@/hooks/useParseImportCSV'
import { Transactions } from '@/types/transactions'
import { parseApiError } from '@/utils/apiErrors'
import { renderDrawer } from '@/utils/renderDrawer'
import { CSV_COLUMNS } from './importPayload'
import { ImportTestIds, type ImportTypeRule } from '@/testIds'

const EMPTY_ACCOUNTS: Transactions.Account[] = []

type Props = {
  onParsed: (rows: Transactions.ParsedImportRow[], accountId: number) => void
  onBack: () => void
}

export function UploadStep({ onParsed, onBack }: Props) {
  const [typeDefinitionRule, setTypeDefinitionRule] = useState<Transactions.TypeDefinitionRule>('positive_as_income')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { query: accountsQuery } = useAccounts((accounts) =>
    accounts.filter(
      (a) => a.is_active && (!a.user_connection || a.user_connection.connection_status === 'accepted'),
    ),
  )
  const accountOptions = useGroupedAccountOptions(accountsQuery.data ?? EMPTY_ACCOUNTS)

  const { mutation } = useParseImportCSV()

  function handleSubmit() {
    setErrorMessage(null)
    if (!file) {
      setErrorMessage('Selecione um arquivo CSV ou Excel (.xlsx).')
      return
    }
    if (!accountId) {
      setErrorMessage('Selecione uma conta.')
      return
    }

    mutation.mutate(
      { file, accountId, typeDefinitionRule },
      {
        onSuccess: (result) => onParsed(result.rows, accountId),
        onError: async (err: unknown) => {
          if (err instanceof Response) {
            const apiError = await parseApiError(err)
            const tag = apiError.tags[0] as string | undefined
            setErrorMessage(
              (tag ? Transactions.IMPORT_ERROR_MESSAGES[tag] : undefined) ??
                apiError.message ??
                'Erro ao processar o arquivo.',
            )
          } else {
            setErrorMessage('Erro ao processar o arquivo.')
          }
        },
      },
    )
  }

  return (
    <Stack gap="md" maw={{ lg: 1280 }} data-testid={ImportTestIds.UploadStep}>
      <Group gap="xs">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={onBack} size="sm">
          Voltar
        </Button>
        <Title order={4}>Importar Transações</Title>
      </Group>

      <Flex direction="row" gap="xs" align="flex-end">
        <Select
          label="Conta"
          placeholder="Selecione uma conta"
          required
          data={accountOptions}
          value={accountId ? String(accountId) : null}
          onChange={(val) => setAccountId(val ? Number(val) : null)}
          renderOption={({ option }) => (
            <span data-testid={ImportTestIds.OptionAccount(option.value)}>{option.label}</span>
          )}
          data-testid={ImportTestIds.SelectAccount}
        />
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={() => {
            renderDrawer<Transactions.Account | void>(() => <AccountDrawer />)
              .then((created) => {
                if (created) setAccountId(created.id)
              })
              .catch(() => {})
          }}
          aria-label="Criar conta"
          data-testid={ImportTestIds.BtnCreateAccountHeader}
          mb={2}
        >
          <IconPlus size={16} />
        </ActionIcon>

        <Select
          label="Considerar valores positivos como:"
          required
          data={[
            { label: 'Receitas', value: 'positive_as_income' },
            { label: 'Despesas', value: 'positive_as_expense' },
          ]}
          value={typeDefinitionRule}
          onChange={(val) =>
            setTypeDefinitionRule((val as Transactions.TypeDefinitionRule | null) ?? 'positive_as_income')
          }
          renderOption={({ option }) => (
            <span data-testid={ImportTestIds.OptionTypeRule(option.value as ImportTypeRule)}>
              {option.label}
            </span>
          )}
          data-testid={ImportTestIds.SelectTypeRule}
        />
      </Flex>

      <FileInput
        label="Arquivo CSV ou Excel (.xlsx, .xls)"
        placeholder="Clique para selecionar"
        required
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
        leftSection={<IconFileTypeCsv size={16} />}
        value={file}
        onChange={setFile}
        fileInputProps={{ 'data-testid': ImportTestIds.InputCsvFile } as React.InputHTMLAttributes<HTMLInputElement>}
      />

      {errorMessage && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Erro">
          {errorMessage}
        </Alert>
      )}

      <Button
        onClick={handleSubmit}
        loading={mutation.isPending}
        leftSection={mutation.isPending ? <Loader size="xs" /> : undefined}
        disabled={!file || !accountId}
        data-testid={ImportTestIds.BtnProcessCSV}
      >
        Processar arquivo
      </Button>

      <Box mt="md">
        <Title order={6} mb="xs">
          Modelo de cabeçalho válido
        </Title>
        <Code block mb="xs">
          {CSV_COLUMNS.map((c) => c.col).join(';')}
        </Code>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Coluna</Table.Th>
              <Table.Th>Obrigatório</Table.Th>
              <Table.Th>Descrição</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {CSV_COLUMNS.map((col) => (
              <Table.Tr key={col.col}>
                <Table.Td>
                  <Text fw={500} fz="xs">
                    {col.col}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text c={col.required ? 'red' : 'dimmed'} fz="xs">
                    {col.required ? 'Sim' : 'Não'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fz="xs" c="dimmed">
                    {col.description}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Stack>
  )
}
