package handler

import (
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
)

// HandleServiceError converts a service error to an HTTP error
func HandleServiceError(err error) error {
	if err == nil {
		return nil
	}
	statusCode, message := apperrors.ToHTTPError(err)
	return echo.NewHTTPError(statusCode, message)
}

