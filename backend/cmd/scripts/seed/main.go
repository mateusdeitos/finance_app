// Seed script: populates the local database with realistic test data for a given user.
// Configure the variables below, then run:
//
//	just seed <user-email> [partner-email]
//
// or directly:
//
//	go run cmd/scripts/seed/main.go <user-email> [partner-email]
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

	quantityOfTransactions       = 30 // transactions per month
	quantityOfLinkedTransactions = 5  // linked (split) transactions per month, requires partner email
	quantityOfAccounts           = 3
	quantityOfCategories         = 8

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

var linkedDescriptions = []string{
	"Jantar fora", "Mercado", "Conta de água", "Netflix compartilhado",
	"Aluguel", "Condomínio", "Viagem", "Supermercado", "Restaurante",
}

// ─────────────────────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: seed <user-email> [partner-email]")
	}
	userEmail := os.Args[1]
	var partnerEmail string
	if len(os.Args) >= 3 {
		partnerEmail = os.Args[2]
	}

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

	// Resolve primary user
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

	// Optional: user connection for linked transactions
	var conn *domain.UserConnection
	if partnerEmail != "" {
		partner, err := repos.User.GetByEmail(ctx, partnerEmail)
		if err != nil {
			log.Fatalf("partner %q not found: %v", partnerEmail, err)
		}
		fmt.Printf("Partner user: %s (id=%d)\n", partner.Name, partner.ID)
		conn = seedUserConnection(ctx, svcs, user.ID, partner.ID)
	}

	// Transactions
	seedTransactions(ctx, svcs, user.ID, accounts, categories, tags, conn)

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

// seedUserConnection finds an existing accepted connection between the two users,
// or creates one and accepts it on behalf of the partner.
func seedUserConnection(ctx context.Context, svcs *service.Services, userID, partnerID int) *domain.UserConnection {
	// Search for an existing accepted connection in either direction
	for _, from := range []int{userID, partnerID} {
		to := partnerID
		if from == partnerID {
			to = userID
		}
		conns, err := svcs.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
			FromUserIDs:      []int{from},
			ToUserIDs:        []int{to},
			ConnectionStatus: domain.UserConnectionStatusAccepted,
		})
		if err != nil {
			log.Fatalf("failed to search user connections: %v", err)
		}
		if len(conns) > 0 {
			fmt.Printf("User connection: using existing (id=%d)\n", conns[0].ID)
			return conns[0]
		}
	}

	// Create a new connection (user → partner, 50/50 split)
	splitPct := 50
	conn, err := svcs.UserConnection.Create(ctx, userID, partnerID, splitPct)
	if err != nil {
		log.Fatalf("failed to create user connection: %v", err)
	}

	// Accept it on behalf of the partner
	if err := svcs.UserConnection.UpdateStatus(ctx, partnerID, conn.ID, domain.UserConnectionStatusAccepted); err != nil {
		log.Fatalf("failed to accept user connection: %v", err)
	}

	fmt.Printf("User connection: created and accepted (id=%d)\n", conn.ID)
	return conn
}

func seedTransactions(
	ctx context.Context,
	svcs *service.Services,
	userID int,
	accounts []*domain.Account,
	categories []*domain.Category,
	tags []*domain.Tag,
	conn *domain.UserConnection,
) {
	if len(accounts) == 0 {
		log.Println("no accounts available, skipping transactions")
		return
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	totalMonths := monthsBetween(startPeriod, endPeriod)
	total := totalMonths * quantityOfTransactions
	if conn != nil {
		total += totalMonths * quantityOfLinkedTransactions
	}
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
		// Regular transactions
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

		// Linked (split) transactions
		if conn != nil {
			pct := 50
			for range quantityOfLinkedTransactions {
				account := accounts[rng.Intn(len(accounts))]
				date := randomDayInMonth(rng, current)
				amount := randomAmount(rng, domain.TransactionTypeExpense)
				description := linkedDescriptions[rng.Intn(len(linkedDescriptions))]

				req := &domain.TransactionCreateRequest{
					TransactionType: domain.TransactionTypeExpense,
					AccountID:       account.ID,
					Amount:          amount,
					Date:            date,
					Description:     description,
					SplitSettings: []domain.SplitSettings{
						{ConnectionID: conn.ID, Percentage: &pct},
					},
				}

				if len(categories) > 0 && rng.Float32() > 0.2 {
					cat := categories[rng.Intn(len(categories))]
					req.CategoryID = cat.ID
				}

				if err := svcs.Transaction.Create(ctx, userID, req); err != nil {
					log.Printf("  skip linked transaction: %v", err)
				}
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
