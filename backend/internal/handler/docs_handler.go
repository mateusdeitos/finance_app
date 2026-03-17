package handler

import (
	_ "github.com/finance_app/backend/docs"
	echoswagger "github.com/swaggo/echo-swagger"
	"github.com/labstack/echo/v4"
)

// RegisterDocsRoutes registers the Swagger UI at GET /docs/*
func RegisterDocsRoutes(e *echo.Echo) {
	e.GET("/docs/*", echoswagger.WrapHandler)
}
