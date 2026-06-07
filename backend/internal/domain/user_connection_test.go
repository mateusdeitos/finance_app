package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestUserConnectionSwapIfNeeded verifies that SwapIfNeeded orients the connection
// so the current user is always the "from" side, and — critically — that the
// per-side linked-transaction day-of-month preference travels with its side. This
// keeps the partner's (recipient's) preference on the To* side regardless of which
// participant authors the split.
func TestUserConnectionSwapIfNeeded(t *testing.T) {
	fromDay := 5
	toDay := 20

	newConn := func() *UserConnection {
		return &UserConnection{
			FromUserID:                      1,
			FromAccountID:                   10,
			ToUserID:                        2,
			ToAccountID:                     20,
			FromLinkedTransactionDayOfMonth: &fromDay,
			ToLinkedTransactionDayOfMonth:   &toDay,
		}
	}

	t.Run("current user is already the from side → no swap", func(t *testing.T) {
		conn := newConn()
		conn.SwapIfNeeded(1)

		assert.Equal(t, 1, conn.FromUserID)
		assert.Equal(t, 10, conn.FromAccountID)
		assert.Equal(t, 2, conn.ToUserID)
		assert.Equal(t, 20, conn.ToAccountID)
		// The recipient (user 2, To side) keeps their own day-of-month preference.
		assert.Equal(t, 5, *conn.FromLinkedTransactionDayOfMonth)
		assert.Equal(t, 20, *conn.ToLinkedTransactionDayOfMonth)
	})

	t.Run("current user is the to side → swap moves the partner's day to the To side", func(t *testing.T) {
		conn := newConn()
		conn.SwapIfNeeded(2)

		// ids flipped so the author (user 2) is now "from"
		assert.Equal(t, 2, conn.FromUserID)
		assert.Equal(t, 20, conn.FromAccountID)
		assert.Equal(t, 1, conn.ToUserID)
		assert.Equal(t, 10, conn.ToAccountID)
		// The recipient is now user 1 (the To side) — their configured day (5) must
		// land on ToLinkedTransactionDayOfMonth, where the linked tx date is derived.
		assert.Equal(t, 20, *conn.FromLinkedTransactionDayOfMonth)
		assert.Equal(t, 5, *conn.ToLinkedTransactionDayOfMonth)
	})

	t.Run("nil preferences swap cleanly", func(t *testing.T) {
		conn := &UserConnection{
			FromUserID:                      1,
			FromAccountID:                   10,
			ToUserID:                        2,
			ToAccountID:                     20,
			ToLinkedTransactionDayOfMonth:   &toDay,
			FromLinkedTransactionDayOfMonth: nil,
		}
		conn.SwapIfNeeded(2)

		// after swap the (originally nil) from-side preference is on the To side
		assert.Nil(t, conn.ToLinkedTransactionDayOfMonth)
		assert.Equal(t, 20, *conn.FromLinkedTransactionDayOfMonth)
	})
}
