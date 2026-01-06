# Backend - App Finanças Casal

Backend desenvolvido em Go para aplicativo de controle de despesas familiares.

## Arquitetura

O projeto segue o padrão de arquitetura em camadas:

```
HttpHandler → Interface → Service → Interface → Repository
```

- **Domain**: Structs acessíveis pelas camadas HTTP e Service
- **Entity**: Structs usadas para comunicação com DB na camada de Repository
- **Repository**: Retorna sempre structs de domínio
- **Service**: Contém a lógica de negócio
- **Handler**: Endpoints HTTP usando Echo

## Tecnologias

- **HTTP Handler**: Echo
- **ORM**: GORM
- **Migrations**: Goose
- **Testes Unitários**: stdlib + testify
- **Testes de Integração**: testcontainers
- **Autenticação OAuth**: Goth
- **Banco de Dados**: PostgreSQL (Supabase)

## Pré-requisitos

- Go 1.21 ou superior
- Docker e Docker Compose
- PostgreSQL (ou usar Docker Compose)

## Configuração

1. Clone o repositório
2. Copie `.env.example` para `.env` e configure as variáveis
3. Execute as migrations:
   ```bash
   make migrate-up
   # ou
   goose -dir migrations postgres "user=postgres password=postgres dbname=finance_app sslmode=disable" up
   ```

## Desenvolvimento Local

### Usando Docker Compose

```bash
docker-compose up -d
```

Isso irá iniciar:

- PostgreSQL na porta 5432
- Aplicação na porta 8080

### Executando localmente

```bash
# Instalar dependências
go mod download

# Executar aplicação
go run cmd/server/main.go
```

## Estrutura do Projeto

```
backend/
├── cmd/
│   └── server/          # Entry point da aplicação
├── internal/
│   ├── domain/          # Modelos de domínio
│   ├── entity/          # Entidades do banco de dados
│   ├── repository/      # Camada de acesso a dados
│   ├── service/         # Lógica de negócio
│   ├── handler/         # Handlers HTTP
│   ├── middleware/      # Middlewares
│   └── config/          # Configurações
├── pkg/
│   ├── database/        # Configuração do banco
│   └── oauth/           # Configuração OAuth
├── migrations/          # Migrations do Goose
└── docker/              # Arquivos Docker
```

## Endpoints

### Autenticação

- `POST /auth/register` - Registro com email/senha
- `POST /auth/login` - Login com email/senha
- `GET /auth/google` - Iniciar OAuth Google
- `GET /auth/google/callback` - Callback OAuth Google
- `GET /auth/microsoft` - Iniciar OAuth Microsoft
- `GET /auth/microsoft/callback` - Callback OAuth Microsoft
- `POST /auth/reset-password` - Solicitar reset de senha
- `POST /auth/reset-password/confirm` - Confirmar reset de senha

### Transações

- `GET /transactions` - Listar transações (com filtros)
- `POST /transactions` - Criar transação
- `GET /transactions/:id` - Obter transação
- `PUT /transactions/:id` - Atualizar transação
- `DELETE /transactions/:id` - Deletar transação
- `POST /transactions/bulk-update` - Atualização em massa
- `POST /transactions/import-csv` - Importar CSV
- `GET /transactions/suggest-category` - Sugerir categoria

### Contas

- `GET /accounts` - Listar contas
- `POST /accounts` - Criar conta
- `GET /accounts/:id` - Obter conta
- `PUT /accounts/:id` - Atualizar conta
- `DELETE /accounts/:id` - Deletar conta
- `POST /accounts/:id/share` - Compartilhar conta

### Categorias

- `GET /categories` - Listar categorias
- `POST /categories` - Criar categoria
- `GET /categories/:id` - Obter categoria
- `PUT /categories/:id` - Atualizar categoria
- `DELETE /categories/:id` - Deletar categoria

### Tags

- `GET /tags` - Listar tags
- `POST /tags` - Criar tag
- `GET /tags/:id` - Obter tag
- `PUT /tags/:id` - Atualizar tag
- `DELETE /tags/:id` - Deletar tag

## Testes

```bash
# Testes unitários
go test ./...

# Testes com cobertura
go test -cover ./...

# Testes de integração
go test -tags=integration ./...
```

## Gerar Mocks

O projeto usa [mockery](https://github.com/vektra/mockery) para gerar mocks automaticamente das interfaces.

```bash
# Instalar mockery (se ainda não instalado)
go install github.com/vektra/mockery/v2@latest

# Gerar todos os mocks
make generate-mocks

# Ou usar mockery diretamente
mockery
```

Os mocks serão gerados no diretório `mocks/` seguindo a estrutura:

- `mocks/repository/` - Mocks dos repositórios
- `mocks/service/` - Mocks dos serviços

**Nota**: Se encontrar erros relacionados a dependências ao gerar mocks, tente:

```bash
go clean -modcache
go mod download
go mod tidy
```

## Migrations

```bash
# Criar nova migration
goose -dir migrations create nome_da_migration sql

# Aplicar migrations
goose -dir migrations postgres "connection_string" up

# Reverter última migration
goose -dir migrations postgres "connection_string" down
```

## Deploy

A aplicação está configurada para rodar no Google Cloud Run. Veja `docker/Dockerfile` para detalhes.

## Licença

MIT
