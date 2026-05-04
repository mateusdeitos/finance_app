package pkg

import (
	"strings"

	"github.com/samber/lo"
)

func IsAllowedOrigin(allowedOrigins []string, origin string) bool {
	match := lo.SomeBy(allowedOrigins, func(allowedOrigin string) bool {
		if allowedOrigin == origin {
			return true
		}

		parts := strings.Split(allowedOrigin, "*")
		if len(parts) != 2 {
			return false
		}

		prefix, suffix := parts[0], parts[1]

		return strings.HasPrefix(origin, prefix) && strings.HasSuffix(origin, suffix)
	})

	return match
}
