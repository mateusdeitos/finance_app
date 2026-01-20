package handler

import (
	apperrors "github.com/finance_app/backend/pkg/errors"
)

// HandleServiceError converts a service error to an HTTP error
func HandleServiceError(err error) error {
	if err == nil {
		return nil
	}
	return apperrors.ToHTTPError(err)
}
