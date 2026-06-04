//go:build integration

package service

import (
	"context"
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/stretchr/testify/suite"
)

type PushSubscriptionServiceTestSuite struct {
	ServiceTestWithDBSuite
}

func TestPushSubscriptionServiceWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test")
	}
	suite.Run(t, new(PushSubscriptionServiceTestSuite))
}

func uniqueEndpoint() string {
	return fmt.Sprintf("https://fcm.googleapis.com/fcm/send/test-%d", rand.Int64())
}

func (suite *PushSubscriptionServiceTestSuite) Test_Subscribe_StoresInDB() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	endpoint := uniqueEndpoint()
	req := &domain.SubscribePushRequest{
		Endpoint: endpoint,
		Keys: domain.PushKeys{
			P256dh: "fake-p256dh",
			Auth:   "fake-auth",
		},
	}

	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, req)
	suite.Require().NoError(err)

	resp, err := suite.Services.PushSubscription.Status(ctx, user.ID, endpoint)
	suite.Require().NoError(err)
	suite.True(resp.Subscribed)
}

func (suite *PushSubscriptionServiceTestSuite) Test_Subscribe_Upsert_ReplacesRow() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	endpoint := uniqueEndpoint()

	// Subscribe as user1
	err = suite.Services.PushSubscription.Subscribe(ctx, user1.ID, &domain.SubscribePushRequest{
		Endpoint: endpoint,
		Keys:     domain.PushKeys{P256dh: "p256dh-v1", Auth: "auth-v1"},
	})
	suite.Require().NoError(err)

	// Upsert same endpoint as user2 (device changed hands / re-registered)
	err = suite.Services.PushSubscription.Subscribe(ctx, user2.ID, &domain.SubscribePushRequest{
		Endpoint: endpoint,
		Keys:     domain.PushKeys{P256dh: "p256dh-v2", Auth: "auth-v2"},
	})
	suite.Require().NoError(err)

	// user1 should no longer be subscribed on this endpoint
	resp1, err := suite.Services.PushSubscription.Status(ctx, user1.ID, endpoint)
	suite.Require().NoError(err)
	suite.False(resp1.Subscribed, "user1 should not be subscribed after upsert by user2")

	// user2 should be subscribed
	resp2, err := suite.Services.PushSubscription.Status(ctx, user2.ID, endpoint)
	suite.Require().NoError(err)
	suite.True(resp2.Subscribed)
}

func (suite *PushSubscriptionServiceTestSuite) Test_Subscribe_EmptyEndpoint_Errors() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, &domain.SubscribePushRequest{
		Endpoint: "",
		Keys:     domain.PushKeys{P256dh: "p256dh", Auth: "auth"},
	})
	suite.Require().Error(err)
	suite.Contains(err.Error(), "endpoint is required")
}

func (suite *PushSubscriptionServiceTestSuite) Test_Subscribe_EmptyP256dh_Errors() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, &domain.SubscribePushRequest{
		Endpoint: uniqueEndpoint(),
		Keys:     domain.PushKeys{P256dh: "", Auth: "auth"},
	})
	suite.Require().Error(err)
	suite.Contains(err.Error(), "keys.p256dh is required")
}

func (suite *PushSubscriptionServiceTestSuite) Test_Subscribe_EmptyAuth_Errors() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, &domain.SubscribePushRequest{
		Endpoint: uniqueEndpoint(),
		Keys:     domain.PushKeys{P256dh: "p256dh", Auth: ""},
	})
	suite.Require().Error(err)
	suite.Contains(err.Error(), "keys.auth is required")
}

func (suite *PushSubscriptionServiceTestSuite) Test_Unsubscribe_RemovesRow() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	endpoint := uniqueEndpoint()
	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, &domain.SubscribePushRequest{
		Endpoint: endpoint,
		Keys:     domain.PushKeys{P256dh: "p256dh", Auth: "auth"},
	})
	suite.Require().NoError(err)

	err = suite.Services.PushSubscription.Unsubscribe(ctx, user.ID, endpoint)
	suite.Require().NoError(err)

	resp, err := suite.Services.PushSubscription.Status(ctx, user.ID, endpoint)
	suite.Require().NoError(err)
	suite.False(resp.Subscribed)
}

func (suite *PushSubscriptionServiceTestSuite) Test_Unsubscribe_Idempotent() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	// Unsubscribe for an endpoint that doesn't exist — should not error
	err = suite.Services.PushSubscription.Unsubscribe(ctx, user.ID, uniqueEndpoint())
	suite.Require().NoError(err)
}

func (suite *PushSubscriptionServiceTestSuite) Test_Status_TrueWhenExists() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	endpoint := uniqueEndpoint()
	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, &domain.SubscribePushRequest{
		Endpoint: endpoint,
		Keys:     domain.PushKeys{P256dh: "p256dh", Auth: "auth"},
	})
	suite.Require().NoError(err)

	resp, err := suite.Services.PushSubscription.Status(ctx, user.ID, endpoint)
	suite.Require().NoError(err)
	suite.True(resp.Subscribed)
}

func (suite *PushSubscriptionServiceTestSuite) Test_Status_FalseWhenAbsent() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	resp, err := suite.Services.PushSubscription.Status(ctx, user.ID, uniqueEndpoint())
	suite.Require().NoError(err)
	suite.False(resp.Subscribed)
}

func (suite *PushSubscriptionServiceTestSuite) Test_DeleteByEndpointAdmin_RemovesWithoutUserCheck() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	endpoint := uniqueEndpoint()
	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, &domain.SubscribePushRequest{
		Endpoint: endpoint,
		Keys:     domain.PushKeys{P256dh: "p256dh", Auth: "auth"},
	})
	suite.Require().NoError(err)

	// Call admin-prune directly on the repository (simulating Phase 23 pruning after 404/410)
	err = suite.PushSubscriptionRepository.DeleteByEndpointAdmin(ctx, endpoint)
	suite.Require().NoError(err)

	// Subscription should now be gone
	resp, err := suite.Services.PushSubscription.Status(ctx, user.ID, endpoint)
	suite.Require().NoError(err)
	suite.False(resp.Subscribed)
}
