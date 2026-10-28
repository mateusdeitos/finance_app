package mcp

import (
	"testing"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/require"
)

func TestMCPToolAnnotationsMatchFinancialEffects(t *testing.T) {
	ctx := t.Context()
	clientTransport, serverTransport := mcpsdk.NewInMemoryTransports()
	serverSession, err := testServer(t).protocolServer().Connect(ctx, serverTransport, nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = serverSession.Close() })
	client := mcpsdk.NewClient(&mcpsdk.Implementation{Name: "annotation-review", Version: "1.0.0"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = clientSession.Close() })
	result, err := clientSession.ListTools(ctx, nil)
	require.NoError(t, err)
	require.Len(t, result.Tools, 8)
	for _, tool := range result.Tools {
		t.Run(tool.Name, func(t *testing.T) {
			a := tool.Annotations
			require.NotNil(t, a)
			require.NotNil(t, a.OpenWorldHint)
			require.False(t, *a.OpenWorldHint)
			require.NotNil(t, a.DestructiveHint)
			switch tool.Name {
			case "finance_create_transaction":
				require.False(t, a.ReadOnlyHint)
				require.False(t, *a.DestructiveHint)
			case "finance_update_transaction", "finance_delete_transaction":
				require.False(t, a.ReadOnlyHint)
				require.True(t, *a.DestructiveHint)
			default:
				require.True(t, a.ReadOnlyHint)
				require.False(t, *a.DestructiveHint)
			}
		})
	}
}
