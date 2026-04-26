package errors

import (
	"fmt"
	"net/http"
	"slices"
	"strings"

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

type ErrorTag string

const (
	ErrorTagIndex                                               ErrorTag = "INDEX_%d"
	ErrorTagMissingDestinationAccount                           ErrorTag = "TRANSACTION.MISSING_DESTINATION_ACCOUNT"
	ErrorTagSplitSettingsNotAllowedForTransfer                  ErrorTag = "TRANSACTION.SPLIT_SETTINGS_NOT_ALLOWED_FOR_TRANSFER"
	ErrorTagAmountMustBeGreaterThanZero                         ErrorTag = "TRANSACTION.AMOUNT_MUST_BE_GREATER_THAN_ZERO"
	ErrorTagDateIsRequired                                      ErrorTag = "TRANSACTION.DATE_IS_REQUIRED"
	ErrorTagDescriptionIsRequired                               ErrorTag = "TRANSACTION.DESCRIPTION_IS_REQUIRED"
	ErrorTagInvalidTransactionType                              ErrorTag = "TRANSACTION.INVALID_TRANSACTION_TYPE"
	ErrorTagInvalidAccountID                                    ErrorTag = "TRANSACTION.INVALID_ACCOUNT_ID"
	ErrorTagInvalidCategoryID                                   ErrorTag = "TRANSACTION.INVALID_CATEGORY_ID"
	ErrorTagInvalidRecurrenceType                               ErrorTag = "TRANSACTION.INVALID_RECURRENCE_TYPE"
	ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne            ErrorTag = "TRANSACTION.RECURRENCE_CURRENT_INSTALLMENT_MUST_BE_AT_LEAST_ONE"
	ErrorTagRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent ErrorTag = "TRANSACTION.RECURRENCE_TOTAL_INSTALLMENTS_MUST_BE_GREATER_OR_EQUAL_TO_CURRENT"
	ErrorTagRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo      ErrorTag = "TRANSACTION.RECURRENCE_TOTAL_INSTALLMENTS_MUST_BE_LESS_THAN_OR_EQUAL_TO"
	ErrorTagSplitSettingInvalidConnectionID                     ErrorTag = "TRANSACTION.SPLIT_SETTING_INVALID_CONNECTION_ID"
	ErrorTagSplitSettingPercentageOrAmountIsRequired            ErrorTag = "TRANSACTION.SPLIT_SETTING_PERCENTAGE_OR_AMOUNT_IS_REQUIRED"
	ErrorTagSplitSettingPercentageAndAmountCannotBeUsedTogether ErrorTag = "TRANSACTION.SPLIT_SETTING_PERCENTAGE_AND_AMOUNT_CANNOT_BE_USED_TOGETHER"
	ErrorTagSplitSettingPercentageMustBeBetween1And100          ErrorTag = "TRANSACTION.SPLIT_SETTING_PERCENTAGE_MUST_BE_BETWEEN_1_AND_100"
	ErrorTagSplitSettingAmountMustBeGreaterThanZero             ErrorTag = "TRANSACTION.SPLIT_SETTING_AMOUNT_MUST_BE_GREATER_THAN_ZERO"
	ErrorTagSplitSettingInvalidDestinationAccountID             ErrorTag = "TRANSACTION.SPLIT_SETTING_INVALID_DESTINATION_ACCOUNT_ID"
	ErrorTagSplitSettingsNotAllowedOnSharedAccount              ErrorTag = "TRANSACTION.SPLIT_SETTINGS_NOT_ALLOWED_ON_SHARED_ACCOUNT"
	ErrorTagTransferNotAllowedOnSharedAccount                   ErrorTag = "TRANSACTION.TRANSFER_NOT_ALLOWED_ON_SHARED_ACCOUNT"
	ErrorTagInvalidPeriod                                       ErrorTag = "TRANSACTION.INVALID_PERIOD"
	ErrorTagInvalidPropagationSettings                          ErrorTag = "TRANSACTION.INVALID_PROPAGATION_SETTINGS"
	ErrorTagParentTransactionBelongsToAnotherUser               ErrorTag = "TRANSACTION.PARENT_TRANSACTION_BELONGS_TO_ANOTHER_USER"
	ErrorTagAccountCannotBeChangedForSharedTransactions         ErrorTag = "TRANSACTION.ACCOUNT_CANNOT_BE_CHANGED_FOR_SHARED_TRANSACTIONS"
	ErrorTagChildTransactionCannotBeUpdated                     ErrorTag = "TRANSACTION.CHILD_TRANSACTION_CANNOT_BE_UPDATED"
	ErrorTagLinkedTransactionDisallowedFieldChanged             ErrorTag = "TRANSACTION.LINKED_TRANSACTION_DISALLOWED_FIELD_CHANGED"

	ErrorTagTagNameCannotBeEmpty ErrorTag = "TAG.NAME_CANNOT_BE_EMPTY"
	ErrorTagFailedToCreateTag    ErrorTag = "TAG.FAILED_TO_CREATE"

	ErrorTagDuplicateCategoryName      ErrorTag = "CATEGORY.DUPLICATE_NAME"
	ErrorTagInvalidReplacementCategory ErrorTag = "CATEGORY.INVALID_REPLACEMENT"

	ErrorTagImportEmptyFile       ErrorTag = "IMPORT.EMPTY_FILE"
	ErrorTagImportInvalidLayout   ErrorTag = "IMPORT.INVALID_LAYOUT"
	ErrorTagImportMaxRowsExceeded ErrorTag = "IMPORT.MAX_ROWS_EXCEEDED"
	ErrorTagImportNoRows          ErrorTag = "IMPORT.NO_ROWS"
)

var (
	ErrMissingDestinationAccount          = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagMissingDestinationAccount)}, "missing destination account")
	ErrSplitSettingsNotAllowedForTransfer      = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingsNotAllowedForTransfer)}, "split settings are not allowed for transfer transactions")
	ErrSplitSettingsNotAllowedOnSharedAccount  = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingsNotAllowedOnSharedAccount)}, "split settings are not allowed on shared accounts")
	ErrTransferNotAllowedOnSharedAccount       = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagTransferNotAllowedOnSharedAccount)}, "transfers are not allowed on shared accounts")
	ErrAmountMustBeGreaterThanZero        = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagAmountMustBeGreaterThanZero)}, "amount must be greater than zero")
	ErrDateIsRequired                     = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagDateIsRequired)}, "date is required")
	ErrDescriptionIsRequired              = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagDescriptionIsRequired)}, "description is required")
	ErrTagNameCannotBeEmpty               = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagTagNameCannotBeEmpty), fmt.Sprintf(string(ErrorTagIndex), index)}, fmt.Sprintf("tag name cannot be empty at index %d", index))
	}
	ErrInvalidTransactionType = func(transactionType domain.TransactionType) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagInvalidTransactionType)}, fmt.Sprintf("invalid transaction type: %s", transactionType))
	}
	ErrInvalidAccountID      = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagInvalidAccountID)}, "invalid account ID")
	ErrInvalidCategoryID     = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagInvalidCategoryID)}, "invalid category ID")
	ErrInvalidRecurrenceType = func(recurrenceType domain.RecurrenceType) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagInvalidRecurrenceType)}, fmt.Sprintf("invalid recurrence type: %s", recurrenceType))
	}
	ErrRecurrenceCurrentInstallmentMustBeAtLeastOne             = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne)}, "recurrence current_installment must be at least 1")
	ErrRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent)}, "recurrence total_installments must be greater than or equal to current_installment")
	ErrRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo       = func(maxValue int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo)}, fmt.Sprintf("recurrence total_installments must be less than or equal to %d", maxValue))
	}
	ErrSplitSettingInvalidConnectionID = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingInvalidConnectionID)}, fmt.Sprintf("split setting invalid connection ID at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingPercentageOrAmountIsRequired = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingPercentageOrAmountIsRequired)}, fmt.Sprintf("split setting percentage or amount is required at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingPercentageAndAmountCannotBeUsedTogether = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingPercentageAndAmountCannotBeUsedTogether)}, fmt.Sprintf("split setting percentage and amount cannot be used together at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingPercentageMustBeBetween1And100 = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingPercentageMustBeBetween1And100)}, fmt.Sprintf("split setting percentage must be between 1 and 100 at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingAmountMustBeGreaterThanZero = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingAmountMustBeGreaterThanZero)}, fmt.Sprintf("split setting amount must be greater than zero at index %d", index)).AddIndex(index)
	}
	ErrSplitSettingInvalidDestinationAccountID = func(index int) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagSplitSettingInvalidDestinationAccountID)}, fmt.Sprintf("split setting invalid destination account ID at index %d", index)).AddIndex(index)
	}
	ErrFailedToCreateTag = func(index int) *ServiceError {
		return NewWithTag(ErrCodeInternal, []string{string(ErrorTagFailedToCreateTag)}, fmt.Sprintf("failed to create tag at index %d", index)).AddIndex(index)
	}
	ErrInvalidPeriod = func(period domain.Period) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagInvalidPeriod)}, fmt.Sprintf("invalid period: %s", period.String()))
	}
	ErrInvalidPropagationSettings = func(propagationSettings domain.TransactionPropagationSettings) *ServiceError {
		return NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagInvalidPropagationSettings)}, fmt.Sprintf("invalid propagation settings: %s", propagationSettings))
	}
	ErrParentTransactionBelongsToAnotherUser       = NewWithTag(ErrCodeForbidden, []string{string(ErrorTagParentTransactionBelongsToAnotherUser)}, "parent transaction belongs to another user")
	ErrAccountCannotBeChangedForSharedTransactions  = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagAccountCannotBeChangedForSharedTransactions)}, "account cannot be changed for shared transactions")
	ErrChildTransactionCannotBeUpdated              = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagChildTransactionCannotBeUpdated)}, "child transaction cannot be updated")
	ErrLinkedTransactionDisallowedFieldChanged      = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagLinkedTransactionDisallowedFieldChanged)}, "linked transactions can only edit date, description, category, and tags")
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
	var msg strings.Builder
	for _, err := range es {
		fmt.Fprintf(&msg, "%s: %s\n", err.Code, err.Message)
	}
	return msg.String()
}

func Is(errs error, target ServiceError) bool {
	sErrs, ok := errs.(ServiceErrors)
	if !ok {
		return false
	}

	for _, err := range sErrs {
		for _, tag := range err.Tags {
			if slices.Contains(target.Tags, tag) {
				return true
			}
		}
	}
	return false
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

func (e *ServiceError) ToHTTPError() error {
	return ToHTTPError(e)
}

// TaggedHTTPError is an HTTP error that also carries structured error tags
// so the error handler can serialize them in the response.
type TaggedHTTPError struct {
	Code    int
	Message string
	Tags    []string
}

func (e *TaggedHTTPError) Error() string {
	return fmt.Sprintf("code=%d, message=%s", e.Code, e.Message)
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

// ToHTTPError converts a service error to an HTTP error.
// Handles both *ServiceError and ServiceErrors (slice).
// For ServiceErrors, tags from all errors are merged into a TaggedHTTPError.
func ToHTTPError(err error) error {
	// Handle ServiceErrors (slice of *ServiceError) first
	serviceErrs, ok := err.(ServiceErrors)
	if ok && len(serviceErrs) > 0 {
		first := serviceErrs[0]
		code := serviceErrHTTPCode(first.Code)
		// Collect all tags, deduplicated
		seen := make(map[string]struct{})
		var tags []string
		for _, se := range serviceErrs {
			for _, t := range se.Tags {
				if _, exists := seen[t]; !exists {
					seen[t] = struct{}{}
					tags = append(tags, t)
				}
			}
		}
		return &TaggedHTTPError{Code: code, Message: first.Message, Tags: tags}
	}

	serviceErr, ok := AsServiceError(err)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "Internal server error")
	}

	if len(serviceErr.Tags) > 0 {
		return &TaggedHTTPError{
			Code:    serviceErrHTTPCode(serviceErr.Code),
			Message: serviceErr.Message,
			Tags:    serviceErr.Tags,
		}
	}

	return echo.NewHTTPError(serviceErrHTTPCode(serviceErr.Code), serviceErr.Message)
}

func serviceErrHTTPCode(code ErrorCode) int {
	switch code {
	case ErrCodeNotFound:
		return http.StatusNotFound
	case ErrCodeAlreadyExists:
		return http.StatusConflict
	case ErrCodeUnauthorized:
		return http.StatusUnauthorized
	case ErrCodeForbidden:
		return http.StatusForbidden
	case ErrCodeValidation, ErrCodeBadRequest:
		return http.StatusBadRequest
	case ErrCodeInternal:
		return http.StatusInternalServerError
	default:
		return http.StatusInternalServerError
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

var (
	ErrImportEmptyFile       = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagImportEmptyFile)}, "the file is empty")
	ErrImportInvalidLayout   = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagImportInvalidLayout)}, "invalid CSV layout: missing required columns")
	ErrImportMaxRowsExceeded = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagImportMaxRowsExceeded)}, "CSV file cannot have more than 100 rows")
	ErrImportNoRows          = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagImportNoRows)}, "CSV file has no data rows")
)

// IsNotFound checks if an error is a NOT_FOUND error
func IsNotFound(err error) bool {
	serviceErr, ok := AsServiceError(err)
	return ok && serviceErr.Code == ErrCodeNotFound
}
