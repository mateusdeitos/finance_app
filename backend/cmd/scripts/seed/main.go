// Seed script: populates the local database with realistic test data for a given user.
// Configure the variables below, then run:
//
//	just seed <user-email>
//
// or directly:
//
//	go run cmd/scripts/seed/main.go <user-email>
package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/database"
)

// ── Configuration ────────────────────────────────────────────────────────────

var (
	startPeriod = time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	endPeriod   = time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC)

	quantityOfTransactions = 30 // transactions per month
	quantityOfAccounts     = 3
	quantityOfCategories   = 8

	tagNames = []string{"fixo", "supermercado", "lazer", "viagem", "saúde", "assinatura"}
)

// ── Seed data ─────────────────────────────────────────────────────────────────

var accountNames = []string{
	"Conta corrente", "Cartão de crédito", "Poupança", "Carteira", "Investimentos",
}

var categoryTree = []struct {
	name     string
	children []string
}{
	{"Moradia", []string{"Aluguel", "Condomínio", "Energia", "Água", "Internet"}},
	{"Alimentação", []string{"Supermercado", "Restaurante", "Delivery"}},
	{"Transporte", []string{"Combustível", "Uber/99", "Ônibus"}},
	{"Saúde", []string{"Plano de saúde", "Farmácia", "Consulta"}},
	{"Lazer", []string{"Cinema", "Viagem", "Streaming"}},
	{"Educação", []string{"Curso", "Livros"}},
	{"Vestuário", []string{}},
	{"Outros", []string{}},
}

var descriptionsByType = map[domain.TransactionType][]string{
	domain.TransactionTypeExpense: {
		"Supermercado", "Aluguel", "Conta de luz", "Academia", "Netflix",
		"Spotify", "Farmácia", "Gasolina", "Restaurante", "iFood",
		"Uber", "Plano de saúde", "Internet", "Condomínio", "Escola",
	},
	domain.TransactionTypeIncome: {
		"Salário", "Freelance", "Dividendos", "Bônus", "Aluguel recebido",
	},
	domain.TransactionTypeTransfer: {
		"Transferência entre contas",
	},
}

// ─────────────────────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: seed <user-email>")
	}
	userEmail := os.Args[1]

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := database.NewPostgresDB(cfg.Database.DSN())
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	repos := &repository.Repositories{
		User:                  repository.NewUserRepository(db),
		DBTransaction:         repository.NewDBTransaction(db),
		UserSocial:            repository.NewUserSocialRepository(db),
		Account:               repository.NewAccountRepository(db),
		Category:              repository.NewCategoryRepository(db),
		Tag:                   repository.NewTagRepository(db),
		Transaction:           repository.NewTransactionRepository(db),
		TransactionRecurrence: repository.NewTransactionRecurrenceRepository(db),
		UserSettings:          repository.NewUserSettingsRepository(db),
		UserConnection:        repository.NewUserConnectionRepository(db),
		Settlement:            repository.NewSettlementRepository(db),
	}

	svcs := &service.Services{
		Account:    service.NewAccountService(repos),
		Category:   service.NewCategoryService(repos),
		Tag:        service.NewTagService(repos),
		Settlement: service.NewSettlementService(repos),
	}
	svcs.UserConnection = service.NewUserConnectionService(repos, svcs)
	svcs.Transaction = service.NewTransactionService(repos, svcs)

	ctx := context.Background()

	// Resolve user
	user, err := repos.User.GetByEmail(ctx, userEmail)
	if err != nil {
		log.Fatalf("user %q not found: %v", userEmail, err)
	}
	fmt.Printf("Seeding data for user: %s (id=%d)\n", user.Name, user.ID)

	// Accounts
	accounts := seedAccounts(ctx, svcs, user.ID)

	// Categories
	categories := seedCategories(ctx, svcs, user.ID)

	// Tags
	tags := seedTags(ctx, svcs, user.ID)

	// Transactions
	seedTransactions(ctx, svcs, user.ID, accounts, categories, tags)

	fmt.Println("Done.")
}

func seedAccounts(ctx context.Context, svcs *service.Services, userID int) []*domain.Account {
	existing, err := svcs.Account.Search(ctx, domain.AccountSearchOptions{UserIDs: []int{userID}})
	if err != nil {
		log.Fatalf("failed to fetch existing accounts: %v", err)
	}
	missing := quantityOfAccounts - len(existing)
	fmt.Printf("Accounts: %d existing, need %d more\n", len(existing), max(0, missing))

	accounts := existing
	for i := len(existing); i < quantityOfAccounts && i < len(accountNames); i++ {
		acc, err := svcs.Account.Create(ctx, userID, &domain.Account{
			Name:           accountNames[i],
			InitialBalance: 0,
		})
		if err != nil {
			log.Printf("  skip account %q: %v", accountNames[i], err)
			continue
		}
		accounts = append(accounts, acc)
		fmt.Printf("  + %s\n", acc.Name)
	}
	return accounts
}

func seedCategories(ctx context.Context, svcs *service.Services, userID int) []*domain.Category {
	existing, err := svcs.Category.Search(ctx, domain.CategorySearchOptions{UserIDs: []int{userID}})
	if err != nil {
		log.Fatalf("failed to fetch existing categories: %v", err)
	}

	// Count only root categories to compare against quantityOfCategories
	existingRoots := 0
	for _, c := range existing {
		if c.ParentID == nil {
			existingRoots++
		}
	}
	fmt.Printf("Categories: %d existing root(s), need %d more\n", existingRoots, max(0, quantityOfCategories-existingRoots))

	all := existing
	created := existingRoots
	for _, entry := range categoryTree {
		if created >= quantityOfCategories {
			break
		}
		root, err := svcs.Category.Create(ctx, userID, &domain.Category{Name: entry.name})
		if err != nil {
			log.Printf("  skip category %q: %v", entry.name, err)
			continue
		}
		all = append(all, root)
		created++
		fmt.Printf("  + %s\n", root.Name)

		for _, child := range entry.children {
			sub, err := svcs.Category.Create(ctx, userID, &domain.Category{
				Name:     child,
				ParentID: &root.ID,
			})
			if err != nil {
				log.Printf("    skip sub-category %q: %v", child, err)
				continue
			}
			all = append(all, sub)
			fmt.Printf("    └─ %s\n", sub.Name)
		}
	}
	return all
}

func seedTags(ctx context.Context, svcs *service.Services, userID int) []*domain.Tag {
	existing, err := svcs.Tag.Search(ctx, domain.TagSearchOptions{UserIDs: []int{userID}})
	if err != nil {
		log.Fatalf("failed to fetch existing tags: %v", err)
	}

	existingNames := make(map[string]bool, len(existing))
	for _, t := range existing {
		existingNames[t.Name] = true
	}

	missing := 0
	for _, name := range tagNames {
		if !existingNames[name] {
			missing++
		}
	}
	fmt.Printf("Tags: %d existing, need %d more\n", len(existing), missing)

	tags := existing
	for _, name := range tagNames {
		if existingNames[name] {
			continue
		}
		tag, err := svcs.Tag.Create(ctx, userID, &domain.Tag{Name: name})
		if err != nil {
			log.Printf("  skip tag %q: %v", name, err)
			continue
		}
		tags = append(tags, tag)
		fmt.Printf("  + %s\n", tag.Name)
	}
	return tags
}

func seedTransactions(
	ctx context.Context,
	svcs *service.Services,
	userID int,
	accounts []*domain.Account,
	categories []*domain.Category,
	tags []*domain.Tag,
) {
	if len(accounts) == 0 {
		log.Println("no accounts available, skipping transactions")
		return
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	totalMonths := monthsBetween(startPeriod, endPeriod)
	total := totalMonths * quantityOfTransactions
	fmt.Printf("Creating ~%d transactions across %d months...\n", total, totalMonths)

	typeWeights := []domain.TransactionType{
		domain.TransactionTypeExpense,
		domain.TransactionTypeExpense,
		domain.TransactionTypeExpense,
		domain.TransactionTypeExpense,
		domain.TransactionTypeIncome,
		domain.TransactionTypeTransfer,
	}

	current := startPeriod
	for !current.After(endPeriod) {
		for range quantityOfTransactions {
			txType := typeWeights[rng.Intn(len(typeWeights))]
			account := accounts[rng.Intn(len(accounts))]
			date := randomDayInMonth(rng, current)
			amount := randomAmount(rng, txType)
			description := randomDescription(rng, txType)

			req := &domain.TransactionCreateRequest{
				TransactionType: txType,
				AccountID:       account.ID,
				Amount:          amount,
				Date:            date,
				Description:     description,
			}

			if txType == domain.TransactionTypeTransfer && len(accounts) > 1 {
				dest := accounts[rng.Intn(len(accounts))]
				for dest.ID == account.ID {
					dest = accounts[rng.Intn(len(accounts))]
				}
				req.DestinationAccountID = &dest.ID
			}

			if txType != domain.TransactionTypeTransfer {
				if len(categories) > 0 && rng.Float32() > 0.1 {
					cat := categories[rng.Intn(len(categories))]
					req.CategoryID = cat.ID
				}
				if len(tags) > 0 && rng.Float32() > 0.5 {
					n := rng.Intn(min(3, len(tags))) + 1
					picked := pickN(rng, tags, n)
					req.Tags = make([]domain.Tag, len(picked))
					for j, t := range picked {
						req.Tags[j] = *t
					}
				}
			}

			if err := svcs.Transaction.Create(ctx, userID, req); err != nil {
				log.Printf("  skip transaction: %v", err)
			}
		}
		current = current.AddDate(0, 1, 0)
	}
	fmt.Printf("  created transactions from %s to %s\n",
		startPeriod.Format("Jan 2006"), endPeriod.Format("Jan 2006"))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func monthsBetween(start, end time.Time) int {
	months := (end.Year()-start.Year())*12 + int(end.Month()) - int(start.Month()) + 1
	if months < 1 {
		return 1
	}
	return months
}

func randomDayInMonth(rng *rand.Rand, month time.Time) time.Time {
	daysInMonth := time.Date(month.Year(), month.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
	day := rng.Intn(daysInMonth) + 1
	return time.Date(month.Year(), month.Month(), day, 12, 0, 0, 0, time.UTC)
}

func randomAmount(rng *rand.Rand, txType domain.TransactionType) int64 {
	switch txType {
	case domain.TransactionTypeIncome:
		// R$ 500 – R$ 8000
		return int64(50000 + rng.Intn(750000))
	case domain.TransactionTypeTransfer:
		// R$ 50 – R$ 2000
		return int64(5000 + rng.Intn(195000))
	default:
		// R$ 5 – R$ 800
		return int64(500 + rng.Intn(79500))
	}
}

func randomDescription(rng *rand.Rand, txType domain.TransactionType) string {
	descs := descriptionsByType[txType]
	return descs[rng.Intn(len(descs))]
}

func pickN[T any](rng *rand.Rand, slice []*T, n int) []*T {
	if n > len(slice) {
		n = len(slice)
	}
	perm := rng.Perm(len(slice))
	result := make([]*T, n)
	for i := 0; i < n; i++ {
		result[i] = slice[perm[i]]
	}
	return result
}

