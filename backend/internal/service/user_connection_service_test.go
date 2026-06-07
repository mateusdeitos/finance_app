package service

import (
	"context"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/stretchr/testify/suite"
)

type UserConnectionServiceWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

// getConnectionByID reloads a connection from the DB by id.
func (suite *UserConnectionServiceWithDBTestSuite) getConnectionByID(ctx context.Context, id int) *domain.UserConnection {
	conns, err := suite.Services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{IDs: []int{id}})
	suite.Require().NoError(err)
	suite.Require().Len(conns, 1)
	return conns[0]
}

func (suite *UserConnectionServiceWithDBTestSuite) TestUpdateSettingsAsFromUser() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 60)
	suite.Require().NoError(err)

	updated, err := suite.Services.UserConnection.UpdateSettings(ctx, user1.ID, conn.ID, "Conta do casal", 70, nil)
	suite.Require().NoError(err)
	suite.Equal(70, updated.FromDefaultSplitPercentage)
	suite.Equal(30, updated.ToDefaultSplitPercentage)

	// persisted
	reloaded := suite.getConnectionByID(ctx, conn.ID)
	suite.Equal(70, reloaded.FromDefaultSplitPercentage)
	suite.Equal(30, reloaded.ToDefaultSplitPercentage)

	// the caller's own connection account was renamed
	account, err := suite.Services.Account.GetByID(ctx, user1.ID, conn.FromAccountID)
	suite.Require().NoError(err)
	suite.Equal("Conta do casal", account.Name)
}

func (suite *UserConnectionServiceWithDBTestSuite) TestUpdateSettingsAsToUser() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 60)
	suite.Require().NoError(err)

	// the invited user sets their own side to 70 → from becomes 30
	updated, err := suite.Services.UserConnection.UpdateSettings(ctx, user2.ID, conn.ID, "Parceiro", 70, nil)
	suite.Require().NoError(err)
	suite.Equal(70, updated.ToDefaultSplitPercentage)
	suite.Equal(30, updated.FromDefaultSplitPercentage)

	account, err := suite.Services.Account.GetByID(ctx, user2.ID, conn.ToAccountID)
	suite.Require().NoError(err)
	suite.Equal("Parceiro", account.Name)
}

func (suite *UserConnectionServiceWithDBTestSuite) TestUpdateSettingsForbiddenForNonParticipant() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	stranger, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 60)
	suite.Require().NoError(err)

	_, err = suite.Services.UserConnection.UpdateSettings(ctx, stranger.ID, conn.ID, "x", 50, nil)
	suite.Require().Error(err)
	se, ok := pkgErrors.AsServiceError(err)
	suite.Require().True(ok)
	suite.Equal(pkgErrors.ErrCodeForbidden, se.Code)
}

func (suite *UserConnectionServiceWithDBTestSuite) TestUpdateSettingsValidatesInput() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 60)
	suite.Require().NoError(err)

	// blank name → bad request
	_, err = suite.Services.UserConnection.UpdateSettings(ctx, user1.ID, conn.ID, "   ", 50, nil)
	suite.Require().Error(err)
	se, ok := pkgErrors.AsServiceError(err)
	suite.Require().True(ok)
	suite.Equal(pkgErrors.ErrCodeBadRequest, se.Code)

	// out-of-range split → bad request
	_, err = suite.Services.UserConnection.UpdateSettings(ctx, user1.ID, conn.ID, "Valid", 150, nil)
	suite.Require().Error(err)
	se, ok = pkgErrors.AsServiceError(err)
	suite.Require().True(ok)
	suite.Equal(pkgErrors.ErrCodeBadRequest, se.Code)
}

func (suite *UserConnectionServiceWithDBTestSuite) TestUpdateSettingsNotFound() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	_, err = suite.Services.UserConnection.UpdateSettings(ctx, user1.ID, 999999, "Valid", 50, nil)
	suite.Require().Error(err)
	se, ok := pkgErrors.AsServiceError(err)
	suite.Require().True(ok)
	suite.Equal(pkgErrors.ErrCodeNotFound, se.Code)
}

func (suite *UserConnectionServiceWithDBTestSuite) TestUpdateSettingsPersistsLinkedTransactionDayPerSide() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	day10 := 10
	// the invited user (To side) configures day 10 for their linked transactions
	updated, err := suite.Services.UserConnection.UpdateSettings(ctx, user2.ID, conn.ID, "Parceiro", 50, &day10)
	suite.Require().NoError(err)
	suite.Require().NotNil(updated.ToLinkedTransactionDayOfMonth)
	suite.Equal(10, *updated.ToLinkedTransactionDayOfMonth)
	suite.Nil(updated.FromLinkedTransactionDayOfMonth)

	reloaded := suite.getConnectionByID(ctx, conn.ID)
	suite.Require().NotNil(reloaded.ToLinkedTransactionDayOfMonth)
	suite.Equal(10, *reloaded.ToLinkedTransactionDayOfMonth)
	suite.Nil(reloaded.FromLinkedTransactionDayOfMonth)

	// the From user can clear their preference (nil) without touching the To side
	_, err = suite.Services.UserConnection.UpdateSettings(ctx, user1.ID, conn.ID, "Conta", 50, nil)
	suite.Require().NoError(err)
	reloaded = suite.getConnectionByID(ctx, conn.ID)
	suite.Nil(reloaded.FromLinkedTransactionDayOfMonth)
	suite.Require().NotNil(reloaded.ToLinkedTransactionDayOfMonth, "To side preference must be preserved")
	suite.Equal(10, *reloaded.ToLinkedTransactionDayOfMonth)
}

func (suite *UserConnectionServiceWithDBTestSuite) TestUpdateSettingsRejectsInvalidLinkedTransactionDay() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	for _, invalid := range []int{0, 32, -1} {
		d := invalid
		_, err = suite.Services.UserConnection.UpdateSettings(ctx, user1.ID, conn.ID, "Valid", 50, &d)
		suite.Require().Error(err, "day %d should be rejected", invalid)
		se, ok := pkgErrors.AsServiceError(err)
		suite.Require().True(ok)
		suite.Equal(pkgErrors.ErrCodeBadRequest, se.Code)
	}
}

func TestUserConnectionServiceWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(UserConnectionServiceWithDBTestSuite))
}
