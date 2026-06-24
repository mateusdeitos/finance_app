// Consolidate recurrences script.
//
// Fixes data left behind by the create-transaction bug where a recurring shared
// expense / income / transfer created ONE recurrence per partner installment
// instead of a single recurrence shared by all of the partner's installments.
//
// For every author recurrence, the partner's linked transactions are grouped by
// (author_recurrence_id, partner_user_id, account_id). Whenever such a group
// points at more than one recurrence, the lowest recurrence id is kept as the
// canonical one, every transaction referencing the duplicates is re-pointed to
// it, and the now-orphaned recurrence records are deleted.
//
// Run a preview first, then apply:
//
//	just consolidate-recurrences            # dry-run, prints what would change
//	just consolidate-recurrences --apply    # performs the consolidation
//
// or directly:
//
//	go run cmd/scripts/consolidate_recurrences/main.go [--apply]
package main

import (
	"flag"
	"log"
	"sort"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/pkg/database"
	"gorm.io/gorm"
)

// linkedRow is one (author installment → partner linked tx) edge, carrying the
// recurrence on each side. Only rows where both sides have a recurrence matter.
type linkedRow struct {
	AuthorRecurrenceID int `gorm:"column:author_recurrence_id"`
	PartnerUserID      int `gorm:"column:partner_user_id"`
	AccountID          int `gorm:"column:account_id"`
	LinkedRecurrenceID int `gorm:"column:linked_recurrence_id"`
}

// groupKey identifies a single logical partner recurrence stream: all installments
// of one partner, on one account, linked to one author recurrence.
type groupKey struct {
	authorRecurrenceID int
	partnerUserID      int
	accountID          int
}

func main() {
	apply := flag.Bool("apply", false, "apply the consolidation; omit for a dry-run preview")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := database.NewPostgresDB(cfg.Database.DSN())
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	// Pull every author-installment → partner-linked-tx edge where both sides carry
	// a recurrence. Soft-deleted transactions are ignored when detecting duplicates
	// (the re-point step below still fixes any deleted rows that reference an orphan).
	var rows []linkedRow
	const query = `
		SELECT a.transaction_recurrence_id AS author_recurrence_id,
		       b.user_id                    AS partner_user_id,
		       b.account_id                 AS account_id,
		       b.transaction_recurrence_id  AS linked_recurrence_id
		FROM linked_transactions lt
		JOIN transactions a ON a.id = lt.transaction_id
		JOIN transactions b ON b.id = lt.linked_transaction_id
		WHERE a.transaction_recurrence_id IS NOT NULL
		  AND b.transaction_recurrence_id IS NOT NULL
		  AND a.deleted_at IS NULL
		  AND b.deleted_at IS NULL`
	if err := db.Raw(query).Scan(&rows).Error; err != nil {
		log.Fatalf("query linked transactions: %v", err)
	}

	// Group by (author recurrence, partner, account) → set of distinct recurrences.
	groups := make(map[groupKey]map[int]struct{})
	for _, r := range rows {
		k := groupKey{r.AuthorRecurrenceID, r.PartnerUserID, r.AccountID}
		if groups[k] == nil {
			groups[k] = make(map[int]struct{})
		}
		groups[k][r.LinkedRecurrenceID] = struct{}{}
	}

	// Decide consolidations: any group pointing at >1 recurrence.
	type consolidation struct {
		key       groupKey
		canonical int
		orphans   []int
	}
	var plan []consolidation
	for k, recSet := range groups {
		if len(recSet) <= 1 {
			continue
		}
		ids := make([]int, 0, len(recSet))
		for id := range recSet {
			ids = append(ids, id)
		}
		sort.Ints(ids)
		plan = append(plan, consolidation{key: k, canonical: ids[0], orphans: ids[1:]})
	}

	// Deterministic output ordering.
	sort.Slice(plan, func(i, j int) bool {
		if plan[i].key.authorRecurrenceID != plan[j].key.authorRecurrenceID {
			return plan[i].key.authorRecurrenceID < plan[j].key.authorRecurrenceID
		}
		if plan[i].key.partnerUserID != plan[j].key.partnerUserID {
			return plan[i].key.partnerUserID < plan[j].key.partnerUserID
		}
		return plan[i].key.accountID < plan[j].key.accountID
	})

	if len(plan) == 0 {
		log.Printf("No fragmented partner recurrences found. Nothing to do.")
		return
	}

	totalOrphans := 0
	for _, c := range plan {
		totalOrphans += len(c.orphans)
		log.Printf("author_recurrence=%d partner_user=%d account=%d → keep recurrence %d, merge %d duplicate(s): %v",
			c.key.authorRecurrenceID, c.key.partnerUserID, c.key.accountID, c.canonical, len(c.orphans), c.orphans)
	}
	log.Printf("Plan: %d stream(s) to consolidate, %d duplicate recurrence(s) to remove.", len(plan), totalOrphans)

	if !*apply {
		log.Printf("Dry-run only. Re-run with --apply to perform the consolidation.")
		return
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		for _, c := range plan {
			if len(c.orphans) == 0 {
				continue
			}
			// Re-point every transaction (including soft-deleted ones) referencing a
			// duplicate recurrence to the canonical one, then drop the now-unused records.
			if err := tx.Exec(
				`UPDATE transactions SET transaction_recurrence_id = ? WHERE transaction_recurrence_id IN ?`,
				c.canonical, c.orphans,
			).Error; err != nil {
				return err
			}
			if err := tx.Exec(
				`DELETE FROM transaction_recurrences WHERE id IN ?`,
				c.orphans,
			).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		log.Fatalf("consolidation failed (rolled back): %v", err)
	}

	log.Printf("Done. Consolidated %d stream(s); removed %d duplicate recurrence(s).", len(plan), totalOrphans)
}
