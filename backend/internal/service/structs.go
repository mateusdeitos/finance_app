package service

import (
	"slices"

	"github.com/finance_app/backend/internal/domain"
)

type transactionUpdateData struct {
	userID int
	req    *domain.TransactionUpdateRequest
	// previousTransaction is a strictly READ-ONLY pristine snapshot of the edited
	// transaction as it was before the update. It must never be mutated after
	// construction so that any "before" comparison (e.g. propagation/date checks)
	// reads the original values.
	previousTransaction *domain.Transaction
	// currentTransaction is the MUTABLE clone of previousTransaction that the
	// update loop mutates and persists. It is the entry seeded into transactions
	// for the edited row; previousTransaction is never placed in transactions.
	currentTransaction     *domain.Transaction
	transactions           []*domain.Transaction
	transactionIDsToRemove map[int]bool
	scenario               updateChanges
	isLinkedTxEdit         bool

	// transferToUserRecurrence caches the recurrence created for the toUser
	// during rebuildTransferLinkedTransactions so it's reused across installments.
	transferToUserRecurrence *domain.TransactionRecurrence
}

type updateScenario int

type updateChanges struct {
	Value           updateScenario
	SplitHasChanged bool
	HadRecurrence   bool // whether the transaction originally had a recurrence before any mutations
}

func UpdateNotChangedType() updateChanges {
	return updateChanges{
		Value:           NOT_CHANGED,
		SplitHasChanged: false,
	}
}

type ImportTypeDefinitionRule = domain.ImportTypeDefinitionRule

const (
	TypeDefinitionPositiveAsIncome  ImportTypeDefinitionRule = domain.TypeDefinitionPositiveAsIncome
	TypeDefinitionPositiveAsExpense ImportTypeDefinitionRule = domain.TypeDefinitionPositiveAsExpense
)

const (
	NOT_CHANGED updateScenario = iota

	EXPENSE_WITHOUT_SPLIT_TO_EXPENSE_WITHOUT_SPLIT
	EXPENSE_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT
	EXPENSE_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT
	EXPENSE_WITH_SPLIT_TO_EXPENSE_WITH_SPLIT

	EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITHOUT_SPLIT
	EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT
	EXPENSE_WITH_SPLIT_TO_INCOME_WITHOUT_SPLIT
	EXPENSE_WITH_SPLIT_TO_INCOME_WITH_SPLIT

	INCOME_WITHOUT_SPLIT_TO_INCOME_WITHOUT_SPLIT
	INCOME_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT
	INCOME_WITH_SPLIT_TO_INCOME_WITHOUT_SPLIT
	INCOME_WITH_SPLIT_TO_INCOME_WITH_SPLIT

	INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITHOUT_SPLIT
	INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT
	INCOME_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT
	INCOME_WITH_SPLIT_TO_EXPENSE_WITH_SPLIT

	EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER
	EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER
	EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER
	EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER

	INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER
	INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER
	INCOME_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER
	INCOME_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER

	TRANSFER_SAME_USER_TO_SAME_USER
	TRANSFER_SAME_USER_TO_DIFFERENT_USER
	TRANSFER_DIFFERENT_USER_TO_SAME_USER
	TRANSFER_DIFFERENT_USER_TO_DIFFERENT_USER

	TRANSFER_TO_EXPENSE_WITHOUT_SPLIT
	TRANSFER_TO_EXPENSE_WITH_SPLIT
	TRANSFER_TO_INCOME_WITHOUT_SPLIT
	TRANSFER_TO_INCOME_WITH_SPLIT
)

func (tus updateChanges) TypeChanged() bool {
	return tus.Value != NOT_CHANGED && slices.Contains([]updateScenario{
		EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITHOUT_SPLIT,
		EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT,
		EXPENSE_WITH_SPLIT_TO_INCOME_WITHOUT_SPLIT,
		EXPENSE_WITH_SPLIT_TO_INCOME_WITH_SPLIT,

		INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITHOUT_SPLIT,
		INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT,
		INCOME_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT,
		INCOME_WITH_SPLIT_TO_EXPENSE_WITH_SPLIT,

		EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER,
		EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,
		EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER,
		EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,

		INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER,
		INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,
		INCOME_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER,
		INCOME_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,

		TRANSFER_TO_EXPENSE_WITHOUT_SPLIT,
		TRANSFER_TO_EXPENSE_WITH_SPLIT,
		TRANSFER_TO_INCOME_WITHOUT_SPLIT,
		TRANSFER_TO_INCOME_WITH_SPLIT,
	}, tus.Value)
}

func (tus updateChanges) RemainedTransfer() bool {
	return slices.Contains([]updateScenario{
		TRANSFER_SAME_USER_TO_SAME_USER,
		TRANSFER_SAME_USER_TO_DIFFERENT_USER,
		TRANSFER_DIFFERENT_USER_TO_SAME_USER,
		TRANSFER_DIFFERENT_USER_TO_DIFFERENT_USER,
	}, tus.Value)
}

func (tus updateChanges) TypeChangedToTransfer() bool {
	return tus.TypeChanged() && slices.Contains([]updateScenario{
		EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER,
		EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,
		EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER,
		EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,
		INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER,
		INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,
		INCOME_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER,
		INCOME_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER,
	}, tus.Value)
}

func (tus updateChanges) WasTransfer() bool {
	return tus.TypeChanged() && slices.Contains([]updateScenario{
		TRANSFER_TO_EXPENSE_WITHOUT_SPLIT,
		TRANSFER_TO_EXPENSE_WITH_SPLIT,
		TRANSFER_TO_INCOME_WITHOUT_SPLIT,
		TRANSFER_TO_INCOME_WITH_SPLIT,
	}, tus.Value)
}

func (tus updateChanges) IsTransferToSameUser() bool {
	return (tus.TypeChangedToTransfer() || tus.RemainedTransfer()) && slices.Contains([]updateScenario{
		EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER,
		EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER,
		INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER,
		INCOME_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER,
		TRANSFER_DIFFERENT_USER_TO_SAME_USER,
		TRANSFER_SAME_USER_TO_SAME_USER,
	}, tus.Value)
}

func (tus updateChanges) TransferUserChanged() bool {
	return (tus.TypeChangedToTransfer() || tus.RemainedTransfer()) && slices.Contains([]updateScenario{
		TRANSFER_SAME_USER_TO_DIFFERENT_USER,
		TRANSFER_DIFFERENT_USER_TO_SAME_USER,
		TRANSFER_DIFFERENT_USER_TO_DIFFERENT_USER,
	}, tus.Value)
}

func (tus updateChanges) RemovedSplit() bool {
	return slices.Contains([]updateScenario{
		EXPENSE_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT,
		EXPENSE_WITH_SPLIT_TO_INCOME_WITHOUT_SPLIT,
		INCOME_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT,
		INCOME_WITH_SPLIT_TO_INCOME_WITHOUT_SPLIT,
		TRANSFER_TO_EXPENSE_WITHOUT_SPLIT,
		TRANSFER_TO_INCOME_WITHOUT_SPLIT,
	}, tus.Value)
}

func (tus updateChanges) AddedSplit() bool {
	return slices.Contains([]updateScenario{
		EXPENSE_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT,
		EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT,
		INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT,
		INCOME_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT,
		TRANSFER_TO_EXPENSE_WITH_SPLIT,
		TRANSFER_TO_INCOME_WITH_SPLIT,
	}, tus.Value)
}
