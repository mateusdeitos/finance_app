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
import { useParseImportCSV } from '@/hooks/useParseImportCSV'
import { Transactions } from '@/types/transactions'
import { parseApiError } from '@/utils/apiErrors'
import { renderDrawer } from '@/utils/renderDrawer'
import { CSV_COLUMNS } from './importPayload'
import { ImportTestIds } from '@/testIds'

type Props = {
  onParsed: (rows: Transactions.ParsedImportRow[], accountId: number) => void
  onBack: () => void
}

export function UploadStep({ onParsed, onBack }: Props) {
  const [decimalSeparator, setDecimalSeparator] = useState<Transactions.DecimalSeparatorValue>('comma')
  const [typeDefinitionRule, setTypeDefinitionRule] = useState<Transactions.TypeDefinitionRule>('positive_as_income')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { query: ownAccountsQuery } = useAccounts((accounts) =>
    accounts
      .filter((a) => !a.user_connection && a.is_active)
      .map((a) => ({ value: String(a.id), label: a.name })),
  )
  const ownAccountOptions = ownAccountsQuery.data ?? []

  const { mutation } = useParseImportCSV()

  function handleSubmit() {
    setErrorMessage(null)
    if (!file) {
      setErrorMessage('Selecione um arquivo CSV.')
      return
    }
    if (!accountId) {
      setErrorMessage('Selecione uma conta.')
      return
    }

    mutation.mutate(
      { file, accountId, decimalSeparator, typeDefinitionRule },
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
          data={ownAccountOptions}
          value={accountId ? String(accountId) : null}
          onChange={(val) => setAccountId(val ? Number(val) : null)}
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
          label="Formato da coluna 'Valor'"
          required
          data={[
            { label: '1.234,56', value: 'comma' },
            { label: '1,243.56', value: 'dot' },
          ]}
          value={decimalSeparator}
          onChange={(val) => setDecimalSeparator((val as Transactions.DecimalSeparatorValue | null) ?? 'comma')}
          data-testid={ImportTestIds.SelectDecimalSeparator}
        />
        <Select
          label="Regra de definição do tipo"
          required
          data={[
            { label: "Valor positivo considerado 'receita'", value: 'positive_as_income' },
            { label: "Valor positivo considerado 'despesa'", value: 'positive_as_expense' },
          ]}
          value={typeDefinitionRule}
          onChange={(val) =>
            setTypeDefinitionRule((val as Transactions.TypeDefinitionRule | null) ?? 'positive_as_income')
          }
          data-testid={ImportTestIds.SelectDecimalSeparator}
        />
      </Flex>

      <FileInput
        label="Arquivo CSV"
        placeholder="Clique para selecionar"
        required
        accept="text/csv"
        leftSection={<IconFileTypeCsv size={16} />}
        value={file}
        onChange={setFile}
        data-testid={ImportTestIds.InputCsvFile}
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
