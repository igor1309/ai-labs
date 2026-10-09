package claude_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/warder/internal/claude"
)

// executorStub records every Execute and answers each with what the test
// set: an output, an error, or both. Like a cancellable command it answers
// a context that is done with that context's error. It fills in nothing
// else.
type executorStub struct {
	output string
	err    error
	calls  []execution
}

type execution struct {
	ctx  context.Context
	name string
	args []string
}

func (s *executorStub) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	s.calls = append(s.calls, execution{ctx: ctx, name: name, args: slices.Clone(args)})
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return []byte(s.output), s.err
}

func newAdapter(t *testing.T, executor claude.CommandExecutor) *claude.Adapter {
	t.Helper()
	adapter, err := claude.New(executor)
	if err != nil {
		t.Fatal(err)
	}
	return adapter
}

// readOutput is one read of the given output of `claude agents --json`.
func readOutput(t *testing.T, output string) ([]claude.Agent, error) {
	t.Helper()
	return newAdapter(t, &executorStub{output: output}).ReadAgents(t.Context())
}

// assertNoRead fails unless the read failed, with an error that says why
// and no agents.
func assertNoRead(t *testing.T, agents []claude.Agent, err error, why string) {
	t.Helper()
	if err == nil {
		t.Fatalf("ReadAgents returned no error, and the agents %v", agents)
	}
	if !strings.Contains(err.Error(), why) {
		t.Errorf("got the error %q, want one that says %q", err, why)
	}
	if agents != nil {
		t.Errorf("ReadAgents returned the agents %v with its error", agents)
	}
}

// executeFunc is an executor made of a function, so a nil one is a typed
// nil.
type executeFunc func(ctx context.Context, name string, args ...string) ([]byte, error)

func (f executeFunc) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	return f(ctx, name, args...)
}

// executeMap, executeSlice and executeChan are executors of the other
// kinds whose nil is a typed nil.
type executeMap map[string]string

func (m executeMap) Execute(context.Context, string, ...string) ([]byte, error) { return nil, nil }

type executeSlice []byte

func (s executeSlice) Execute(context.Context, string, ...string) ([]byte, error) { return nil, nil }

type executeChan chan []byte

func (c executeChan) Execute(context.Context, string, ...string) ([]byte, error) { return nil, nil }

// A missing executor, nil or a typed nil carried by CommandExecutor, fails
// at construction.
func TestNewRejectsAMissingExecutor(t *testing.T) {
	t.Parallel()
	for name, executor := range map[string]claude.CommandExecutor{
		"nil":              nil,
		"nil pointer":      (*executorStub)(nil),
		"nil execute func": executeFunc(nil),
		"nil map":          executeMap(nil),
		"nil slice":        executeSlice(nil),
		"nil chan":         executeChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			adapter, err := claude.New(executor)
			if err == nil {
				t.Fatal("New returned no error")
			}
			if adapter != nil {
				t.Errorf("New returned an adapter: %v", adapter)
			}
		})
	}
}

// A read is one execution of exactly `claude agents --json`, under the
// context the read was given.
func TestReadAgentsExecutesClaudeAgentsJSONUnderItsContext(t *testing.T) {
	t.Parallel()
	stub := &executorStub{output: `[]`}
	adapter := newAdapter(t, stub)
	type readKey struct{}
	ctx := context.WithValue(t.Context(), readKey{}, "this read")

	if _, err := adapter.ReadAgents(ctx); err != nil {
		t.Fatal(err)
	}

	if len(stub.calls) != 1 {
		t.Fatalf("got %d executions, want 1", len(stub.calls))
	}
	call := stub.calls[0]
	if command := append([]string{call.name}, call.args...); !slices.Equal(command, []string{"claude", "agents", "--json"}) {
		t.Errorf("executed %q, want claude agents --json", command)
	}
	if call.ctx != ctx {
		t.Errorf("executed under the context %v, want the read's %v", call.ctx, ctx)
	}
}

// observedSessions is what `claude agents --json` printed on Claude Code
// 2.1.295 (2026-10-09): one background session and two interactive ones.
const observedSessions = `[
  {"id":"98d188e1","kind":"background","startedAt":1789467434551,"sessionId":"98d188e1-53ea-420a-b7de-f7ad912ff2b9","cwd":"/x","name":"n","state":"blocked"},
  {"pid":935,"kind":"interactive","startedAt":1791532718395,"sessionId":"bff7633e-c748-44d1-bf38-3633cbca707f","cwd":"/x","name":"n","status":"idle"},
  {"pid":1867,"kind":"interactive","startedAt":1791557631293,"sessionId":"91a3675b-0202-465e-a0ef-4447d733b792","cwd":"/x","name":"n","status":"busy"}
]
`

// The observed output is read as one agent per session, in its order, each
// with its sessionId as its ID, and its other fields ignored. The states
// are the contract's literal values, not the package's constants, so a
// constant whose value changes fails here.
func TestReadAgentsReturnsTheObservedSessions(t *testing.T) {
	t.Parallel()

	agents, err := readOutput(t, observedSessions)
	if err != nil {
		t.Fatal(err)
	}

	want := []claude.Agent{
		{ID: "98d188e1-53ea-420a-b7de-f7ad912ff2b9", State: "unknown"},
		{ID: "bff7633e-c748-44d1-bf38-3633cbca707f", State: "idle"},
		{ID: "91a3675b-0202-465e-a0ef-4447d733b792", State: "working"},
	}
	if !slices.Equal(agents, want) {
		t.Errorf("got the agents %v, want %v", agents, want)
	}
}

// Only a status of busy or idle, with no state beside it, is a known
// state. Everything else is unknown: a state, blocked included; a state
// and a status together, a shape that was not observed; an unrecognized
// status; neither field. The states are the contract's literal values.
func TestReadAgentsMapsOnlyTheObservedStatuses(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		fields string
		want   claude.State
	}{
		"status busy":              {`"status":"busy"`, "working"},
		"status idle":              {`"status":"idle"`, "idle"},
		"state blocked":            {`"state":"blocked"`, "unknown"},
		"another state":            {`"state":"running"`, "unknown"},
		"a status beside a state":  {`"state":"blocked","status":"busy"`, "unknown"},
		"a state beside a status":  {`"status":"idle","state":"running"`, "unknown"},
		"an unrecognized status":   {`"status":"waiting"`, "unknown"},
		"a status in another case": {`"status":"Busy"`, "unknown"},
		"a status not a string":    {`"status":1`, "unknown"},
		"a null status":            {`"status":null`, "unknown"},
		"neither field":            {`"kind":"interactive"`, "unknown"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			agents, err := readOutput(t, `[{"sessionId":"session-1",`+test.fields+`}]`)
			if err != nil {
				t.Fatal(err)
			}

			want := []claude.Agent{{ID: "session-1", State: test.want}}
			if !slices.Equal(agents, want) {
				t.Errorf("got the agents %v, want %v", agents, want)
			}
		})
	}
}

// An empty array is a successful read of no agents: an empty set, never
// nil.
func TestReadAgentsReturnsAnEmptySetForAnEmptyArray(t *testing.T) {
	t.Parallel()
	for name, output := range map[string]string{
		"bare":        `[]`,
		"with spaces": " [ ]\n",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			agents, err := readOutput(t, output)
			if err != nil {
				t.Fatal(err)
			}

			if agents == nil || len(agents) != 0 {
				t.Errorf("got the agents %#v, want an empty set that is not nil", agents)
			}
		})
	}
}

// An executor's error fails the read with that error, and no agents even
// when the executor returned output with it.
func TestReadAgentsFailsWithTheExecutorsError(t *testing.T) {
	t.Parallel()
	failure := errors.New("exit status 1")
	adapter := newAdapter(t, &executorStub{output: observedSessions, err: failure})

	agents, err := adapter.ReadAgents(t.Context())

	assertNoRead(t, agents, err, "claude agents --json")
	if !errors.Is(err, failure) {
		t.Errorf("got the error %q, want one that is the executor's %q", err, failure)
	}
}

// A read under a cancelled context fails with the cancellation the
// executor reports, recognisable with errors.Is.
func TestReadAgentsFailsWithTheCancellationOfItsContext(t *testing.T) {
	t.Parallel()
	adapter := newAdapter(t, &executorStub{output: observedSessions})
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	agents, err := adapter.ReadAgents(ctx)

	assertNoRead(t, agents, err, "claude agents --json")
	if !errors.Is(err, context.Canceled) {
		t.Errorf("got the error %q, want one that is context.Canceled", err)
	}
}

// Output that is not exactly one JSON array fails the read: nothing,
// invalid JSON, another JSON type, or data after the array.
func TestReadAgentsRejectsOutputThatIsNotOneArray(t *testing.T) {
	t.Parallel()
	for name, output := range map[string]string{
		"nothing":                   ``,
		"only spaces":               " \n",
		"not JSON":                  `no sessions`,
		"an array cut short":        `[{"sessionId":"session-1","status":"idle"}`,
		"an element cut short":      `[{"sessionId":"session-1"]`,
		"an object":                 `{"sessionId":"session-1","status":"idle"}`,
		"null":                      `null`,
		"a string":                  `"session-1"`,
		"a number":                  `1`,
		"a second array":            `[{"sessionId":"session-1"}] []`,
		"text after the array":      `[{"sessionId":"session-1"}] done`,
		"a bracket after the array": `[{"sessionId":"session-1"}]]`,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			agents, err := readOutput(t, output)

			assertNoRead(t, agents, err, "not one JSON array")
		})
	}
}

// Output that is not valid UTF-8 fails the whole read, the valid elements
// before the invalid byte included: decoded, the byte would be replaced
// and the sessionId changed.
func TestReadAgentsRejectsOutputThatIsNotValidUTF8(t *testing.T) {
	t.Parallel()
	for name, element := range map[string]string{
		"in a sessionId":      "{\"sessionId\":\"session-\xff\",\"status\":\"busy\"}",
		"in an ignored field": "{\"sessionId\":\"session-2\",\"name\":\"\xff\"}",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			agents, err := readOutput(t, `[{"sessionId":"session-1","status":"idle"},`+element+`]`)

			assertNoRead(t, agents, err, "not valid UTF-8")
		})
	}
}

// An element that is not an object fails the whole read, the valid
// elements before it included.
func TestReadAgentsRejectsAnElementThatIsNotAnObject(t *testing.T) {
	t.Parallel()
	for name, element := range map[string]string{
		"null":     `null`,
		"a string": `"session-2"`,
		"a number": `2`,
		"a bool":   `true`,
		"an array": `[{"sessionId":"session-2"}]`,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			agents, err := readOutput(t, `[{"sessionId":"session-1","status":"idle"},`+element+`]`)

			assertNoRead(t, agents, err, "element 1 is not a JSON object")
		})
	}
}

// An element whose sessionId is missing, not a string or empty fails the
// whole read, the valid elements before it included.
func TestReadAgentsRejectsAnElementWithoutASessionID(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct{ element, why string }{
		"missing":              {`{"status":"idle"}`, "element 1 has no sessionId"},
		"under another name":   {`{"sessionid":"session-2","id":"session-2"}`, "element 1 has no sessionId"},
		"null":                 {`{"sessionId":null}`, "element 1 has a sessionId that is not a string"},
		"a number":             {`{"sessionId":2}`, "element 1 has a sessionId that is not a string"},
		"an object":            {`{"sessionId":{"id":"session-2"}}`, "element 1 has a sessionId that is not a string"},
		"empty":                {`{"sessionId":""}`, "element 1 has an empty sessionId"},
		"empty, with a status": {`{"sessionId":"","status":"busy"}`, "element 1 has an empty sessionId"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			agents, err := readOutput(t, `[{"sessionId":"session-1","status":"idle"},`+test.element+`]`)

			assertNoRead(t, agents, err, test.why)
		})
	}
}

// Two elements that share a sessionId fail the whole read, whatever their
// states and whatever is between them.
func TestReadAgentsRejectsASharedSessionID(t *testing.T) {
	t.Parallel()

	agents, err := readOutput(t, `[
  {"sessionId":"session-1","status":"idle"},
  {"sessionId":"session-2","status":"busy"},
  {"sessionId":"session-1","state":"blocked"}
]`)

	assertNoRead(t, agents, err, `elements 0 and 2 share the sessionId "session-1"`)
}
