package errors

import (
	"fmt"
	"net/http"

	"github.com/finance_app/backend/internal/domain"
	"github.com/labstack/echo/v4"
)

// ErrorCode represents a service error code
type ErrorCode string

const (
	// ErrCodeNotFound indicates a resource was not found
	ErrCodeNotFound ErrorCode = "NOT_FOUND"
	// ErrCodeAlreadyExists indicates a resource already exists
	ErrCodeAlreadyExists ErrorCode = "ALREADY_EXISTS"
	// ErrCodeUnauthorized indicates authentication failed
	ErrCodeUnauthorized ErrorCode = "UNAUTHORIZED"
	// ErrCodeForbidden indicates the user doesn't have permission
	ErrCodeForbidden ErrorCode = "FORBIDDEN"
	// ErrCodeValidation indicates a validation error
	ErrCodeValidation ErrorCode = "VALIDATION_ERROR"
	// ErrCodeInternal indicates an internal server error
	ErrCodeInternal ErrorCode = "INTERNAL_ERROR"
	// ErrCodeBadRequest indicates a bad request
	ErrCodeBadRequest ErrorCode = "BAD_REQUEST"
)

var (
	ErrMissingDestinationAccount          = NewWithTag(ErrCodeBadRequest, []string{"missing_destination_account"}, "missing destination account")
	ErrSplitSettingsNotAllowedForTransfer = NewWithTag(ErrCodeBadRequest, []string{"split_settings_not_allowed_for_transfer"}, "split settings are not allowed for transfer transactions")
	ErrSplitAllowedOnlyForExpense         = NewWithTag(ErrCodeBadRequest, []string{"split_allowed_only_for_expense"}, "split settings are allowed only for expense transactions")
	ErrAmountMustBeGreaterThanZero        = NewWithTag(ErrCodeBadRequest, []string{"amount_must_be_greater_than_zero"}, "amount must be greater than zero")
	ErrDateIsRequired                     = NewWithTag(ErrCodeBadRequest, []string{"date_is_required"}, "date is required")
	ErrDescriptionIsRequired              = NewWithTag(ErrCodeBadRequest, []string{"description_is_required"}, "description is required")
	ErrTagNameCannotBeEmpty               = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"tag_name_cannot_be_empty", fmt.Sprintf("index_%d", index)}, fmt.Sprintf("tag name cannot be empty at index %d", index))
	}
	ErrInvalidTransactionType = func(transactionType domain.TransactionType) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"invalid_transaction_type"}, fmt.Sprintf("invalid transaction type: %s", transactionType))
	}
	ErrInvalidAccountID      = NewWithTag(ErrCodeBadRequest, []string{"invalid_account_id"}, "invalid account ID")
	ErrInvalidCategoryID     = NewWithTag(ErrCodeBadRequest, []string{"invalid_category_id"}, "invalid category ID")
	ErrInvalidRecurrenceType = func(recurrenceType domain.RecurrenceType) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"invalid_recurrence_type"}, fmt.Sprintf("invalid recurrence type: %s", recurrenceType))
	}
	ErrRecurrenceEndDateOrRepetitionsIsRequired            = NewWithTag(ErrCodeBadRequest, []string{"recurrence_end_date_or_repetitions_is_required"}, "recurrence end date or repetitions is required")
	ErrRecurrenceEndDateMustBeAfterTransactionDate         = NewWithTag(ErrCodeBadRequest, []string{"recurrence_end_date_must_be_after_transaction_date"}, "recurrence end date must be after transaction date")
	ErrRecurrenceEndDateAndRepetitionsCannotBeUsedTogether = NewWithTag(ErrCodeBadRequest, []string{"recurrence_end_date_and_repetitions_cannot_be_used_together"}, "recurrence end date and repetitions cannot be used together")
	ErrRecurrenceRepetitionsMustBePositive                 = NewWithTag(ErrCodeBadRequest, []string{"recurrence_repetitions_must_be_positive"}, "recurrence repetitions must be positive")
	ErrRecurrenceRepetitionsMustBeLessThanOrEqualTo        = func(maxValue int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"recurrence_repetitions_must_be_less_than_or_equal_to"}, fmt.Sprintf("recurrence repetitions must be less than or equal to %d", maxValue))
	}
	ErrSplitSettingInvalidConnectionID = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"split_setting_invalid_connection_id"}, fmt.Sprintf("split setting invalid connection ID at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingPercentageOrAmountIsRequired = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"split_setting_percentage_or_amount_is_required"}, fmt.Sprintf("split setting percentage or amount is required at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingPercentageAndAmountCannotBeUsedTogether = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"split_setting_percentage_and_amount_cannot_be_used_together"}, fmt.Sprintf("split setting percentage and amount cannot be used together at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingPercentageMustBeBetween1And100 = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"split_setting_percentage_must_be_between_1_and_100"}, fmt.Sprintf("split setting percentage must be between 1 and 100 at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingAmountMustBeGreaterThanZero = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"split_setting_amount_must_be_greater_than_zero"}, fmt.Sprintf("split setting amount must be greater than zero at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingInvalidDestinationAccountID = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"split_setting_invalid_destination_account_id"}, fmt.Sprintf("split setting invalid destination account ID at index %d", index)).AddIndex(index)
	}
	ErrFailedToCreateTag = func(index int) *ServiceError {
		return NewWithTag(ErrCodeInternal, []string{"failed_to_create_tag"}, fmt.Sprintf("failed to create tag at index %d", index)).AddIndex(index)
	}
	ErrInvalidPeriod = func(period domain.Period) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"invalid_period"}, fmt.Sprintf("invalid period: %s", period.String()))
	}
	ErrInvalidPropagationSettings = func(propagationSettings domain.TransactionPropagationSettings) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{"invalid_propagation_settings"}, fmt.Sprintf("invalid propagation settings: %s", propagationSettings))
	}
	ErrParentTransactionBelongsToAnotherUser = NewWithTag(ErrCodeForbidden, []string{"parent_transaction_belongs_to_another_user"}, "parent transaction belongs to another user")
)

// ServiceError represents a service-level error with a code and message
type ServiceError struct {
	Code    ErrorCode
	Message string
	Err     error // wrapped error for context
	Tags    []string
}

type ServiceErrors []*ServiceError

func (es ServiceErrors) Error() string {
	return fmt.Sprintf("%s: %s", es[0].Code, es[0].Message)
}

func (es ServiceErrors) Unwrap() error {
	return es[0].Err
}

// Error implements the error interface
func (e *ServiceError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap returns the wrapped error
func (e *ServiceError) Unwrap() error {
	return e.Err
}

func (e *ServiceError) ToHTTPError() *echo.HTTPError {
	return ToHTTPError(e)
}

func (e *ServiceError) AddTag(tag string) *ServiceError {
	e.Tags = append(e.Tags, tag)
	return e
}

func (e *ServiceError) AddIndex(index int) *ServiceError {
	e.Tags = append(e.Tags, fmt.Sprintf("index_%d", index))
	return e
}

func NewWithTag(code ErrorCode, tags []string, message string) *ServiceError {
	return &ServiceError{
		Code:    code,
		Message: message,
		Tags:    tags,
	}
}

// New creates a new ServiceError
func New(code ErrorCode, message string) *ServiceError {
	return &ServiceError{
		Code:    code,
		Message: message,
	}
}

// Wrap creates a new ServiceError wrapping an existing error
func Wrap(code ErrorCode, message string, err error) *ServiceError {
	return &ServiceError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

// IsServiceError checks if an error is a ServiceError
func IsServiceError(err error) bool {
	_, ok := err.(*ServiceError)
	return ok
}

// AsServiceError extracts a ServiceError from an error
func AsServiceError(err error) (*ServiceError, bool) {
	serviceErr, ok := err.(*ServiceError)
	return serviceErr, ok
}

// ToHTTPError converts a service error to an HTTP error
// Returns the HTTP status code and error message
func ToHTTPError(err error) *echo.HTTPError {
	serviceErr, ok := AsServiceError(err)
	if !ok {
		// If it's not a ServiceError, treat it as internal error
		return echo.NewHTTPError(http.StatusInternalServerError, "Internal server error")
	}

	switch serviceErr.Code {
	case ErrCodeNotFound:
		return echo.NewHTTPError(http.StatusNotFound, serviceErr.Message)
	case ErrCodeAlreadyExists:
		return echo.NewHTTPError(http.StatusConflict, serviceErr.Message)
	case ErrCodeUnauthorized:
		return echo.NewHTTPError(http.StatusUnauthorized, serviceErr.Message)
	case ErrCodeForbidden:
		return echo.NewHTTPError(http.StatusForbidden, serviceErr.Message)
	case ErrCodeValidation:
		return echo.NewHTTPError(http.StatusBadRequest, serviceErr.Message)
	case ErrCodeBadRequest:
		return echo.NewHTTPError(http.StatusBadRequest, serviceErr.Message)
	case ErrCodeInternal:
		return echo.NewHTTPError(http.StatusInternalServerError, serviceErr.Message)
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "Internal server error")
	}
}

// Helper functions for common errors

// NotFound creates a NOT_FOUND error
func NotFound(resource string) *ServiceError {
	return New(ErrCodeNotFound, fmt.Sprintf("%s not found", resource))
}

// AlreadyExists creates an ALREADY_EXISTS error
func AlreadyExists(resource string) *ServiceError {
	return New(ErrCodeAlreadyExists, fmt.Sprintf("%s already exists", resource))
}

// Unauthorized creates an UNAUTHORIZED error
func Unauthorized(message string) *ServiceError {
	if message == "" {
		message = "Unauthorized"
	}
	return New(ErrCodeUnauthorized, message)
}

// Forbidden creates a FORBIDDEN error
func Forbidden(message string) *ServiceError {
	if message == "" {
		message = "Forbidden"
	}
	return New(ErrCodeForbidden, message)
}

// Validation creates a VALIDATION_ERROR
func Validation(message string) *ServiceError {
	return New(ErrCodeValidation, message)
}

// Internal creates an INTERNAL_ERROR wrapping an error
func Internal(message string, err error) *ServiceError {
	return Wrap(ErrCodeInternal, message, err)
}

// BadRequest creates a BAD_REQUEST error
func BadRequest(message string) *ServiceError {
	return New(ErrCodeBadRequest, message)
}
