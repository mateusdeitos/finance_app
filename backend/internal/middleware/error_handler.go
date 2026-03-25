package middleware

import (
	"net/http"

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

	// Log error in production
	if !c.Echo().Debug {
		c.Logger().Error(err)
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
