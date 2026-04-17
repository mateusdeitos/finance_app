package applog

import (
	"context"

	"github.com/rs/zerolog"
)

type contextKey struct{}

// Logger wraps a *zerolog.Logger stored by pointer so field accumulation
// mutates the single logger instance in the context.
type Logger struct {
	l *zerolog.Logger
}

// WithLogger stores a zerolog.Logger pointer in the context.
func WithLogger(ctx context.Context, logger *zerolog.Logger) context.Context {
	return context.WithValue(ctx, contextKey{}, &Logger{l: logger})
}

// FromContext retrieves the request-scoped logger.
// Returns a no-op logger if none is set (safe for unit tests).
func FromContext(ctx context.Context) *Logger {
	if v, ok := ctx.Value(contextKey{}).(*Logger); ok {
		return v
	}
	nop := zerolog.Nop()
	return &Logger{l: &nop}
}

// With adds a field to the accumulated logger.
// Mutates the stored pointer so all future calls (including the final
// middleware emission) see the field. Returns self for chaining.
func (lg *Logger) With(key string, value interface{}) *Logger {
	updated := lg.l.With().Interface(key, value).Logger()
	lg.l = &updated
	return lg
}

// Debug returns a zerolog.Event at debug level carrying all accumulated fields.
func (lg *Logger) Debug() *zerolog.Event { return lg.l.Debug() }

// Info returns a zerolog.Event at info level carrying all accumulated fields.
func (lg *Logger) Info() *zerolog.Event { return lg.l.Info() }

// Warn returns a zerolog.Event at warn level carrying all accumulated fields.
func (lg *Logger) Warn() *zerolog.Event { return lg.l.Warn() }

// Error returns a zerolog.Event at error level carrying all accumulated fields.
func (lg *Logger) Error() *zerolog.Event { return lg.l.Error() }

// Zerolog returns the underlying *zerolog.Logger for the middleware to emit
// the final log line with dynamic level selection.
func (lg *Logger) Zerolog() *zerolog.Logger { return lg.l }
