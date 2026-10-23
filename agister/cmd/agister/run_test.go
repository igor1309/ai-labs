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

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/settings/layout"
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
func echoes(_ context.Context, turn bash.Turn) (bash.Ended, error) {
	var what string
	for _, entry := range turn.Env {
		if value, ok := strings.CutPrefix(entry, "what="); ok {
			what = value
		}
	}
	return bash.Ended{Stdout: kept(what + "\n"), Stderr: kept("")}, nil
}

// kept is what bash gives of a stream that wrote text.
func kept(text string) bash.Stream {
	return bash.Stream{Head: text, Tail: text, Size: int64(len(text)), Digest: identityOf(text)}
}

// identityOf is the hex SHA-256 digest of text.
func identityOf(text string) string {
	digest := sha256.Sum256([]byte(text))
	return hex.EncodeToString(digest[:])
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
// "/r", unless its test gives other roots; the runtime wrappers' spies, bash's answering by the answer its
// test gives, claude-code's and codex's by those it sets; the validator,
// jsonschema's unless its test gives another; the sources' spy, git's root
// "/r", holding what its test gives; the holding's spy, git's HEAD of "/r"
// "c1" and clean, every lock taken; runstore's spy; and the machine:
// Agister's environment environ, a manual clock, the signals spy and
// randomness giving 55fd36.
type runFixture struct {
	settings  map[string]string
	roots     layout.WorktreeRoot
	runtimes  *runtimesSpy
	validator call.Validator
	signals   *signalsSpy
	clock     *clocktest.Clock
	sources   *sourcesSpy
	holding   *holdingSpy
	store     *storeSpy
	random    randomSpy
}

func newRunFixture(t *testing.T, settings map[string]string, answer func(context.Context, bash.Turn) (bash.Ended, error)) *runFixture {
	t.Helper()
	runtimes := newRuntimesSpy(t)
	runtimes.bash.answer = answer
	return &runFixture{
		settings:  settings,
		roots:     rootSpy{root: "/r"},
		runtimes:  runtimes,
		validator: schemaValidator{},
		signals:   &signalsSpy{fired: make(chan os.Signal)},
		clock:     clocktest.NewClock(runStart),
		sources:   &sourcesSpy{root: "/r"},
		holding:   &holdingSpy{root: "/r", head: "c1", clean: true},
		store:     &storeSpy{},
		random:    randomSpy{0x55, 0xfd, 0x36},
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
	machine := host{ctx: context.Background(), environ: environment, clock: f.clock, timer: f.clock.Timer, signals: watch,
		random: f.random}
	commandLine, err := build("/u", &linksSpy{}, newFilesystemSpy(f.settings), f.roots, f.runtimes.runtimes(), f.validator, f.sources.sourcing(), f.holding.holding(), f.store.at, machine, &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	code := commandLine.Run(args, dir)
	got := ran{stdout: stdout.String(), code: code}
	got.progress, got.stderr = progressApart(stderr.String())
	return got
}

// progressApart is the progress lines of stderr, each "· " and what it
// tells, and the rest of it. A run prints its progress among whatever else
// it prints to stderr: progress_test.go proves those lines, and every
// other test of a run asserts the rest.
func progressApart(stderr string) (progress, rest string) {
	for _, line := range strings.SplitAfter(stderr, "\n") {
		if strings.HasPrefix(line, "· ") {
			progress += line
		} else {
			rest += line
		}
	}
	return progress, rest
}

// printedResult is a result as cli prints it.
type printedResult struct {
	Status   string         `json:"status"`
	Class    *string        `json:"class"`
	Output   map[string]any `json:"output"`
	Cost     *float64       `json:"cost"`
	Reason   *string        `json:"reason"`
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

// bashTurn is the turn bash runs script in, in "/r", its environment
// Agister's then each of env.
func bashTurn(script string, env ...string) bash.Turn {
	return bash.Turn{Script: script, Dir: "/r", Env: append(slices.Clone(environ), env...)}
}

// run.feature, "A step requested alone runs on bash". Bash grants what a
// script can do; "say" allows nothing, so its plan warns of each grant.
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepRequestedAloneRunsOnBash(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, runSettings(t, nil), echoes)
	got := f.run(t, "/r/a", "run", "--process", "say", "--agent", "bash", "--param", "what=hi")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if want := []bash.Turn{bashTurn(`echo "$what"`, "what=hi")}; !reflect.DeepEqual(f.runtimes.bash.ran(), want) {
		t.Errorf("ran %+v, want %+v", f.runtimes.bash.ran(), want)
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
	f := newRunFixture(t, runSettings(t, nil), echoes)
	got := f.run(t, "/r", "run", "pair")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if want := []bash.Turn{bashTurn(`echo "$what"`, "what=hi"), bashTurn(`echo "$what"`, "what=hi\n")}; !reflect.DeepEqual(f.runtimes.bash.ran(), want) {
		t.Errorf("ran %#v, want %#v", f.runtimes.bash.ran(), want)
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
	f := newRunFixture(t, runSettings(t, nil), echoes)
	got := f.run(t, "/r", "run", "--process", "nope", "--agent", "bash")
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  process nope: no layer holds the process \"nope\"\n", code: 1}
	if got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
	if ran := f.runtimes.bash.ran(); len(ran) > 0 {
		t.Errorf("ran %+v, want nothing", ran)
	}
}

// run.feature, "Outside a git worktree the request is refused".
//
// Contract test: the files home holds, as Agister ships them.
func TestOutsideAGitWorktreeTheRequestIsRefused(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, runSettings(t, nil), echoes)
	got := f.run(t, "/elsewhere", "run", "--process", "say", "--agent", "bash", "--param", "what=hi")
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  the launch directory \"/elsewhere\" is in no git worktree\n", code: 1}
	if got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
	if ran := f.runtimes.bash.ran(); len(ran) > 0 {
		t.Errorf("ran %+v, want nothing", ran)
	}
}

// run.feature, "What this slice does not run is refused before anything".
//
// Contract test: the files home holds, as Agister ships them.
func TestWhatThisSliceDoesNotRunIsRefusedBeforeAnything(t *testing.T) {
	t.Parallel()
	cases := []struct {
		declares string
		more     string
		files    map[string]string
		agent    string
		what     string
	}{
		{declares: "as it is", agent: "pi-m3", what: `the step "say": the runtime "pi"'s turn is not run yet`},
		{declares: `an input "prompt" from the param "what"`, more: "  prompt: {source: param, name: what}\n",
			agent: "claude-opus", what: `the process "say": the input "prompt", a document's name, is not run yet`},
		{declares: `an input "b" from the source "git.diff"`, more: "  b: {source: git.diff, base: {from: params.what}, head: HEAD}\n",
			agent: "bash", what: `the process "say": the input "b" from the source "git.diff" is not run yet`},
		{declares: "the stale limit no_event 1m", more: "limits: {stale: {no_event: 1m}}\n",
			agent: "bash", what: `steps[0]: its runtime "bash" reports lines for staleness limits, as its process "say" needs`},
		{declares: `an instruction "think"`, more: "instruction: think\n",
			agent: "bash", what: `steps[0]: its runtime "bash" takes an instruction, as its process "say" needs`},
		{declares: `the guidance "g", a prompt the settings hold`, more: "guidance: [g]\n",
			files: map[string]string{"/u/.agister/prompts/g.md": "Go.\n"},
			agent: "bash", what: `steps[0]: its runtime "bash" takes guidance, as its process "say" needs`},
	}
	for _, c := range cases {
		t.Run(c.declares, func(t *testing.T) {
			t.Parallel()
			files := map[string]string{"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", c.more)}
			maps.Copy(files, c.files)
			f := newRunFixture(t, runSettings(t, files), echoes)
			got := f.run(t, "/r", "run", "--process", "say", "--agent", c.agent, "--param", "what=hi")
			// Capability failures use resolve's diagnostic; slice limitations
			// use the execution diagnostic.
			want := ran{stderr: "agister: the run is refused, and nothing runs:\n  " + c.what + "\n", code: 1}
			if got != want {
				t.Errorf("ran %+v, want %+v", got, want)
			}
			if ran := f.runtimes.bash.ran(); len(ran) > 0 {
				t.Errorf("ran %+v, want nothing", ran)
			}
		})
	}
}

// run.feature, "What a parallel does not run yet is refused": the workflow
// "w", its parallel "p" holding a repeat, or read by a join's binding of a
// field within its outputs.
//
// Contract test: the files home holds, as Agister ships them.
// parallelThen is the parallel "p" of two "say", then items.
func parallelThen(items string) string {
	return `  - name: p
    parallel:
      - {name: a, process: say, agent: bash, inputs: {what: hi}}
      - {name: b, process: say, agent: bash, inputs: {what: hi}}
` + items
}

// repeatReading is the repeat "r" of one "say", its state and until as
// given.
func repeatReading(state, until string) string {
	return `  - name: r
    repeat:
      ` + state + `
      steps:
        - {name: s, process: say, agent: bash, inputs: {what: hi}}
      next: {last: {from: steps.s.outputs.stdout.head}}
      ` + until + `
      max: 1
`
}

func TestWhatAParallelDoesNotRunYetIsRefused(t *testing.T) {
	t.Parallel()
	cases := []struct {
		holding string
		steps   string
		what    string
	}{
		{holding: `of "say" and a repeat "r"`, steps: `  - name: p
    parallel:
      - {name: a, process: say, agent: bash, inputs: {what: hi}}
      - name: r
        repeat:
          state: {last: hi}
          steps:
            - {name: s, process: say, agent: bash, inputs: {what: hi}}
          next: {last: {from: steps.s.outputs.stdout.head}}
          until: {present: {from: state.last}}
          max: 1
`, what: `the item "r", a repeat,`},
		{holding: `of two "say", read by steps.p.outputs.x`, steps: `  - name: p
    parallel:
      - {name: a, process: say, agent: bash, inputs: {what: hi}}
      - {name: b, process: say, agent: bash, inputs: {what: hi}}
  - {name: j, process: say, agent: bash, inputs: {what: {from: steps.p.outputs.x}}}
`, what: `a field within the parallel "p"'s outputs`},
		{holding: `of two "say", read by an arm's if`, steps: parallelThen(`  - name: choose
    branch:
      - {name: x, if: {equals: [{from: steps.p.outputs.x}, 0]}, process: say, agent: bash, inputs: {what: hi}, outputs: {o: {from: steps.x.outputs.stdout}}}
      - {name: y, process: say, agent: bash, inputs: {what: hi}, outputs: {o: {from: steps.y.outputs.stdout}}}
`), what: `a field within the parallel "p"'s outputs`},
		{holding: `of two "say", read by a repeat's state`, steps: parallelThen(repeatReading(`state: {last: {from: steps.p.outputs.x}}`, `until: {present: {from: state.last}}`)), what: `a field within the parallel "p"'s outputs`},
		{holding: `of two "say", read by a repeat's until`, steps: parallelThen(repeatReading(`state: {last: hi}`, `until: {equals: [{from: steps.p.outputs.x}, 0]}`)), what: `a field within the parallel "p"'s outputs`},
		{holding: `of two "say", then a session read by a condition`, steps: parallelThen(`  - {name: c, process: say, agent: bash, inputs: {what: hi}}
` + repeatReading(`state: {last: hi}`, `until: {present: {from: steps.c.session}}`)), what: `the session of "c", read as a value,`},
		{holding: `of two "say", then a step named as a pass`, steps: parallelThen(`  - {name: j/1, process: say, agent: bash, inputs: {what: hi}}
`), what: `the item "j/1", named as a pass,`},
	}
	for _, c := range cases {
		t.Run(c.holding, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(t, runSettings(t, map[string]string{
				"/u/.agister/workflows/w.yaml": "schema: agister.workflow/v1alpha1\nparams:\n  what: {default: hi}\nsteps:\n" + c.steps,
			}), echoes)
			got := f.run(t, "/r", "run", "w")
			want := ran{stderr: "agister: the run is refused, and nothing runs:\n  the workflow \"w\": " + c.what + " is not run yet\n", code: 1}
			if got != want {
				t.Errorf("ran\n%+v\nwant\n%+v", got, want)
			}
			if ran := f.runtimes.bash.ran(); len(ran) > 0 {
				t.Errorf("ran %+v, want nothing", ran)
			}
		})
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
	built, unrun, err := planOf("", resolved, read.documents, map[string]call.Inputs{"bash/1": call.InEnvironment})
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
// Serial: SIGINT, SIGTERM, SIGHUP and SIGQUIT are delivered to this process.
func TestASignalToAgisterCancelsTheRun(t *testing.T) {
	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP, syscall.SIGQUIT} {
		func() {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			started := make(chan struct{})
			ended := make(chan error, 1)
			f := newRunFixture(t, runSettings(t, nil), func(runCtx context.Context, _ bash.Turn) (bash.Ended, error) {
				close(started)
				select {
				case <-runCtx.Done():
					ended <- runCtx.Err()
				case <-ctx.Done():
					ended <- ctx.Err()
				}
				return bash.Ended{Stdout: kept(""), Stderr: kept("")}, nil
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
