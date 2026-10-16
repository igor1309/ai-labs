package main

import (
	"context"
	"errors"
	"fmt"
	"io"
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
	group "github.com/igor1309/ai-labs/gokit/supervisor"
)

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

// Process environment values come from the checked settings and are evaluated
// over the step's params and inputs. They replace the host's values; inputs
// replace a process variable of the same name.
//
// Contract test: the files home holds, as Agister ships them; integrates settings and core.
func TestProcessEnvironmentsReachTheProgram(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, value, want string }{
		{"literal", "quiet", "quiet"},
		{"param", "{from: params.what}", "hi"},
		{"input", "{from: inputs.what}", "input-value"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			settings := runSettings(t, map[string]string{
				"/u/.agister/processes/say.yaml": `schema: agister.process/v1alpha1
prompt: say
params:
  what: {}
  payload: {default: input-value}
inputs:
  what: {source: param, name: payload}
environment:
  MODE: ` + c.value + `
  what: process
`,
			})
			f := newRunFixture(settings, echoes)
			hostEnv := append(slices.Clone(environ), "MODE=host", "what=host")
			got := f.runWatching(t, f.signals.watch, hostEnv, "/r", "run", "--process", "say", "--agent", "bash", "--param", "what=hi")
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("exit %d, stderr %q", got.code, got.stderr)
			}
			want := supervisor.Program{Name: "bash", Args: []string{"-c", `echo "$what"`}, Dir: "/r",
				Env: append(slices.Clone(environ), "MODE="+c.want, "what=input-value")}
			if programs := f.supervisor.ran(); !reflect.DeepEqual(programs, []supervisor.Program{want}) {
				t.Errorf("ran %+v, want %+v", programs, want)
			}
		})
	}
}

// processGroupsSpy answers in place of gokit's process groups: its check
// and start answer as given, and it keeps the commands it was asked to
// start.
type processGroupsSpy struct {
	checked  error
	process  group.Process
	started  error
	commands []group.Command
}

func (s *processGroupsSpy) CheckExitObservation() error { return s.checked }

func (s *processGroupsSpy) Start(c group.Command) (group.Process, error) {
	s.commands = append(s.commands, c)
	return s.process, s.started
}

// groupProcessSpy answers in place of a gokit process. The group's ID and
// token are no part of the supervisor's process: the nil Process they
// come from panics if they are asked for.
type groupProcessSpy struct {
	group.Process
	stdout   io.ReadCloser
	signaled error
	exited   error
	exit     group.Exit
	signals  []syscall.Signal
}

func (s *groupProcessSpy) Stdout() io.ReadCloser { return s.stdout }

func (s *groupProcessSpy) Signal(signal syscall.Signal) error {
	s.signals = append(s.signals, signal)
	return s.signaled
}

func (s *groupProcessSpy) Exited() error    { return s.exited }
func (s *groupProcessSpy) Wait() group.Exit { return s.exit }

// The supervisor's program is started as gokit's command, its stderr the
// supervisor's file; what the check, the start and the process answer
// passes as gokit gives it, and an exit's code or signal in the
// supervisor's words.
func TestTheSupervisorsProgramsStartInGokitsProcessGroups(t *testing.T) {
	t.Parallel()
	code := func(c int) *int { return &c }
	for _, c := range []struct {
		name string
		exit group.Exit
		want supervisor.Exit
	}{
		{"a code", group.Exit{Code: code(3)}, supervisor.Exit{Code: 3}},
		{"the code 0", group.Exit{Code: code(0)}, supervisor.Exit{}},
		{"a signal", group.Exit{Signal: "killed"}, supervisor.Exit{Signal: "killed"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			stderr := new(os.File)
			stdout := io.NopCloser(strings.NewReader("out"))
			signaled, exited := errors.New("no such group"), errors.New("cannot observe")
			process := &groupProcessSpy{stdout: stdout, signaled: signaled, exited: exited, exit: c.exit}
			groups := &processGroupsSpy{process: process}
			starter, err := newGroupStarter(groups)
			if err != nil {
				t.Fatal(err)
			}
			started, err := starter.Start(supervisor.Program{Name: "bash", Args: []string{"-c", "echo"}, Dir: "/r", Env: []string{"A=1"}}, stderr)
			if err != nil {
				t.Fatal(err)
			}
			want := []group.Command{{Name: "bash", Args: []string{"-c", "echo"}, Dir: "/r", Env: []string{"A=1"}, Stderr: stderr}}
			if !reflect.DeepEqual(groups.commands, want) {
				t.Errorf("started %+v, want %+v", groups.commands, want)
			}
			if got := started.Stdout(); got != stdout {
				t.Errorf("stdout %v, want the process's %v", got, stdout)
			}
			if err := started.Signal(syscall.SIGTERM); err != signaled {
				t.Errorf("signal: %v, want %v", err, signaled)
			}
			if !slices.Equal(process.signals, []syscall.Signal{syscall.SIGTERM}) {
				t.Errorf("signalled %v, want SIGTERM", process.signals)
			}
			if err := started.Exited(); err != exited {
				t.Errorf("exited: %v, want %v", err, exited)
			}
			if got := started.Wait(); got != c.want {
				t.Errorf("exit %+v, want %+v", got, c.want)
			}
		})
	}
}

// A check or a start gokit fails passes as gokit gives it, and a failed
// start gives no process.
func TestGokitsFailuresReachTheSupervisorAsTheyAre(t *testing.T) {
	t.Parallel()
	unsupported, broken := errors.ErrUnsupported, errors.New("no such program")
	starter, err := newGroupStarter(&processGroupsSpy{checked: unsupported, started: broken})
	if err != nil {
		t.Fatal(err)
	}
	if err := starter.CheckExitObservation(); err != unsupported {
		t.Errorf("check: %v, want %v", err, unsupported)
	}
	if process, err := starter.Start(supervisor.Program{Name: "bash"}, nil); process != nil || err != broken {
		t.Errorf("start: %v, %v; want no process, %v", process, err, broken)
	}
}

// The group starter takes gokit's process groups, and fails without them.
func TestNewGroupStarterFailsWithoutProcessGroups(t *testing.T) {
	t.Parallel()
	if _, err := newGroupStarter(nil); err == nil || err.Error() != "group starter: no process groups" {
		t.Errorf("group starter without process groups: %v", err)
	}
}
