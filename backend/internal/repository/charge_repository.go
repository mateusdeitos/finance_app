package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

// ErrChargeNotPending is returned by ConditionalAccept when the charge was
// not in pending status at the moment of the update. The service layer
// maps this to pkgErrors.AlreadyExists to yield HTTP 409.
var ErrChargeNotPending = errors.New("charge is not pending")

type chargeRepository struct {
	db *gorm.DB
}

func NewChargeRepository(db *gorm.DB) ChargeRepository {
	return &chargeRepository{db: db}
}

func (r *chargeRepository) Create(ctx context.Context, charge *domain.Charge) (*domain.Charge, error) {
	ent := entity.ChargeFromDomain(charge)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *chargeRepository) GetByID(ctx context.Context, id int) (*domain.Charge, error) {
	var ent entity.Charge
	if err := GetTxFromContext(ctx, r.db).First(&ent, id).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *chargeRepository) Update(ctx context.Context, charge *domain.Charge) error {
	ent := entity.ChargeFromDomain(charge)
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}

func (r *chargeRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.Charge{}, id).Error
}

func (r *chargeRepository) Search(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error) {
	var ents []entity.Charge
	query := GetTxFromContext(ctx, r.db)

	if options.Limit > 0 {
		query = query.Limit(options.Limit)
	}
	if options.Offset > 0 {
		query = query.Offset(options.Offset)
	}

	// IDOR gate: UserID must always be set by the caller
	if options.UserID > 0 {
		switch options.Direction {
		case "sent":
			// Charges the caller initiated (regardless of charger/payer role).
			query = query.Where("initiator_user_id = ?", options.UserID)
		case "received":
			// Charges the caller must act on: they are a party but did not initiate.
			query = query.Where("(charger_user_id = ? OR payer_user_id = ?) AND initiator_user_id <> ?", options.UserID, options.UserID, options.UserID)
		default:
			query = query.Where("(charger_user_id = ? OR payer_user_id = ?)", options.UserID, options.UserID)
		}
	}

	if options.Status != "" {
		query = query.Where("status = ?", options.Status)
	}
	if options.ConnectionID > 0 {
		query = query.Where("connection_id = ?", options.ConnectionID)
	}

	if len(options.IDs) > 0 {
		query = query.Where("id IN ?", options.IDs)
	}

	query = query.Order("created_at DESC")

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Charge, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *chargeRepository) ConditionalAccept(ctx context.Context, id int) error {
	result := GetTxFromContext(ctx, r.db).Exec(
		"UPDATE charges SET status = ?, updated_at = NOW() WHERE id = ? AND status = ?",
		domain.ChargeStatusPaid, id, domain.ChargeStatusPending,
	)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrChargeNotPending
	}
	return nil
}

func (r *chargeRepository) ReassignAccountRefs(ctx context.Context, fromAccountID, toAccountID int) error {
	db := GetTxFromContext(ctx, r.db)
	if err := db.Model(&entity.Charge{}).
		Where("charger_account_id = ?", fromAccountID).
		Update("charger_account_id", toAccountID).Error; err != nil {
		return err
	}
	return db.Model(&entity.Charge{}).
		Where("payer_account_id = ?", fromAccountID).
		Update("payer_account_id", toAccountID).Error
}

func (r *chargeRepository) Count(ctx context.Context, options domain.ChargeSearchOptions) (int64, error) {
	var count int64
	query := GetTxFromContext(ctx, r.db).Model(&entity.Charge{})

	if options.UserID > 0 {
		switch options.Direction {
		case "sent":
			// Charges the caller initiated (regardless of charger/payer role).
			query = query.Where("initiator_user_id = ?", options.UserID)
		case "received":
			// Charges the caller must act on: they are a party but did not initiate.
			query = query.Where("(charger_user_id = ? OR payer_user_id = ?) AND initiator_user_id <> ?", options.UserID, options.UserID, options.UserID)
		default:
			query = query.Where("(charger_user_id = ? OR payer_user_id = ?)", options.UserID, options.UserID)
		}
	}

	if options.Status != "" {
		query = query.Where("status = ?", options.Status)
	}
	if options.ConnectionID > 0 {
		query = query.Where("connection_id = ?", options.ConnectionID)
	}

	if err := query.Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}
