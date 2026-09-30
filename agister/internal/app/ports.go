// Package app implements Agister's use cases over the interfaces each of
// them declares beside itself, with only the methods it calls. No interface
// is shared between components. What is left here is data that crosses
// them. It knows no concrete storage, runtime, workspace or diagnostics
// mechanism.
package app

import (
	"context"
	"encoding/json"
	"io/fs"
	"time"
)

// Examples are definitions shipped with Agister, laid out as kind/name.ext.
type Examples = fs.FS

// RuntimeIdentity is what a runtime adapter reports about itself.
type RuntimeIdentity struct {
	Contract string
	Version  string
	// The caller may choose the provider session ID before the turn.
	PresetSessionID bool
	// A turn may continue an earlier session in a new one, leaving the
	// earlier session unchanged. Requires PresetSessionID.
	Resume bool
	// The runtime stops a turn that reaches a cost limit.
	CostLimit bool
}

// TurnRequest is one runtime turn, expressed in primitives, not permissions.
type TurnRequest struct {
	Prompt      string
	Instruction string
	Cwd         string
	SessionID   string
	// The provider session to continue in SessionID; empty for a fresh one.
	ResumeSessionID string
	MaxCostUSD      *float64
	Model           string
	Effort          string
	Primitives      []string
	Timeout         time.Duration
	OutputSchema    json.RawMessage
}

// InputSpec asks one input source for a value.
type InputSpec struct {
	Source string
	Args   map[string]string
	Params map[string]string
	Cwd    string
}

// Resolved is an immutable input value and its identity.
type Resolved struct {
	Value    any    // string or []string
	Identity string // commit, content digest, or the literal
	Revision bool   // Identity is a commit that can be checked out
}

// correlation carries identifying fields for diagnostics through context.
type correlationKey struct{}

// WithCorrelation adds key/value pairs that diagnostics attach to every
// line logged under ctx.
func WithCorrelation(ctx context.Context, keyValues ...any) context.Context {
	existing, _ := ctx.Value(correlationKey{}).([]any)
	return context.WithValue(ctx, correlationKey{}, append(append([]any(nil), existing...), keyValues...))
}

// Correlation returns the pairs added with WithCorrelation.
func Correlation(ctx context.Context) []any {
	values, _ := ctx.Value(correlationKey{}).([]any)
	return values
}
