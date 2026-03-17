// Package docs embeds the OpenAPI specification.
package docs

import _ "embed"

// Spec contains the raw OpenAPI 3.0 YAML specification.
//
//go:embed openapi.yaml
var Spec []byte
