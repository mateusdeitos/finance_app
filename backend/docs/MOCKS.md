# Gerando Mocks com Mockery

Este projeto usa [mockery](https://github.com/vektra/mockery) para gerar mocks automaticamente das interfaces.

## Instalação

```bash
go install github.com/vektra/mockery/v2@latest
```

## Configuração

A configuração do mockery está no arquivo `.mockery.yaml` na raiz do projeto.

## Gerar Mocks

### Usando Make

```bash
make generate-mocks
```

### Usando Mockery diretamente

```bash
mockery
```

## Estrutura dos Mocks

Os mocks são gerados no diretório `mocks/`:

```
mocks/
├── repository/
│   ├── mock_user_repository.go
│   ├── mock_account_repository.go
│   ├── mock_category_repository.go
│   ├── mock_tag_repository.go
│   ├── mock_transaction_repository.go
│   └── ...
└── service/
    ├── mock_auth_service.go
    ├── mock_transaction_service.go
    └── ...
```

## Usando os Mocks nos Testes

```go
import (
    "github.com/finance_app/backend/mocks/repository"
    "github.com/stretchr/testify/mock"
)

func TestMyService(t *testing.T) {
    mockRepo := repository.NewMockUserRepository(t)
    
    mockRepo.EXPECT().
        GetByEmail(mock.Anything, "test@example.com").
        Return(&domain.User{Email: "test@example.com"}, nil)
    
    // Use mockRepo in your test
}
```

## Troubleshooting

Se encontrar erros ao gerar mocks:

1. **Erro de dependências não encontradas:**
   ```bash
   go mod tidy
   go mod download
   ```

2. **Erro de cache corrompido:**
   ```bash
   go clean -modcache
   go mod download
   ```

3. **Erro de parsing:**
   - Verifique se todos os imports estão corretos
   - Execute `go build ./...` para verificar se o código compila
   - Certifique-se de que todas as dependências estão instaladas

## Atualizar Mocks

Sempre que uma interface for modificada, regenere os mocks:

```bash
make generate-mocks
```

Os mocks gerados não devem ser editados manualmente, pois serão sobrescritos na próxima geração.

