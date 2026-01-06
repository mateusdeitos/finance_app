package errors

import (
	"fmt"
	"net/http"
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

// ServiceError represents a service-level error with a code and message
type ServiceError struct {
	Code    ErrorCode
	Message string
	Err     error // wrapped error for context
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
func ToHTTPError(err error) (int, string) {
	serviceErr, ok := AsServiceError(err)
	if !ok {
		// If it's not a ServiceError, treat it as internal error
		return http.StatusInternalServerError, "Internal server error"
	}

	switch serviceErr.Code {
	case ErrCodeNotFound:
		return http.StatusNotFound, serviceErr.Message
	case ErrCodeAlreadyExists:
		return http.StatusConflict, serviceErr.Message
	case ErrCodeUnauthorized:
		return http.StatusUnauthorized, serviceErr.Message
	case ErrCodeForbidden:
		return http.StatusForbidden, serviceErr.Message
	case ErrCodeValidation:
		return http.StatusBadRequest, serviceErr.Message
	case ErrCodeBadRequest:
		return http.StatusBadRequest, serviceErr.Message
	case ErrCodeInternal:
		return http.StatusInternalServerError, serviceErr.Message
	default:
		return http.StatusInternalServerError, "Internal server error"
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
