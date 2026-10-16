package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"reflect"
	"slices"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
	"github.com/igor1309/ai-labs/agister/supervisor"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// sayProcess is the process "say" of run.feature, its script the prompt
// "say", with what the outline's row puts in %s declared after it.
const sayProcess = `schema: agister.process/v1alpha1
prompt: say
params:
  what: {}
inputs:
  what: {source: param, name: what%s}
%s`

// pairWorkflow is the workflow "pair" of run.feature.
const pairWorkflow = `schema: agister.workflow/v1alpha1
steps:
  - {name: a, process: say, agent: bash, inputs: {what: hi}}
  - {name: b, process: say, agent: bash, inputs: {what: {from: steps.a.outputs.stdout.head}}}
outputs:
  said: {from: steps.b.outputs.stdout.head}
`

// runSettings are the settings of run.feature: home's as shipped, with
// the process "say", its prompt the script echo "$what", and the workflow
// "pair"; then the files of more, by path.
func runSettings(t *testing.T, more map[string]string) map[string]string {
	t.Helper()
	settings := shippedHome(t)
	settings["/u/.agister/processes/say.yaml"] = fmt.Sprintf(sayProcess, "", "")
	settings["/u/.agister/prompts/say.md"] = `echo "$what"`
	settings["/u/.agister/workflows/pair.yaml"] = pairWorkflow
	maps.Copy(settings, more)
	return settings
}

// environ is Agister's own environment in every run here.
var environ = []string{"HOME=/u", "PATH=/bin"}

// supervisorSpy answers in place of the supervisor by answer, and keeps
// each program it is asked to run. It is safe for concurrent use.
type supervisorSpy struct {
	answer   func(ctx context.Context, program supervisor.Program) (supervisor.Result, error)
	mu       sync.Mutex
	programs []supervisor.Program
}

func (s *supervisorSpy) Run(ctx context.Context, program supervisor.Program) (supervisor.Result, error) {
	s.mu.Lock()
	s.programs = append(s.programs, program)
	s.mu.Unlock()
	return s.answer(ctx, program)
}

func (s *supervisorSpy) ran() []supervisor.Program {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.programs)
}

// echoes answers as bash runs echo "$what": its exit code 0, and stdout
// the last value of "what" its environment gives, and a newline.
func echoes(_ context.Context, program supervisor.Program) (supervisor.Result, error) {
	var what string
	for _, entry := range program.Env {
		if value, ok := strings.CutPrefix(entry, "what="); ok {
			what = value
		}
	}
	return supervisor.Result{Stdout: kept(what + "\n"), Stderr: kept("")}, nil
}

// kept is what the supervisor keeps of a stream that wrote text.
func kept(text string) supervisor.Stream {
	digest := sha256.Sum256([]byte(text))
	return supervisor.Stream{Head: text, Tail: text, Size: int64(len(text)), Digest: hex.EncodeToString(digest[:])}
}

// keptJSON is a stream that wrote text, as the result prints it.
func keptJSON(text string) map[string]any {
	s := kept(text)
	return map[string]any{"head": s.Head, "tail": s.Tail, "size": float64(s.Size), "digest": s.Digest}
}

// signalsSpy is a signal source whose signals its test sends on fired. It
// counts the watches started and stopped.
type signalsSpy struct {
	fired            chan os.Signal
	mu               sync.Mutex
	started, stopped int
}

func (s *signalsSpy) watch() (<-chan os.Signal, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.started++
	return s.fired, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.stopped++
	}
}

func (s *signalsSpy) watches() (started, stopped int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.started, s.stopped
}

var runStart = time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC)

// runFixture is the composition as build gives it, over a filesystem
// holding its settings; a git whose worktree root of "/r" and below is
// "/r"; the supervisor spy; and the machine: Agister's environment
// environ, a manual clock, and the signals spy.
type runFixture struct {
	settings   map[string]string
	supervisor *supervisorSpy
	signals    *signalsSpy
	clock      *clocktest.Clock
}

func newRunFixture(settings map[string]string, answer func(context.Context, supervisor.Program) (supervisor.Result, error)) *runFixture {
	return &runFixture{
		settings:   settings,
		supervisor: &supervisorSpy{answer: answer},
		signals:    &signalsSpy{fired: make(chan os.Signal)},
		clock:      clocktest.NewClock(runStart),
	}
}

// run runs "agister <args>" in dir.
func (f *runFixture) run(t *testing.T, dir string, args ...string) ran {
	t.Helper()
	return f.runWatching(t, f.signals.watch, environ, dir, args...)
}

func (f *runFixture) runWatching(t *testing.T, watch signals, environment []string, dir string, args ...string) ran {
	t.Helper()
	var stdout, stderr strings.Builder
	machine := host{ctx: context.Background(), environ: environment, clock: f.clock, timer: f.clock.Timer, signals: watch, temp: "/t"}
	commandLine, err := build("/u", &linksSpy{}, newFilesystemSpy(f.settings), rootSpy{root: "/r"}, f.supervisor, machine, &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	code := commandLine.Run(args, dir)
	return ran{stdout: stdout.String(), stderr: stderr.String(), code: code}
}

// printedResult is a result as cli prints it.
type printedResult struct {
	Status   string         `json:"status"`
	Class    *string        `json:"class"`
	Output   map[string]any `json:"output"`
	Cost     *float64       `json:"cost"`
	Warnings []string       `json:"warnings"`
}

func printedOf(t *testing.T, got ran) printedResult {
	t.Helper()
	var p printedResult
	if err := json.Unmarshal([]byte(got.stdout), &p); err != nil {
		t.Fatalf("stdout %q, stderr %q: %v", got.stdout, got.stderr, err)
	}
	return p
}

// bashProgram is the program bash runs script as, in "/r", its environment
// Agister's then each of env.
func bashProgram(script string, env ...string) supervisor.Program {
	return supervisor.Program{Name: "bash", Args: []string{"-c", script}, Dir: "/r", Env: append(slices.Clone(environ), env...)}
}

// run.feature, "A step requested alone runs on bash". Bash grants what a
// script can do; "say" allows nothing, so its plan warns of each grant.
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepRequestedAloneRunsOnBash(t *testing.T) {
	t.Parallel()
	f := newRunFixture(runSettings(t, nil), echoes)
	got := f.run(t, "/r/a", "run", "--process", "say", "--agent", "bash", "--param", "what=hi")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if want := []supervisor.Program{bashProgram(`echo "$what"`, "what=hi")}; !reflect.DeepEqual(f.supervisor.ran(), want) {
		t.Errorf("ran %+v, want %+v", f.supervisor.ran(), want)
	}
	var warnings []string
	for _, grant := range []string{"repository.read", "repository.search", "repository.diff", "repository.history.read",
		"repository.write", "repository.history.write", "process.execute", "network", "host.read", "host.write"} {
		warnings = append(warnings, fmt.Sprintf("steps[0]: its plan grants %q beyond what its process \"say\" allows", grant))
	}
	want := printedResult{
		Status:   "completed",
		Output:   map[string]any{"output": map[string]any{"exit_code": float64(0), "stdout": keptJSON("hi\n"), "stderr": keptJSON("")}},
		Warnings: warnings,
	}
	if p := printedOf(t, got); !reflect.DeepEqual(p, want) {
		t.Errorf("printed %+v, want %+v", p, want)
	}
}

// run.feature, "A named workflow runs its steps in order, bound".
//
// Contract test: the files home holds, as Agister ships them.
func TestANamedWorkflowRunsItsStepsInOrderBound(t *testing.T) {
	t.Parallel()
	f := newRunFixture(runSettings(t, nil), echoes)
	got := f.run(t, "/r", "run", "pair")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if want := []supervisor.Program{bashProgram(`echo "$what"`, "what=hi"), bashProgram(`echo "$what"`, "what=hi\n")}; !reflect.DeepEqual(f.supervisor.ran(), want) {
		t.Errorf("ran %#v, want %#v", f.supervisor.ran(), want)
	}
	if p := printedOf(t, got); p.Status != "completed" || p.Class != nil || !reflect.DeepEqual(p.Output, map[string]any{"said": "hi\n\n"}) {
		t.Errorf("printed %+v, want completed, no class, said %q", p, "hi\n\n")
	}
}

// run.feature, "A request that does not resolve runs nothing".
//
// Contract test: the files home holds, as Agister ships them.
func TestARequestThatDoesNotResolveRunsNothing(t *testing.T) {
	t.Parallel()
	f := newRunFixture(runSettings(t, nil), echoes)
	got := f.run(t, "/r", "run", "--process", "nope", "--agent", "bash")
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  process nope: no layer holds the process \"nope\"\n", code: 1}
	if got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
	if ran := f.supervisor.ran(); len(ran) > 0 {
		t.Errorf("ran %+v, want nothing", ran)
	}
}

// run.feature, "Outside a git worktree the request is refused".
//
// Contract test: the files home holds, as Agister ships them.
func TestOutsideAGitWorktreeTheRequestIsRefused(t *testing.T) {
	t.Parallel()
	f := newRunFixture(runSettings(t, nil), echoes)
	got := f.run(t, "/elsewhere", "run", "--process", "say", "--agent", "bash", "--param", "what=hi")
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  the launch directory \"/elsewhere\" is in no git worktree\n", code: 1}
	if got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
	if ran := f.supervisor.ran(); len(ran) > 0 {
		t.Errorf("ran %+v, want nothing", ran)
	}
}

// run.feature, "What this slice does not run is refused before anything".
//
// Contract test: the files home holds, as Agister ships them.
func TestWhatThisSliceDoesNotRunIsRefusedBeforeAnything(t *testing.T) {
	t.Parallel()
	cases := []struct {
		declares    string
		input, more string
		files       map[string]string
		agent       string
		what        string
	}{
		{declares: "as it is", agent: "claude-opus", what: `the step "say": the runtime "claude-code"'s turn`},
		{declares: `an input "b" from the source "git.revision"`, more: "  b: {source: git.revision, rev: {from: params.what}}\n",
			agent: "bash", what: `the process "say": the input "b" from the source "git.revision"`},
		{declares: `the input "what" with the form "goal"`, input: ", form: [goal]",
			agent: "bash", what: `the process "say": the brief form of "what"`},
		{declares: "a workspace revision from inputs.what", more: "workspace: {revision: {from: inputs.what}}\n",
			agent: "bash", what: `the process "say": the workspace's revision`},
		{declares: "a workspace clean", more: "workspace: {clean: true}\n",
			agent: "bash", what: `the process "say": the workspace's clean`},
		{declares: "the workspace access read-write", more: "workspace: {access: read-write}\n",
			agent: "bash", what: `the process "say": the workspace's read-write access`},
		{declares: "the stale limit no_event 1m", more: "limits: {stale: {no_event: 1m}}\n",
			agent: "bash", what: `the process "say": the staleness limit`},
		{declares: `an instruction "think"`, more: "instruction: think\n",
			agent: "bash", what: `the process "say": the instruction on bash`},
		{declares: `the guidance "g", a prompt the settings hold`, more: "guidance: [g]\n",
			files: map[string]string{"/u/.agister/prompts/g.md": "Go.\n"},
			agent: "bash", what: `the process "say": the guidance on bash`},
	}
	for _, c := range cases {
		t.Run(c.declares, func(t *testing.T) {
			t.Parallel()
			files := map[string]string{"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, c.input, c.more)}
			maps.Copy(files, c.files)
			f := newRunFixture(runSettings(t, files), echoes)
			got := f.run(t, "/r", "run", "--process", "say", "--agent", c.agent, "--param", "what=hi")
			want := ran{stderr: "agister: the run is refused, and nothing runs:\n  " + c.what + " is not run yet\n", code: 1}
			if got != want {
				t.Errorf("ran %+v, want %+v", got, want)
			}
			if ran := f.supervisor.ran(); len(ran) > 0 {
				t.Errorf("ran %+v, want nothing", ran)
			}
		})
	}
}

// run.feature, "A workflow with an item that is not a step is refused".
// A process's instruction is named only for a step on bash: on another
// runtime, the runtime's turn is named instead.
//
// Contract test: the files home holds, as Agister ships them.
func TestAWorkflowWithAnItemThatIsNotAStepIsRefused(t *testing.T) {
	t.Parallel()
	f := newRunFixture(runSettings(t, nil), echoes)
	got := f.run(t, "/r", "run", "code_review", "--param", "goal=g")
	lines := []string{
		`the workflow "code_review": the input "base" from the source "git.revision" is not run yet`,
		`the workflow "code_review": the input "candidate" from the source "git.revision" is not run yet`,
		`the workflow "code_review": the input "goal" from the source "file" is not run yet`,
		`the workflow "code_review": the brief form of "goal" is not run yet`,
		`the workflow "code_review": the item "reviews", a parallel, is not run yet`,
		`the step "judge": the runtime "claude-code"'s turn is not run yet`,
		`the process "review_judge": the staleness limit is not run yet`,
	}
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  " + strings.Join(lines, "\n  ") + "\n", code: 1}
	if got != want {
		t.Errorf("ran\n%+v\nwant\n%+v", got, want)
	}
	if ran := f.supervisor.ran(); len(ran) > 0 {
		t.Errorf("ran %+v, want nothing", ran)
	}
}

// run.feature, "A step reaches core with its process's time limit, as
// layered".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepReachesCoreWithItsProcesssTimeLimitAsLayered(t *testing.T) {
	t.Parallel()
	settings := runSettings(t, map[string]string{
		"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", "limits: {time: 1m}\n"),
		"/r/.agister/processes/say.yaml": "limits: {time: 1s}\n",
	})
	read, err := readSettings("/u/.agister", "/r", newFilesystemSpy(settings), rootSpy{root: "/r"}, wrappersSpy{"bash/1": {}})
	if err != nil {
		t.Fatal(err)
	}
	resolved, faults := read.resolver.Resolve(resolve.Step("say", "bash").WithParams("what"))
	if len(faults) > 0 {
		t.Fatalf("faults %+v", faults)
	}
	built, unrun, err := planOf("", resolved, read.documents, "bash/1")
	if err != nil || len(unrun) > 0 {
		t.Fatalf("not run %q, error %v", unrun, err)
	}
	if got := built.calls["say"].step.TimeLimit; got != time.Second {
		t.Errorf("core's step has the time limit %v, want 1s", got)
	}
}

// run.feature, "A signal to Agister cancels the run". Bash blocks until
// its context ends, and then exits 0: core's class wins.
//
// Contract test: OS signal registration and delivery, and the shipped home files; integrates the composed run.
// Serial: SIGINT and SIGTERM are delivered to this process.
func TestASignalToAgisterCancelsTheRun(t *testing.T) {
	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM} {
		func() {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			started := make(chan struct{})
			ended := make(chan error, 1)
			f := newRunFixture(runSettings(t, nil), func(runCtx context.Context, _ supervisor.Program) (supervisor.Result, error) {
				close(started)
				select {
				case <-runCtx.Done():
					ended <- runCtx.Err()
				case <-ctx.Done():
					ended <- ctx.Err()
				}
				return supervisor.Result{Stdout: kept(""), Stderr: kept("")}, nil
			})
			unwatched := make(chan struct{})
			watch := cancellationSignals()
			watched := 0
			tracked := func() (<-chan os.Signal, func()) {
				watched++
				fired, stop := watch()
				return fired, func() { stop(); close(unwatched) }
			}
			done := make(chan ran, 1)
			go func() {
				done <- f.runWatching(t, tracked, environ, "/r", "run", "--process", "say", "--agent", "bash", "--param", "what=hi")
			}()
			select {
			case <-started:
			case got := <-done:
				t.Fatalf("%s: run ended before the program started: %+v", sig, got)
			}
			if err := syscall.Kill(os.Getpid(), sig); err != nil {
				cancel()
				<-done
				t.Fatal(err)
			}
			got := <-done
			// Completion includes stopping the actual signal subscription.
			<-unwatched
			if watched != 1 {
				t.Errorf("%s: watched signals %d times, want once", sig, watched)
			}
			if err := <-ended; !errors.Is(err, context.Canceled) {
				t.Errorf("%s: turn context ended with %v, want cancelled", sig, err)
			}
			if got.code != 1 || got.stderr != "" {
				t.Errorf("%s: stderr %q, exit %d; want none, 1", sig, got.stderr, got.code)
			}
			if p := printedOf(t, got); p.Status != "interrupted" || p.Class == nil || *p.Class != "cancelled" {
				t.Errorf("%s: printed %+v, want interrupted, class cancelled", sig, p)
			}
		}()
	}
}
