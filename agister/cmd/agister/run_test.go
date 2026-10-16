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
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
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
	var stdout, stderr strings.Builder
	machine := host{ctx: context.Background(), environ: environ, clock: f.clock, timer: f.clock.Timer, signals: f.signals.watch}
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
		t.Errorf("ran %q, want %q", f.supervisor.ran(), want)
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
// Contract test: the files home holds, as Agister ships them.
func TestASignalToAgisterCancelsTheRun(t *testing.T) {
	t.Parallel()
	started := make(chan struct{})
	ended := make(chan error, 1)
	f := newRunFixture(runSettings(t, nil), func(ctx context.Context, _ supervisor.Program) (supervisor.Result, error) {
		close(started)
		<-ctx.Done()
		ended <- ctx.Err()
		return supervisor.Result{Stdout: kept(""), Stderr: kept("")}, nil
	})
	done := make(chan ran)
	go func() { done <- f.run(t, "/r", "run", "--process", "say", "--agent", "bash", "--param", "what=hi") }()
	<-started
	f.signals.fired <- syscall.SIGINT
	got := <-done
	if err := <-ended; !errors.Is(err, context.Canceled) {
		t.Errorf("the turn's context ended with %v, want it cancelled", err)
	}
	if got.code != 1 || got.stderr != "" {
		t.Errorf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
	if p := printedOf(t, got); p.Status != "interrupted" || p.Class == nil || *p.Class != "cancelled" {
		t.Errorf("printed %+v, want interrupted, class cancelled", p)
	}
	if started, stopped := f.signals.watches(); started != 1 || stopped != 1 {
		t.Errorf("signals watched %d times, stopped %d; want once each", started, stopped)
	}
}

// countedRoots is a worktree root spy whose root of "/r" and below is
// "/r", counting the directories asked.
type countedRoots struct {
	mu    sync.Mutex
	asked map[string]int
}

func (c *countedRoots) Root(dir string) (string, error) {
	c.mu.Lock()
	c.asked[dir]++
	c.mu.Unlock()
	return rootSpy{root: "/r"}.Root(dir)
}

// A run asks git for the launch directory's root once: layout asks for
// it, and the run's directory is the root layout was given.
//
// Contract test: the files home holds, as Agister ships them.
func TestARunAsksGitForTheRootOnce(t *testing.T) {
	t.Parallel()
	roots := &countedRoots{asked: map[string]int{}}
	clock := clocktest.NewClock(runStart)
	machine := host{ctx: context.Background(), environ: environ, clock: clock, timer: clock.Timer, signals: (&signalsSpy{}).watch}
	commandLine, err := build("/u", &linksSpy{}, newFilesystemSpy(runSettings(t, nil)), roots, &supervisorSpy{answer: echoes}, machine, &strings.Builder{}, &strings.Builder{})
	if err != nil {
		t.Fatal(err)
	}
	if code := commandLine.Run([]string{"run", "pair"}, "/r/a"); code != 0 {
		t.Fatalf("exit %d, want 0", code)
	}
	if want := map[string]int{"/r/a": 1}; !maps.Equal(roots.asked, want) {
		t.Errorf("asked %v, want %v", roots.asked, want)
	}
}

// sayCall is the call of the process "say" of runSettings, its script
// prompt, its time limit a minute and its plan's one warning "w".
func sayCall(prompt string) plannedCall {
	return plannedCall{
		declared: inputs.Declared{
			Params: []inputs.Param{{Name: "what"}},
			Inputs: []inputs.Input{{Name: "what", Source: "param", Arguments: map[string]inputs.Value{"name": {Text: "what"}}}},
		},
		step: call.Step{Prompt: prompt, TimeLimit: time.Minute, Warnings: []string{"w"}},
	}
}

// turnSpy is a spy of core/call's caller: it keeps each step it is asked
// to call, and answers result.
type turnSpy struct {
	result call.Result
	steps  []call.Step
}

func (s *turnSpy) Call(_ context.Context, step call.Step) call.Result {
	s.steps = append(s.steps, step)
	return s.result
}

// A step's call is given its process's environment and inputs, resolved
// over the params its bindings give, and its plan's time limit, and gives
// core/call's result in
// core/workflow's words; one whose inputs cannot be resolved is refused,
// failed, class "refused", with its plan's warnings, and no turn is
// taken.
func TestAStepsCallResolvesItsInputsBeforeItStarts(t *testing.T) {
	t.Parallel()
	resolver, err := inputs.New(map[string]inputs.Source{"param": inputs.ParamSource{}})
	if err != nil {
		t.Fatal(err)
	}
	clock := clocktest.NewClock(runStart)
	cost := 0.5
	spy := &turnSpy{result: call.Result{Status: call.Completed, Output: map[string]any{"exit_code": 0},
		Timing: call.Timing{Started: runStart, Ended: runStart.Add(time.Second), Duration: time.Second}, Cost: &cost, Warnings: []string{"w"}}}
	planned := sayCall(`echo "$what"`)
	planned.declared.Environment = []inputs.Variable{{Name: "MODE", Value: inputs.Value{Text: "quiet"}}}
	unplugged := sayCall("x")
	unplugged.declared.Inputs[0].Source = "git.revision"
	steps, err := newStepCalls(resolver, spy, clock, map[string]plannedCall{"a": planned, "b": unplugged})
	if err != nil {
		t.Fatal(err)
	}

	got := steps.Call(context.Background(), "a", map[string]string{"what": "hi"})
	want := workflow.Result{Status: workflow.Completed, Output: map[string]any{"exit_code": 0},
		Timing: workflow.Timing{Started: runStart, Ended: runStart.Add(time.Second), Duration: time.Second}, Cost: &cost, Warnings: []string{"w"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("a gave %+v, want %+v", got, want)
	}
	wantStep := call.Step{Prompt: `echo "$what"`, Environment: map[string]string{"MODE": "quiet"}, Inputs: map[string]string{"what": "hi"},
		TimeLimit: time.Minute, Warnings: []string{"w"}}
	if len(spy.steps) != 1 || !reflect.DeepEqual(spy.steps[0], wantStep) {
		t.Errorf("called %+v, want %+v", spy.steps, wantStep)
	}

	got = steps.Call(context.Background(), "b", map[string]string{"what": "hi"})
	want = workflow.Result{Status: workflow.Failed, Class: workflow.Refused, Timing: workflow.Timing{Started: runStart, Ended: runStart}, Warnings: []string{"w"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("b gave %+v, want %+v", got, want)
	}
	if len(spy.steps) != 1 {
		t.Errorf("called %+v, want b's turn not taken", spy.steps)
	}
}

// inputsSpy is a spy of core/inputs: it keeps what it is asked to
// resolve, and answers resolved and err.
type inputsSpy struct {
	resolved inputs.Resolved
	err      error
	declared []inputs.Declared
	given    []map[string]string
}

func (s *inputsSpy) Resolve(_ context.Context, declared inputs.Declared, given map[string]string) (inputs.Resolved, error) {
	s.declared = append(s.declared, declared)
	s.given = append(s.given, given)
	return s.resolved, s.err
}

// A workflow's boundary is what it declares, resolved by core/inputs over
// the params given: its params and each input's value; core/inputs'
// refusal refuses it.
func TestTheBoundaryIsResolvedByCoreInputs(t *testing.T) {
	t.Parallel()
	main := "main"
	declared := inputs.Declared{
		Params: []inputs.Param{{Name: "base", Default: &main}, {Name: "goal"}},
		Inputs: []inputs.Input{{Name: "g", Source: "param", Arguments: map[string]inputs.Value{"name": {Text: "goal"}}}},
	}
	spy := &inputsSpy{resolved: inputs.Resolved{
		Params: map[string]string{"base": "main", "goal": "x"},
		Inputs: map[string]inputs.Fixed{"g": {Value: "x", Identity: "digest"}},
	}}
	got, err := boundary{inputs: spy, declared: declared}.Resolve(context.Background(), map[string]string{"goal": "x"})
	if err != nil {
		t.Fatal(err)
	}
	want := workflow.Boundary{Params: map[string]string{"base": "main", "goal": "x"}, Inputs: map[string]string{"g": "x"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("boundary %+v, want %+v", got, want)
	}
	if !reflect.DeepEqual(spy.declared, []inputs.Declared{declared}) || !reflect.DeepEqual(spy.given, []map[string]string{{"goal": "x"}}) {
		t.Errorf("resolved %+v over %v, want %+v over goal=x", spy.declared, spy.given, declared)
	}

	refusal := &inputs.Refusal{Reason: `input "g": no param "goal" is given`}
	if _, err := (boundary{inputs: &inputsSpy{err: refusal}, declared: declared}).Resolve(context.Background(), nil); !errors.Is(err, refusal) {
		t.Errorf("refused with %v, want %v", err, refusal)
	}
}

// A workflow's boundary declares what its documents give: each param, in
// its order, with its default; and each input, with its source and its
// arguments, a text or what they read.
//
// Contract test: the files home holds, as Agister ships them.
func TestAWorkflowsBoundaryIsDeclaredFromItsDocuments(t *testing.T) {
	t.Parallel()
	settings := runSettings(t, map[string]string{"/u/.agister/workflows/greet.yaml": `schema: agister.workflow/v1alpha1
params:
  base: {default: main}
  goal: {}
inputs:
  g: {source: param, name: {from: params.goal}}
  h: {source: param, name: base}
steps:
  - {name: a, process: say, agent: bash, inputs: {what: {from: inputs.g}}}
`})
	read, err := readSettings("/u/.agister", "/r", newFilesystemSpy(settings), rootSpy{root: "/r"}, wrappersSpy{"bash/1": {}})
	if err != nil {
		t.Fatal(err)
	}
	resolved, faults := read.resolver.Resolve(resolve.Document(resolve.KindWorkflow, "greet").WithParams("goal"))
	if len(faults) > 0 {
		t.Fatalf("faults %+v", faults)
	}
	built, unrun, err := planOf("greet", resolved, read.documents, "bash/1")
	if err != nil || len(unrun) > 0 {
		t.Fatalf("not run %q, error %v", unrun, err)
	}
	main := "main"
	want := inputs.Declared{
		Params: []inputs.Param{{Name: "base", Default: &main}, {Name: "goal"}},
		Inputs: []inputs.Input{
			{Name: "g", Source: "param", Arguments: map[string]inputs.Value{"name": {Reads: &inputs.Reference{Of: inputs.Params, Name: "goal"}}}},
			{Name: "h", Source: "param", Arguments: map[string]inputs.Value{"name": {Text: "base"}}},
		},
	}
	if !reflect.DeepEqual(built.boundary, want) {
		t.Errorf("boundary\n got %+v\nwant %+v", built.boundary, want)
	}
}

// A param not given takes its default, and one given overrides it: a
// workflow's, and a process's, whether it runs alone or under a step that
// binds it no value.
//
// Contract test: the files home holds, as Agister ships them.
func TestAParamNotGivenTakesItsDefaultThroughTheRun(t *testing.T) {
	t.Parallel()
	const (
		greet = `schema: agister.workflow/v1alpha1
params:
  what: {default: hi}
steps:
  - {name: a, process: say, agent: bash, inputs: {what: {from: params.what}}}
outputs:
  said: {from: steps.a.outputs.stdout.head}
`
		quiet = `schema: agister.workflow/v1alpha1
steps:
  - {name: a, process: say, agent: bash}
outputs:
  said: {from: steps.a.outputs.stdout.head}
`
	)
	workflow := map[string]string{"/u/.agister/workflows/greet.yaml": greet}
	process := map[string]string{"/u/.agister/processes/say.yaml": strings.Replace(fmt.Sprintf(sayProcess, "", ""), "what: {}", "what: {default: hi}", 1)}
	unbound := map[string]string{"/u/.agister/workflows/quiet.yaml": quiet}
	maps.Copy(unbound, process)
	cases := []struct {
		name  string
		files map[string]string
		args  []string
		what  string
	}{
		{"a workflow's, not given", workflow, []string{"run", "greet"}, "hi"},
		{"a workflow's, given", workflow, []string{"run", "greet", "--param", "what=yo"}, "yo"},
		{"a process's run alone, not given", process, []string{"run", "--process", "say", "--agent", "bash"}, "hi"},
		{"a process's run alone, given", process, []string{"run", "--process", "say", "--agent", "bash", "--param", "what=yo"}, "yo"},
		{"a process's under a step that binds it none", unbound, []string{"run", "quiet"}, "hi"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(runSettings(t, c.files), echoes)
			got := f.run(t, "/r", c.args...)
			if got.stderr != "" || got.code != 0 {
				t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
			}
			if want := []supervisor.Program{bashProgram(`echo "$what"`, "what="+c.what)}; !reflect.DeepEqual(f.supervisor.ran(), want) {
				t.Errorf("ran %+v, want %+v", f.supervisor.ran(), want)
			}
		})
	}
}

// bashRunSpy is a spy of the bash wrapper: it keeps each turn and answers
// result and err.
type bashRunSpy struct {
	result bash.Ended
	err    error
	turns  []bash.Turn
}

func (s *bashRunSpy) Run(_ context.Context, turn bash.Turn) (bash.Ended, error) {
	s.turns = append(s.turns, turn)
	return s.result, s.err
}

// A turn on bash runs its prompt as the script, in its directory with its
// environment, and gives how the program ended, each stream by the fields
// of a call's output, incomplete or not; a program that could not
// start is core's ErrNotStarted, and any other error passes as it is.
func TestATurnOnBashRunsItsPromptAsTheScript(t *testing.T) {
	t.Parallel()
	other := errors.New("broken pipe")
	cases := []struct {
		name       string
		result     bash.Ended
		err        error
		want       call.Ended
		notStarted bool
		wantErr    error
	}{
		{name: "an exit", result: bash.Ended{Code: 3, Stdout: bash.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od"}, Stderr: bash.Stream{Head: "eh", Tail: "et", Size: 5, Digest: "ed", Incomplete: true}},
			want: call.Ended{Code: 3, Stdout: call.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od"}, Stderr: call.Stream{Head: "eh", Tail: "et", Size: 5, Digest: "ed"}}},
		{name: "a signal", result: bash.Ended{Signal: "killed"}, want: call.Ended{Signal: "killed"}},
		{name: "no start", err: fmt.Errorf("bash: %w", bash.ErrNotStarted), notStarted: true, wantErr: bash.ErrNotStarted},
		{name: "another error", err: other, wantErr: other},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &bashRunSpy{result: c.result, err: c.err}
			turns, err := newBashTurns(spy)
			if err != nil {
				t.Fatal(err)
			}
			got, err := turns.Turn(context.Background(), call.Turn{Prompt: "echo", Dir: "/r", Env: []string{"A=1"}})
			if !reflect.DeepEqual(got, c.want) || !errors.Is(err, c.wantErr) || errors.Is(err, call.ErrNotStarted) != c.notStarted {
				t.Errorf("ended %+v, %v; want %+v, %v, not started %v", got, err, c.want, c.wantErr, c.notStarted)
			}
			if want := []bash.Turn{{Script: "echo", Dir: "/r", Env: []string{"A=1"}}}; !reflect.DeepEqual(spy.turns, want) {
				t.Errorf("turns %+v, want %+v", spy.turns, want)
			}
		})
	}
}

// A program bash asks for runs on the supervisor as it is asked, and gives
// how it ended, each stream as the supervisor kept it, incomplete or not;
// a program that could not start is bash's ErrNotStarted, and any other
// error passes as it is.
func TestBashsProgramRunsOnTheSupervisor(t *testing.T) {
	t.Parallel()
	other := errors.New("broken pipe")
	cases := []struct {
		name       string
		result     supervisor.Result
		err        error
		want       bash.Ended
		notStarted bool
		wantErr    error
	}{
		{name: "an exit", result: supervisor.Result{Code: 3,
			Stdout: supervisor.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od"},
			Stderr: supervisor.Stream{Head: "eh", Tail: "et", Size: 5, Digest: "ed", Incomplete: true}},
			want: bash.Ended{Code: 3, Stdout: bash.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od"}, Stderr: bash.Stream{Head: "eh", Tail: "et", Size: 5, Digest: "ed", Incomplete: true}}},
		{name: "a signal", result: supervisor.Result{Signal: "killed"}, want: bash.Ended{Signal: "killed"}},
		{name: "no start", err: fmt.Errorf("bash: %w", supervisor.ErrNotStarted), notStarted: true, wantErr: supervisor.ErrNotStarted},
		{name: "another error", err: other, wantErr: other},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &supervisorSpy{answer: func(context.Context, supervisor.Program) (supervisor.Result, error) { return c.result, c.err }}
			programs, err := newSupervised(spy)
			if err != nil {
				t.Fatal(err)
			}
			got, err := programs.Run(context.Background(), bash.Program{Name: "bash", Args: []string{"-c", "echo"}, Dir: "/r", Env: []string{"A=1"}})
			if !reflect.DeepEqual(got, c.want) || !errors.Is(err, c.wantErr) || errors.Is(err, bash.ErrNotStarted) != c.notStarted {
				t.Errorf("ended %+v, %v; want %+v, %v, not started %v", got, err, c.want, c.wantErr, c.notStarted)
			}
			if want := []supervisor.Program{{Name: "bash", Args: []string{"-c", "echo"}, Dir: "/r", Env: []string{"A=1"}}}; !reflect.DeepEqual(spy.ran(), want) {
				t.Errorf("ran %+v, want %+v", spy.ran(), want)
			}
		})
	}
}

// The runs take each of their collaborators, and fail without one.
func TestNewRunsFailsWithoutACollaborator(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(runStart)
	turns, err := newBashTurns(&bashRunSpy{})
	if err != nil {
		t.Fatal(err)
	}
	full := func() (string, links, *filesystemSpy, rootSpy, wrappersSpy, turn, host) {
		return "/u/.agister", &linksSpy{}, newFilesystemSpy(nil), rootSpy{root: "/r"}, wrappersSpy{},
			turn{contract: "bash/1", runtime: turns},
			host{ctx: context.Background(), clock: clock, timer: clock.Timer, signals: (&signalsSpy{}).watch}
	}
	home, l, fs, roots, wrappers, tu, machine := full()
	if _, err := newRuns(home, l, fs, roots, wrappers, tu, machine); err != nil {
		t.Fatalf("runs with every collaborator: %v", err)
	}
	cases := map[string]func() error{
		"home":  func() error { _, err := newRuns("", l, fs, roots, wrappers, tu, machine); return err },
		"links": func() error { _, err := newRuns(home, nil, fs, roots, wrappers, tu, machine); return err },
		"turn": func() error {
			_, err := newRuns(home, l, fs, roots, wrappers, turn{contract: "bash/1"}, machine)
			return err
		},
		"context": func() error {
			m := machine
			m.ctx = nil
			_, err := newRuns(home, l, fs, roots, wrappers, tu, m)
			return err
		},
		"clock": func() error {
			m := machine
			m.clock = nil
			_, err := newRuns(home, l, fs, roots, wrappers, tu, m)
			return err
		},
		"timer": func() error {
			m := machine
			m.timer = nil
			_, err := newRuns(home, l, fs, roots, wrappers, tu, m)
			return err
		},
		"signals": func() error {
			m := machine
			m.signals = nil
			_, err := newRuns(home, l, fs, roots, wrappers, tu, m)
			return err
		},
		"wrappers": func() error { _, err := newRuns(home, l, fs, roots, nil, tu, machine); return err },
	}
	for name, build := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if err := build(); err == nil || err.Error() != "runs: no "+name {
				t.Errorf("runs without %s: %v, want runs: no %s", name, err, name)
			}
		})
	}
}
