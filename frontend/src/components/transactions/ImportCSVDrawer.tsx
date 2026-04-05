import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Code,
  Drawer,
  FileInput,
  Loader,
  Radio,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconFileTypeCsv } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useParseImportCSV } from '@/hooks/useParseImportCSV'
import { parseApiError } from '@/utils/apiErrors'
import { Transactions } from '@/types/transactions'
import { useDrawerContext } from '@/utils/renderDrawer'

export interface ImportCSVDrawerResult {
  rows: Transactions.ParsedImportRow[]
  accountId: number
}

const CSV_COLUMNS = [
  { col: 'Data', required: true, description: 'Formato DD/MM/AAAA' },
  { col: 'Descrição', required: true, description: 'Texto livre' },
  { col: 'Tipo', required: true, description: 'despesa, receita ou transferência' },
  { col: 'Valor', required: true, description: 'Ex: 1234,56 ou 1.234,56' },
  { col: 'Categoria', required: false, description: 'Nome da categoria (obrigatório se não for transferência)' },
  { col: 'Conta Destino', required: false, description: 'Nome da conta (obrigatório se for transferência)' },
  { col: 'Tipo de Parcelamento', required: false, description: 'diário, semanal, mensal ou anual' },
  { col: 'Quantidade de Parcelas', required: false, description: 'Número inteiro (obrigatório se parcelamento definido)' },
]

export function ImportCSVDrawer() {
  const { opened, close, reject } = useDrawerContext<ImportCSVDrawerResult>()

  const [format] = useState<'csv'>('csv')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { query: accountsQuery } = useAccounts()
  const accounts = accountsQuery.data ?? []

  const ownAccountOptions = accounts
    .filter((a) => !a.user_connection && a.is_active)
    .map((a) => ({ value: String(a.id), label: a.name }))

  const { mutation } = useParseImportCSV()

  async function handleSubmit() {
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
      { file, accountId },
      {
        onSuccess: (result) => {
          close({ rows: result.rows, accountId })
        },
        onError: async (err: unknown) => {
          if (err instanceof Response) {
            const apiError = await parseApiError(err)
            const tag = apiError.tags[0] as string | undefined
            const message =
              (tag ? Transactions.IMPORT_ERROR_MESSAGES[tag] : undefined) ??
              apiError.message ??
              'Erro ao processar o arquivo.'
            setErrorMessage(message)
          } else {
            setErrorMessage('Erro ao processar o arquivo.')
          }
        },
      },
    )
  }

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      title="Importar Transações"
      position="right"
      size="lg"
    >
      <Stack gap="md">
        {/* Format selection */}
        <Radio.Group
          label="Formato"
          value={format}
        >
          <Radio value="csv" label="CSV" mt="xs" />
        </Radio.Group>

        {/* Account selection */}
        <Select
          label="Conta"
          placeholder="Selecione uma conta"
          required
          data={ownAccountOptions}
          value={accountId ? String(accountId) : null}
          onChange={(val) => setAccountId(val ? Number(val) : null)}
          searchable
        />

        {/* File input */}
        <FileInput
          label="Arquivo CSV"
          placeholder="Clique para selecionar"
          required
          accept=".csv,text/csv"
          leftSection={<IconFileTypeCsv size={16} />}
          value={file}
          onChange={setFile}
        />

        {/* Error message */}
        {errorMessage && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title="Erro">
            {errorMessage}
          </Alert>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          loading={mutation.isPending}
          leftSection={mutation.isPending ? <Loader size="xs" /> : undefined}
          disabled={!file || !accountId}
        >
          Processar arquivo
        </Button>

        {/* CSV Format reference */}
        <Box mt="md">
          <Title order={6} mb="xs">
            Modelo de cabeçalho válido
          </Title>
          <Code block mb="xs">
            {CSV_COLUMNS.map((c) => c.col).join(',')}
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
    </Drawer>
  )
}
