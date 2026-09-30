// Package runtimetest provides fake runtime binaries and the conformance
// suite every TurnRunner (and every decorator of one) must pass.
package runtimetest

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

var (
	buildMu sync.Mutex
	built   = map[string]string{}
)

// Binary builds a fake runtime ("fakeclaude" or "fakecodex") once per test
// binary and returns its path.
func Binary(t testing.TB, name string) string {
	t.Helper()
	buildMu.Lock()
	defer buildMu.Unlock()
	if path, ok := built[name]; ok {
		return path
	}
	_, file, _, _ := runtime.Caller(0)
	dir, err := os.MkdirTemp("", "agister-fake-")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, name)
	command := exec.Command("go", "build", "-o", path, "./"+name)
	command.Dir = filepath.Dir(file)
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("building %s: %v\n%s", name, err, out)
	}
	built[name] = path
	return path
}

// Recorder is an EventSink that keeps everything.
type Recorder struct {
	mu        sync.Mutex
	Events    []run.Event
	Lines     []string
	Processes []string // references, in the order reported
	// ProcessErr is what ProcessStarted returns (after keeping the reference).
	ProcessErr error
	// OnEvent, when set before the run, is called with each event's kind
	// after it is recorded, outside the lock.
	OnEvent func(kind string)
	// OnProcess, when set before the run, is called with each process
	// reference after it is kept, outside the lock.
	OnProcess func(ref string)
}

func (r *Recorder) Event(source, kind string, data map[string]any) {
	r.mu.Lock()
	r.Events = append(r.Events, run.Event{Seq: len(r.Events) + 1, Source: source, Kind: kind, Data: data})
	hook := r.OnEvent
	r.mu.Unlock()
	if hook != nil {
		hook(kind)
	}
}

func (r *Recorder) ProcessStarted(ref string) error {
	r.mu.Lock()
	r.Processes = append(r.Processes, ref)
	hook, err := r.OnProcess, r.ProcessErr
	r.mu.Unlock()
	if hook != nil {
		hook(ref)
	}
	return err
}

// hangBound is how long a turn that only a kill ends may run before the
// watchdog ends it as a hang.
const hangBound = 20 * time.Second

// Watchdog guards a turn against a hang: once its process is on record,
// a group still there after hangBound is killed and the test fails, so the
// runner returns and the test ends instead of hanging.
func Watchdog(t *testing.T) func(ref string) {
	return func(ref string) {
		group, _, err := supervisor.ParseRef(ref)
		if err != nil || group <= 1 {
			t.Errorf("reference %q names no group: %v", ref, err)
			return
		}
		watchdog := time.AfterFunc(hangBound, func() {
			t.Errorf("group %d still ran after %s: killed as a hang", group, hangBound)
			_ = syscall.Kill(-group, syscall.SIGKILL)
		})
		t.Cleanup(func() { watchdog.Stop() })
	}
}

func (r *Recorder) Raw(line string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Lines = append(r.Lines, line)
}

func (r *Recorder) Kinds() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	kinds := make([]string, len(r.Events))
	for i, event := range r.Events {
		kinds[i] = event.Kind
	}
	return kinds
}

// Subject describes a runner under the conformance suite.
type Subject struct {
	// New builds the runner for a runtime command.
	New func(command string) app.TurnRunner
	// Fake is the fake binary's path.
	Fake string
	// Contract the runner must report.
	Contract string
	// Request returns a valid request carrying prompt.
	Request func(prompt string) app.TurnRequest
}

// Conformance checks the TurnRunner contract: identity, outcome precedence,
// no upgrading of runtime failures, timeout and cancellation, spawn failure,
// and raw output passthrough.
//
// Timer rule: a real timer in these tests fires only when the process can do
// nothing else (the hang scenario), and no bound exceeds a minute. Anything
// that must end some other way is event-driven, so machine load cannot flip
// an outcome.
func Conformance(t *testing.T, subject Subject) {
	turn := func(t *testing.T, prompt string, mutate func(*app.TurnRequest), ctx context.Context) (run.Turn, *Recorder) {
		request := subject.Request(prompt)
		if mutate != nil {
			mutate(&request)
		}
		sink := &Recorder{}
		return subject.New(subject.Fake).RunTurn(ctx, request, sink), sink
	}

	t.Run("identity", func(t *testing.T) {
		identity, err := subject.New(subject.Fake).Identity(context.Background())
		if err != nil || identity.Contract != subject.Contract || identity.Version == "" {
			t.Fatalf("identity = %+v, %v", identity, err)
		}
	})

	t.Run("completed turn with structured output", func(t *testing.T) {
		result, sink := turn(t, "SCENARIO:approve", nil, context.Background())
		if result.Status != run.Completed || len(result.Output) == 0 || result.ProviderSessionID == "" {
			t.Fatalf("turn = %+v", result)
		}
		kinds := sink.Kinds()
		if kinds[0] != "PROCESS_STARTED" || kinds[len(kinds)-1] != "PROCESS_EXITED" {
			t.Fatalf("events = %v", kinds)
		}
		if len(sink.Lines) < 3 {
			t.Fatalf("raw lines not passed through: %d", len(sink.Lines))
		}
	})

	t.Run("runtime-reported failure is never upgraded by a clean exit", func(t *testing.T) {
		result, _ := turn(t, "SCENARIO:error_result", nil, context.Background())
		if !is(result, run.Failed, run.ClassRuntimeError) || !strings.Contains(result.Error.Message, "runtime reported") {
			t.Fatalf("turn = %+v", result)
		}
	})

	t.Run("non-zero exit without a result fails and keeps stderr", func(t *testing.T) {
		result, _ := turn(t, "SCENARIO:exit_nonzero", nil, context.Background())
		if !is(result, run.Failed, run.ClassRuntimeError) || !strings.HasPrefix(result.Error.Message, "exit code") || result.StderrTail == "" {
			t.Fatalf("turn = %+v", result)
		}
	})

	t.Run("clean exit without a result is lost", func(t *testing.T) {
		result, _ := turn(t, "SCENARIO:no_result", nil, context.Background())
		if !is(result, run.Lost, run.ClassNoResult) {
			t.Fatalf("turn = %+v", result)
		}
	})

	t.Run("timeout interrupts the process group", func(t *testing.T) {
		// The hang scenario never ends on its own: the watchdog guards
		// against a timeout that never kills it, and the outcome is the
		// verdict.
		request := subject.Request("SCENARIO:hang")
		request.Timeout = 300 * time.Millisecond
		sink := &Recorder{OnProcess: Watchdog(t)}
		result := subject.New(subject.Fake).RunTurn(context.Background(), request, sink)
		if !is(result, run.Interrupted, run.ClassTimeout) {
			t.Fatalf("turn = %+v", result)
		}
		if !strings.Contains(strings.Join(sink.Kinds(), " "), "TIMEOUT") {
			t.Fatalf("events = %v", sink.Kinds())
		}
	})

	t.Run("cancellation interrupts the turn", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		// Cancel when the process has started, not after a delay. The
		// minute timeout only backstops a hang and never races the cancel.
		request := subject.Request("SCENARIO:hang")
		request.Timeout = 30 * time.Second
		sink := &Recorder{OnProcess: Watchdog(t), OnEvent: func(kind string) {
			if kind == "PROCESS_STARTED" {
				cancel()
			}
		}}
		result := subject.New(subject.Fake).RunTurn(ctx, request, sink)
		if !is(result, run.Interrupted, run.ClassCancelled) {
			t.Fatalf("turn = %+v", result)
		}
	})

	// A runtime that resumes sessions resumes the reported one in place,
	// and a turn that reports another session breaks that contract.
	t.Run("a resume turn keeps the resumed session", func(t *testing.T) {
		identity, err := subject.New(subject.Fake).Identity(context.Background())
		if err != nil || !identity.Resume {
			t.Skipf("the runtime does not resume sessions: %+v, %v", identity, err)
		}
		const resumed = "7d1c2a4e-0000-4000-8000-000000000001"
		resume := func(r *app.TurnRequest) { r.ResumeSessionID = resumed }
		result, _ := turn(t, "SCENARIO:approve", resume, context.Background())
		if result.Status != run.Completed || result.ProviderSessionID != resumed {
			t.Fatalf("turn = %+v", result)
		}
		result, _ = turn(t, "SCENARIO:mismatch", resume, context.Background())
		if !is(result, run.Failed, run.ClassRuntimeError) || result.ProviderSessionID == resumed {
			t.Fatalf("turn = %+v", result)
		}
	})

	t.Run("a missing runtime is a failed turn, not a crash", func(t *testing.T) {
		request := subject.Request("x")
		result := subject.New("/nonexistent/runtime").RunTurn(context.Background(), request, &Recorder{})
		if !is(result, run.Failed, run.ClassRuntimeUnavailable) {
			t.Fatalf("turn = %+v", result)
		}
		if _, err := subject.New("/nonexistent/runtime").Identity(context.Background()); err == nil {
			t.Fatal("identity of a missing runtime succeeded")
		}
	})
}

// is reports whether a turn ended with status and a fault of class.
func is(turn run.Turn, status run.Status, class run.Class) bool {
	return turn.Status == status && turn.Error != nil && turn.Error.Class == class
}
