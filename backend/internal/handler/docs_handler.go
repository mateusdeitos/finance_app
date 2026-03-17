package handler

import (
	"net/http"

	"github.com/finance_app/backend/docs"
	"github.com/labstack/echo/v4"
)

// RegisterDocsRoutes registers the Swagger UI and OpenAPI spec endpoints.
//
//	GET /docs           → Swagger UI (HTML)
//	GET /docs/openapi.yaml → raw OpenAPI 3.0 spec
func RegisterDocsRoutes(e *echo.Echo) {
	e.GET("/docs", serveSwaggerUI)
	e.GET("/docs/openapi.yaml", serveOpenAPISpec)
}

func serveOpenAPISpec(c echo.Context) error {
	return c.Blob(http.StatusOK, "application/yaml", docs.Spec)
}

func serveSwaggerUI(c echo.Context) error {
	html := `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Finance App – API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/docs/openapi.yaml",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      deepLinking: true,
      tryItOutEnabled: true,
      withCredentials: true,
    });
  </script>
</body>
</html>`
	return c.HTML(http.StatusOK, html)
}
