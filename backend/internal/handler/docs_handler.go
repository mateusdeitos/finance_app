package handler

import (
	"net/http"

	_ "github.com/finance_app/backend/docs"
	"github.com/labstack/echo/v4"
	echoswagger "github.com/swaggo/echo-swagger"
)

// RegisterDocsRoutes registers the Swagger UI at GET /docs/index.html
// and redirects /docs to /docs/index.html.
func RegisterDocsRoutes(e *echo.Echo) {
	e.GET("/docs", func(c echo.Context) error {
		return c.Redirect(http.StatusMovedPermanently, "/docs/index.html")
	})
	e.GET("/docs/*", echoswagger.WrapHandler)
}
