package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

func ErrorHandler(err error, c echo.Context) {
	code := http.StatusInternalServerError
	message := "Internal server error"

	if he, ok := err.(*echo.HTTPError); ok {
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
	}

	if !c.Response().Committed {
		if err := c.JSON(code, response); err != nil {
			c.Logger().Error(err)
		}
	}
}

