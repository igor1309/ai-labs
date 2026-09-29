// Package app implements Agister's use cases over ports it declares. It
// knows no concrete storage, runtime, workspace or diagnostics mechanism.
package app

import (
	"context"
	"encoding/json"
	"io/fs"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/constraint"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// DefinitionSource supplies definition documents and their origin.
type DefinitionSource interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
}

// DefinitionWriter stores definition documents.
type DefinitionWriter interface {
	// Write stores data only over the document with digest expected, or
	// where there is none when expected is empty; otherwise it writes
	// nothing and written is false.
	Write(ctx context.Context, kind definition.Kind, name string, data []byte, expected string) (path string, written bool, err error)
	// Current reports where a document would be stored and a digest of the
	// one there, empty when there is none.
	Current(ctx context.Context, kind definition.Kind, name string) (path, digest string, err error)
}

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

// EventSink receives a turn's events and raw runtime output.
type EventSink interface {
	Event(source, kind string, data map[string]any)
	// ProcessStarted records the runtime's process as soon as it exists, as
	// a reference only the runtime adapter can read (Processes.Reap takes
	// it back). It may be reported again as more becomes known; the last
	// report stands. An error means the process is not on record, so
	// nobody could find it after a crash: the runtime adapter must end it
	// and fail the turn.
	ProcessStarted(ref string) error
	Raw(line string)
}

// TurnRunner drives one runtime. It knows nothing of permissions, policies
// or processes.
type TurnRunner interface {
	Identity(ctx context.Context) (RuntimeIdentity, error)
	RunTurn(ctx context.Context, request TurnRequest, sink EventSink) run.Turn
}

// Runtimes builds the runner for an adapter name and runtime command.
type Runtimes interface {
	Runner(adapter, command string) (TurnRunner, error)
	Adapters() []string
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

// InputProvider resolves one kind of input source.
type InputProvider interface {
	Resolve(ctx context.Context, spec InputSpec) (Resolved, error)
}

// Workspaces locates repositories and provides isolated checkouts.
type Workspaces interface {
	Root(ctx context.Context, cwd string) (string, error)
	Checkout(ctx context.Context, repository, revision string) (dir string, release func() error, err error)
	// Changes returns everything in a checkout that differs from revision,
	// committed or not, as a patch; empty when nothing does.
	Changes(ctx context.Context, dir, revision string) ([]byte, error)
}

// CheckoutDiscarder removes checkouts whose owner ended without releasing
// them.
type CheckoutDiscarder interface {
	// Discard removes a checkout that Checkout made. A checkout already
	// gone is success; a directory Checkout could not have made is refused.
	Discard(ctx context.Context, repository, dir string) error
}

// Reaping is what Reap found of a process.
type Reaping string

const (
	ReapKilled Reaping = "killed" // the process was killed
	ReapGone   Reaping = "gone"   // no such process
	ReapLeft   Reaping = "left"   // not killed: it is not known to be the recorded one, or the reference is not understood
)

// Processes ends the runtime processes a dead owner left behind. What a
// reference means is the adapter's own: the core only stores and returns it.
type Processes interface {
	// Reap ends the process the reference names, unless it may be another
	// one by now. A reference the adapter did not make is ReapLeft, with an
	// error.
	Reap(ctx context.Context, ref string) (Reaping, error)
}

// Provenance returns the recorded writer of a revision, or nil.
type Provenance interface {
	Writer(ctx context.Context, revision string) (*constraint.Writer, error)
}

// OutputValidator compiles JSON Schema documents and checks output
// against them.
type OutputValidator interface {
	Compile(schema []byte) error
	Validate(schema []byte, output json.RawMessage) error
}

// RunRecorder creates run records owned by the calling process.
type RunRecorder interface {
	Create(ctx context.Context, record run.Record) (RunHandle, error)
}

// RunHandle writes one run's evidence. Finish releases ownership.
type RunHandle interface {
	Append(event run.Event) error
	Raw(line string) error
	Update(record run.Record) error
	// Artifact stores a file the call produced beside its evidence.
	Artifact(name string, data []byte) (run.Artifact, error)
	Finish(record run.Record) error
}

// RunAdopter takes over runs whose owner ended.
type RunAdopter interface {
	// Abandoned lists the unfinished runs nobody owns that recorded effects.
	Abandoned(ctx context.Context) ([]run.Record, error)
	// LiveCheckouts lists the checkout directories that runs some process
	// still owns record, so nobody removes them from under those runs.
	LiveCheckouts(ctx context.Context) ([]string, error)
	// Adopt takes ownership of an abandoned run, as its record is now. It
	// fails if the run is owned by another process or finished.
	Adopt(ctx context.Context, id string) (RunHandle, run.Record, error)
}

// RunLookup reads one run's evidence. A record that is not finished and no
// longer owned reads as abandoned.
type RunLookup interface {
	Get(ctx context.Context, id string) (run.Record, run.State, error)
}

// RunReader reads evidence.
type RunReader interface {
	RunLookup
	Events(ctx context.Context, id string, afterSeq int) ([]run.Event, run.State, error)
	List(ctx context.Context) ([]run.Record, error)
}

type Clock interface{ Now() time.Time }

type IDs interface {
	RunID(now time.Time) string
	SessionID() string
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
