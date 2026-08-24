package mcp

import (
	"context"
	"errors"
	"strconv"

	mcpauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// protocolServer registers the complete MCP tool surface for one request.
func (s *Server) protocolServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "dividim",
		Version: "1.0.0",
	}, nil)
	read := &mcp.ToolAnnotations{
		ReadOnlyHint:  true,
		OpenWorldHint: boolPtr(false),
	}
	write := &mcp.ToolAnnotations{
		ReadOnlyHint:    false,
		DestructiveHint: boolPtr(false),
		OpenWorldHint:   boolPtr(false),
	}
	destructive := &mcp.ToolAnnotations{
		ReadOnlyHint:    false,
		DestructiveHint: boolPtr(true),
		OpenWorldHint:   boolPtr(false),
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_get_context",
		Description: "Lista contas, categorias, tags e conexões disponíveis ao usuário.",
		Annotations: read,
	}, s.getContext)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_list_transactions",
		Description: "Lista transações do mês; valores são sempre centavos.",
		Annotations: read,
	}, s.listTransactions)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_get_transaction",
		Description: "Obtém uma transação pertencente ao usuário autenticado.",
		Annotations: read,
	}, s.getTransaction)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_get_balance",
		Description: "Calcula o saldo do período em centavos.",
		Annotations: read,
	}, s.getBalance)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_suggest_transactions",
		Description: "Sugere lançamentos anteriores a partir de uma descrição.",
		Annotations: read,
	}, s.suggestTransactions)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_create_transaction",
		Description: "Cria uma despesa, receita ou transferência. Requer aprovação do cliente MCP.",
		Annotations: write,
	}, s.createTransaction)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_update_transaction",
		Description: "Atualiza uma transação. propagation_settings é obrigatório.",
		Annotations: write,
	}, s.updateTransaction)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "finance_delete_transaction",
		Description: "Exclui uma transação. propagation_settings é obrigatório.",
		Annotations: destructive,
	}, s.deleteTransaction)

	return server
}

func userID(ctx context.Context, scope string) (int, error) {
	ti := mcpauth.TokenInfoFromContext(ctx)
	if ti == nil || !contains(ti.Scopes, scope) {
		return 0, errors.New("insufficient scope")
	}
	id, err := strconv.Atoi(ti.UserID)
	return id, err
}

type empty struct{}
