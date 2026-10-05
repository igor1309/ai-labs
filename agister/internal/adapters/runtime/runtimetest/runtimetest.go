// Package runtimetest provides the fake runtimes, built as binaries
// (Binary) or run in process (InProcess), the fake shell InProcess runs a
// setup or verification command under, and the conformance suite every
// TurnRunner (and every decorator of one) must pass.
package runtimetest

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

var (
	buildMu  sync.Mutex
	buildDir string
	built    = map[string]string{}
)

// Binary builds a fake runtime ("fakeclaude", "fakecodex", "fakepi" or
// "fakeopencode") once per test binary and returns its path. Only a
// contract test of the real process builds one; every other test runs the
// fake through InProcess.
func Binary(t testing.TB, name string) string {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	return Build(t, name, filepath.Dir(file), "./"+name+"/cmd")
}

// Build builds target from dir as name, once per test binary, and returns
// its path; a later call with the same name returns that build. It builds
// with the inherited environment and so the host's Go cache. Every build
// goes into one directory, which the calling package removes when its
// tests end: its TestMain exits with Run's code.
func Build(t testing.TB, name, dir, target string) string {
	t.Helper()
	buildMu.Lock()
	defer buildMu.Unlock()
	if path, ok := built[name]; ok {
		return path
	}
	if buildDir == "" {
		d, err := os.MkdirTemp("", "agister-fake-")
		if err != nil {
			t.Fatal(err)
		}
		buildDir = d
	}
	path := filepath.Join(buildDir, name)
	command := exec.Command("go", "build", "-o", path, target)
	command.Dir = dir
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("building %s: %v\n%s", target, err, out)
	}
	built[name] = path
	return path
}

// Run runs a package's tests, then removes what Build built for them, and
// returns the code to exit with: a failed removal fails the run.
//
//	func TestMain(m *testing.M) { os.Exit(runtimetest.Run(m)) }
func Run(m *testing.M) int {
	return runThenRemove(m.Run, removeBuilds, os.Stderr)
}

// runThenRemove is Run with the tests, the removal and the report injected.
func runThenRemove(tests func() int, remove func() error, stderr io.Writer) int {
	code := tests()
	if err := remove(); err != nil {
		fmt.Fprintf(stderr, "runtimetest: removing builds: %v\n", err)
		if code == 0 {
			code = 1
		}
	}
	return code
}

// removeBuilds removes the build directory and forgets what was built.
func removeBuilds() error {
	buildMu.Lock()
	defer buildMu.Unlock()
	dir := buildDir
	buildDir, built = "", map[string]string{}
	if dir == "" {
		return nil
	}
	return os.RemoveAll(dir)
}

// Recorder is an EventSink that keeps everything.
type Recorder struct {
	mu        sync.Mutex
	Events    []run.Event
	Lines     []string
	Processes []string // references, in the order reported
	// Tools are the tool calls reported started, in order, and Finished the
	// IDs of those reported finished.
	Tools    []app.ToolCall
	Finished []string
	// Trace is every event and tool call reported, in the order they
	// arrived: an event as its kind, followed by the tool call it names if
	// any ("TOOL_RESULT toolu_1"), a tool call as "ToolStarted <id>" or
	// "ToolFinished <id>".
	Trace []string
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
	entry := kind
	if id, ok := data["tool_use_id"].(string); ok {
		entry += " " + id
	}
	r.Trace = append(r.Trace, entry)
	hook := r.OnEvent
	r.mu.Unlock()
	if hook != nil {
		hook(kind)
	}
}

func (r *Recorder) ToolStarted(call app.ToolCall) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Tools = append(r.Tools, call)
	r.Trace = append(r.Trace, "ToolStarted "+call.ID)
}

func (r *Recorder) ToolFinished(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Finished = append(r.Finished, id)
	r.Trace = append(r.Trace, "ToolFinished "+id)
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
// runner returns and the test ends instead of hanging. It guards a real
// process only: a fake run in process has no group to kill.
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
	// Fake is the command that starts the fake: the built binary's path,
	// or the name InProcess runs it by.
	Fake string
	// InProcess is whether the runner starts Fake through InProcess, not
	// as a process. The suite then starts no watchdog: a hang is caught by
	// the test binary's -timeout.
	InProcess bool
	// Contract the runner must report.
	Contract string
	// ToolCalls is whether the runner must report the agent's tool calls,
	// and say so in its identity.
	ToolCalls bool
	// Request returns a valid request carrying prompt.
	Request func(prompt string) app.TurnRequest
	// Clock is the manual clock the runner's process supervisor times
	// turns on: no turn times out unless the suite advances it.
	Clock Clock
}

// Clock is a manual clock (clocktest.Clock is one): Started returns once
// a timer of wait has been started, and Advance moves the clock on, firing
// the timers whose wait it passes.
type Clock interface {
	Started(wait time.Duration)
	Advance(by time.Duration)
}

// Conformance checks the TurnRunner contract: identity, outcome precedence,
// no upgrading of runtime failures, timeout and cancellation, spawn failure,
// and raw output passthrough.
//
// Timer rule: a turn times out only when the suite advances the subject's
// manual clock past its timeout; a real timer only guards a real process
// against a hang (the watchdog), and no bound exceeds a minute. Anything
// that must end some other way is event-driven, so machine load cannot
// flip an outcome.
func Conformance(t *testing.T, subject Subject) {
	watchdog := func(t *testing.T) func(ref string) {
		if subject.InProcess {
			return nil
		}
		return Watchdog(t)
	}
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
		if err != nil || identity.Contract != subject.Contract || identity.Version == "" || identity.ToolCalls != subject.ToolCalls {
			t.Fatalf("identity = %+v, %v", identity, err)
		}
	})

	t.Run("a fresh first turn is admitted", func(t *testing.T) {
		request := subject.Request("SCENARIO:approve")
		if fault := subject.New(subject.Fake).Admit(app.TurnStart{Skills: request.Skills}); fault != nil {
			t.Fatalf("admit = %v", fault)
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

	// What the core's staleness limits on tool calls are enforced on.
	t.Run("a tool call is reported as it starts and as it finishes", func(t *testing.T) {
		_, sink := turn(t, "SCENARIO:approve", nil, context.Background())
		if !subject.ToolCalls {
			if len(sink.Tools) != 0 || len(sink.Finished) != 0 {
				t.Fatalf("tool calls its identity does not declare: started %+v, finished %q", sink.Tools, sink.Finished)
			}
			return
		}
		if len(sink.Tools) != 1 || sink.Tools[0].ID == "" || sink.Tools[0].Name == "" || sink.Tools[0].Input == "" ||
			len(sink.Finished) != 1 || sink.Finished[0] != sink.Tools[0].ID {
			t.Fatalf("tool calls started %+v, finished %q", sink.Tools, sink.Finished)
		}
		// During the turn, in order: the call is started before its result
		// is reported, and finished before the turn completes.
		id := sink.Tools[0].ID
		started, result := slices.Index(sink.Trace, "ToolStarted "+id), slices.Index(sink.Trace, "TOOL_RESULT "+id)
		finished, completed := slices.Index(sink.Trace, "ToolFinished "+id), slices.Index(sink.Trace, "TURN_COMPLETED")
		if started < 0 || result < 0 || started > result || finished < 0 || completed < 0 || finished > completed {
			t.Fatalf("trace = %q", sink.Trace)
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
		if reason := lastLine(result.StderrTail); !strings.HasSuffix(result.Error.Message, reason) || result.StderrOmitted != 0 {
			t.Fatalf("the message does not quote the reason %q: %+v", reason, result)
		}
	})

	t.Run("a silent non-zero exit says only its exit code", func(t *testing.T) {
		result, _ := turn(t, "SCENARIO:exit_silent", nil, context.Background())
		if !is(result, run.Failed, run.ClassRuntimeError) || result.Exit == nil || result.Exit.Code == nil ||
			result.Error.Message != "exit code "+strconv.Itoa(*result.Exit.Code) || result.StderrTail != "" {
			t.Fatalf("turn = %+v", result)
		}
	})

	t.Run("stderr beyond the bound is cut and marked, the reason kept", func(t *testing.T) {
		result, _ := turn(t, "SCENARIO:exit_flooded", nil, context.Background())
		if !is(result, run.Failed, run.ClassRuntimeError) || result.StderrOmitted <= 0 {
			t.Fatalf("turn = %+v", result)
		}
		marker, rest, _ := strings.Cut(result.StderrTail, "\n")
		if marker != "["+strconv.FormatInt(result.StderrOmitted, 10)+" earlier bytes of stderr cut]" || len(rest) > 4096 {
			t.Fatalf("tail of %d bytes starts %q", len(result.StderrTail), marker)
		}
		// The fakes print their reason after the noise.
		if reason := lastLine(result.StderrTail); strings.Contains(reason, "noise") || !strings.HasSuffix(result.Error.Message, ": "+reason) {
			t.Fatalf("the message does not quote the reason %q: %q", reason, result.Error.Message)
		}
	})

	t.Run("clean exit without a result is lost", func(t *testing.T) {
		result, _ := turn(t, "SCENARIO:no_result", nil, context.Background())
		if !is(result, run.Lost, run.ClassNoResult) {
			t.Fatalf("turn = %+v", result)
		}
	})

	t.Run("timeout interrupts the process group", func(t *testing.T) {
		// The hang scenario never ends on its own: only the timeout ends
		// it, once the clock is advanced past it. The watchdog guards
		// against a timeout that never kills it, and the outcome is the
		// verdict.
		const timeout = 17 * time.Minute
		request := subject.Request("SCENARIO:hang")
		request.Timeout = timeout
		sink := &Recorder{OnProcess: watchdog(t)}
		done := make(chan run.Turn, 1)
		go func() { done <- subject.New(subject.Fake).RunTurn(context.Background(), request, sink) }()
		subject.Clock.Started(timeout)
		subject.Clock.Advance(timeout)
		result := <-done
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
		// timeout is on the manual clock, which nothing advances: it never
		// races the cancel.
		request := subject.Request("SCENARIO:hang")
		sink := &Recorder{OnProcess: watchdog(t), OnEvent: func(kind string) {
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

// lastLine is the last line of text.
func lastLine(text string) string {
	return text[strings.LastIndex(text, "\n")+1:]
}

// is reports whether a turn ended with status and a fault of class.
func is(turn run.Turn, status run.Status, class run.Class) bool {
	return turn.Status == status && turn.Error != nil && turn.Error.Class == class
}

// Runs is a spy process runner: it keeps each spec it is handed and
// answers it without starting a process. Spec, Sink and Evidence are the
// types the adapter under test declares for its transport.
type Runs[Spec, Sink, Evidence any] struct {
	// Answer is what a run of spec prints on stdout, line by line, and the
	// evidence it ends with; nil prints nothing and returns the zero
	// evidence. It runs while the run does, so it sees the files the runner
	// made for it.
	Answer func(spec Spec) (lines []string, evidence Evidence)

	mu    sync.Mutex
	specs []Spec
}

func (r *Runs[Spec, Sink, Evidence]) Run(_ context.Context, spec Spec, _ Sink, onLine func(string)) Evidence {
	r.mu.Lock()
	r.specs = append(r.specs, spec)
	r.mu.Unlock()
	if r.Answer == nil {
		var evidence Evidence
		return evidence
	}
	lines, evidence := r.Answer(spec)
	for _, line := range lines {
		onLine(line)
	}
	return evidence
}

// Specs are the specs Run was handed, in order.
func (r *Runs[Spec, Sink, Evidence]) Specs() []Spec {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.specs)
}

// Transport is a spy process transport: Runs, and the runtime's version.
type Transport[Spec, Sink, Evidence any] struct {
	Runs[Spec, Sink, Evidence]
	// Output and Err are what Version returns.
	Output string
	Err    error

	mu       sync.Mutex
	versions []string
}

func (t *Transport[Spec, Sink, Evidence]) Version(_ context.Context, command string) (string, error) {
	t.mu.Lock()
	t.versions = append(t.versions, command)
	t.mu.Unlock()
	return t.Output, t.Err
}

// Versions are the commands Version was asked about, in order.
func (t *Transport[Spec, Sink, Evidence]) Versions() []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return slices.Clone(t.versions)
}
