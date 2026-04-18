package middleware

import (
	"net/http"

	"github.com/finance_app/backend/pkg/applog"
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
)

type ErrorResponse struct {
	Error   string   `json:"error"`
	Message string   `json:"message,omitempty"`
	Tags    []string `json:"tags,omitempty"`
}

func ErrorHandler(err error, c echo.Context) {
	code := http.StatusInternalServerError
	message := "Internal server error"
	var tags []string

	if tagged, ok := err.(*apperrors.TaggedHTTPError); ok {
		code = tagged.Code
		message = tagged.Message
		tags = tagged.Tags
	} else if he, ok := err.(*echo.HTTPError); ok {
		code = he.Code
		message = he.Message.(string)
	}

	// Append error details to request logger (per D-06).
	// Middleware emits the final log line AFTER this function returns (per D-07).
	if tagged, ok := err.(*apperrors.TaggedHTTPError); ok {
		applog.FromContext(c.Request().Context()).
			With("error_code", http.StatusText(tagged.Code)).
			With("error_message", tagged.Message).
			With("error_tags", tagged.Tags)
	} else if he, ok := err.(*echo.HTTPError); ok {
		applog.FromContext(c.Request().Context()).
			With("error_code", http.StatusText(he.Code)).
			With("error_message", he.Message)
	} else {
		applog.FromContext(c.Request().Context()).
			With("error_message", err.Error())
	}

	response := ErrorResponse{
		Error:   http.StatusText(code),
		Message: message,
		Tags:    tags,
	}

	if !c.Response().Committed {
		if err := c.JSON(code, response); err != nil {
			c.Logger().Error(err)
		}
	}
}
