package main

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// claudeCodeRunSpy is a spy of the claude-code wrapper: it keeps each turn
// and why its context had ended, nil where it had not, gives the turn's
// report its test's reports, in order, and answers result and err.
type claudeCodeRunSpy struct {
	result  claudecode.Result
	err     error
	reports []claudecode.Report
	turns   []claudecode.Turn
	ended   []error
}

func (s *claudeCodeRunSpy) Run(ctx context.Context, turn claudecode.Turn, report func(claudecode.Report)) (claudecode.Result, error) {
	s.turns = append(s.turns, turn)
	s.ended = append(s.ended, ctx.Err())
	for _, r := range s.reports {
		report(r)
	}
	return s.result, s.err
}

// codexRunSpy is a spy of the codex wrapper: it keeps each turn and why
// its context had ended, nil where it had not, gives the turn's report its
// test's reports, in order, and answers result and err.
type codexRunSpy struct {
	result  codex.Result
	err     error
	reports []codex.Report
	turns   []codex.Turn
	ended   []error
}

func (s *codexRunSpy) Run(ctx context.Context, turn codex.Turn, report func(codex.Report)) (codex.Result, error) {
	s.turns = append(s.turns, turn)
	s.ended = append(s.ended, ctx.Err())
	for _, r := range s.reports {
		report(r)
	}
	return s.result, s.err
}

// modelTurn is a model's turn as core/call gives it, every field given.
var modelTurn = call.Turn{Prompt: "m", Dir: "/r", Env: []string{"A=1"}, Instruction: "i", Model: "opus", Effort: "high",
	Options: []string{"Read"}, Schema: []byte("{}"), Session: "s0"}

// A turn on claude-code runs its prompt as the message, in its context,
// with its directory, environment, instruction, model, effort, options,
// schema and session, and gives each line it reports, a tool's result
// among them, how the program ended, the session it read and its reply in
// core's words, its failure class by its name; a program ended by a signal gives no reply, its
// session still; a program that could not start is
// core's ErrNotStarted, and any other error passes as it is.
func TestATurnOnClaudeCodeRunsItsPromptAsTheMessage(t *testing.T) {
	t.Parallel()
	other := errors.New("broken pipe")
	count := func(n int64) *int64 { return &n }
	cost := 0.25
	cases := []struct {
		name       string
		result     claudecode.Result
		err        error
		want       call.Ended
		notStarted bool
		wantErr    error
	}{
		{name: "a reply", result: claudecode.Result{
			Ended:   claudecode.Ended{Code: 1, Stdout: claudecode.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od", Incomplete: true}, Stderr: claudecode.Stream{Head: "eh"}},
			Session: "s1",
			Reply: &claudecode.Reply{Text: "t", Output: []byte(`{"ok":true}`), Session: "s1", Cost: &cost, SessionCost: usd(1.25), CostSource: "claude-code",
				Usage:   claudecode.Usage{Input: count(1), Output: count(2), CacheRead: count(3), CacheWrite: count(4)},
				Failure: claudecode.RateLimited, Reason: "429"}},
			want: call.Ended{Code: 1, Stdout: call.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od"}, Stderr: call.Stream{Head: "eh"}, Session: "s1",
				Reply: &call.Reply{Text: "t", Output: []byte(`{"ok":true}`), Session: "s1", Cost: &cost, SessionCost: usd(1.25), CostSource: "claude-code",
					Usage:   call.Usage{Input: count(1), Output: count(2), CacheRead: count(3), CacheWrite: count(4)},
					Failure: call.RateLimited, Reason: "429"}}},
		{name: "a signal", result: claudecode.Result{Ended: claudecode.Ended{Signal: "killed"}, Session: "s1"}, want: call.Ended{Signal: "killed", Session: "s1"}},
		{name: "no start", err: fmt.Errorf("claude: %w", claudecode.ErrNotStarted), notStarted: true, wantErr: claudecode.ErrNotStarted},
		{name: "another error", err: other, wantErr: other},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &claudeCodeRunSpy{result: c.result, err: c.err, reports: []claudecode.Report{
				{Tool: &claudecode.Tool{Name: "Bash", Input: "ls"}}, {Result: true}, {}, {Tool: &claudecode.Tool{Name: "Read", Input: "a.go"}}}}
			turns, err := newClaudeCodeTurns(spy)
			if err != nil {
				t.Fatal(err)
			}
			var reported []call.Report
			given := modelTurn
			given.SessionCostBefore, given.Budget = usd(1), usd(0.75)
			got, err := turns.Turn(endedContext(), given, func(r call.Report) { reported = append(reported, r) })
			if want := []call.Report{{Tool: &call.Tool{Name: "Bash", Input: "ls"}}, {Result: true}, {}, {Tool: &call.Tool{Name: "Read", Input: "a.go"}}}; !reflect.DeepEqual(reported, want) {
				t.Errorf("reported %+v, want %+v", reported, want)
			}
			if !reflect.DeepEqual(got, c.want) || !errors.Is(err, c.wantErr) || errors.Is(err, call.ErrNotStarted) != c.notStarted {
				t.Errorf("ended %+v, %v; want %+v, %v, not started %v", got, err, c.want, c.wantErr, c.notStarted)
			}
			want := []claudecode.Turn{{Message: "m", Dir: "/r", Env: []string{"A=1"}, Instruction: "i", Model: "opus", Effort: "high",
				Options: []string{"Read"}, Schema: []byte("{}"), Session: "s0", SessionCostBefore: usd(1), Budget: usd(0.75)}}
			if !reflect.DeepEqual(spy.turns, want) {
				t.Errorf("turns %+v, want %+v", spy.turns, want)
			}
			if want := []error{context.Canceled}; !reflect.DeepEqual(spy.ended, want) {
				t.Errorf("the wrapper's contexts ended by %v, want %v", spy.ended, want)
			}
		})
	}
}

// A turn on codex runs its prompt as the message, in its context, with its
// directory, environment, instruction, model, effort, options, schema and
// session, and gives each line it reports, a tool's result among them, how
// the program ended, the session it read and its reply in core's words,
// its failure class by its name, its cost, session's cost, cost source and
// why its cost is unknown as the wrapper gives them; a program ended by a signal gives no reply,
// its session still; a program that could not start
// is core's ErrNotStarted, and any other error passes as it is.
func TestATurnOnCodexRunsItsPromptAsTheMessage(t *testing.T) {
	t.Parallel()
	other := errors.New("broken pipe")
	count := func(n int64) *int64 { return &n }
	cases := []struct {
		name       string
		result     codex.Result
		err        error
		want       call.Ended
		notStarted bool
		wantErr    error
	}{
		{name: "a reply", result: codex.Result{
			Ended:   codex.Ended{Code: 1, Stdout: codex.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od", Incomplete: true}, Stderr: codex.Stream{Head: "eh"}},
			Session: "t1",
			Reply: &codex.Reply{Text: "t", Output: []byte(`{"ok":true}`), Session: "t1",
				Cost: usd(0.25), SessionCost: usd(1.25), CostSource: "ccusage", CostUnknown: "why",
				Usage:   codex.Usage{Input: count(1), Output: count(2), CacheRead: count(3), Reasoning: count(5)},
				Failure: codex.NoResult, Reason: "none"}},
			want: call.Ended{Code: 1, Stdout: call.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od"}, Stderr: call.Stream{Head: "eh"}, Session: "t1",
				Reply: &call.Reply{Text: "t", Output: []byte(`{"ok":true}`), Session: "t1",
					Cost: usd(0.25), SessionCost: usd(1.25), CostSource: "ccusage", CostUnknown: "why",
					Usage:   call.Usage{Input: count(1), Output: count(2), CacheRead: count(3), Reasoning: count(5)},
					Failure: call.NoResult, Reason: "none"}}},
		{name: "a signal", result: codex.Result{Ended: codex.Ended{Signal: "killed"}, Session: "t1"}, want: call.Ended{Signal: "killed", Session: "t1"}},
		{name: "no start", err: fmt.Errorf("codex: %w", codex.ErrNotStarted), notStarted: true, wantErr: codex.ErrNotStarted},
		{name: "another error", err: other, wantErr: other},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &codexRunSpy{result: c.result, err: c.err, reports: []codex.Report{
				{Tool: &codex.Tool{Name: "command", Input: "go test"}}, {Result: true}, {}, {Tool: &codex.Tool{Name: "web_search", Input: "q"}}}}
			turns, err := newCodexTurns(spy)
			if err != nil {
				t.Fatal(err)
			}
			var reported []call.Report
			got, err := turns.Turn(endedContext(), modelTurn, func(r call.Report) { reported = append(reported, r) })
			if want := []call.Report{{Tool: &call.Tool{Name: "command", Input: "go test"}}, {Result: true}, {}, {Tool: &call.Tool{Name: "web_search", Input: "q"}}}; !reflect.DeepEqual(reported, want) {
				t.Errorf("reported %+v, want %+v", reported, want)
			}
			if !reflect.DeepEqual(got, c.want) || !errors.Is(err, c.wantErr) || errors.Is(err, call.ErrNotStarted) != c.notStarted {
				t.Errorf("ended %+v, %v; want %+v, %v, not started %v", got, err, c.want, c.wantErr, c.notStarted)
			}
			want := []codex.Turn{{Message: "m", Dir: "/r", Env: []string{"A=1"}, Instruction: "i", Model: "opus", Effort: "high",
				Options: []string{"Read"}, Schema: []byte("{}"), Session: "s0"}}
			if !reflect.DeepEqual(spy.turns, want) {
				t.Errorf("turns %+v, want %+v", spy.turns, want)
			}
			if want := []error{context.Canceled}; !reflect.DeepEqual(spy.ended, want) {
				t.Errorf("the wrapper's contexts ended by %v, want %v", spy.ended, want)
			}
		})
	}
}

// The model turns are built with their wrapper.
func TestTheModelTurnsNeedTheirWrapper(t *testing.T) {
	t.Parallel()
	if _, err := newClaudeCodeTurns(nil); err == nil {
		t.Error("claude-code turns built with no wrapper, want an error")
	}
	if _, err := newCodexTurns(nil); err == nil {
		t.Error("codex turns built with no wrapper, want an error")
	}
}

// Core takes a call's inputs on claude-code and codex as their wrappers'
// facts say, and each wrapper's say its message.
func TestCoreTakesTheInputsOnAModelAsItsFactsSay(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		claude claudecode.Inputs
		codex  codex.Inputs
		want   call.Inputs
	}{
		{claudecode.InEnvironment, codex.InEnvironment, call.InEnvironment},
		{claudecode.InMessage, codex.InMessage, call.InMessage},
		{0, 0, 0},
	} {
		if got := claudeCodeInputs(c.claude); got != c.want {
			t.Errorf("claude-code's %d taken as %d, want %d", c.claude, got, c.want)
		}
		if got := codexInputs(c.codex); got != c.want {
			t.Errorf("codex's %d taken as %d, want %d", c.codex, got, c.want)
		}
	}
	claude, err := claudecode.New(idleSupervisor[claudecode.Program, claudecode.Ended]{})
	if err != nil {
		t.Fatal(err)
	}
	if got := claudeCodeInputs(claude.Facts().Inputs); got != call.InMessage {
		t.Errorf("claude-code's inputs taken as %d, want in the message", got)
	}
	cx, err := codex.New(idleSupervisor[codex.Program, codex.Ended]{}, "/t")
	if err != nil {
		t.Fatal(err)
	}
	if got := codexInputs(cx.Facts().Inputs); got != call.InMessage {
		t.Errorf("codex's inputs taken as %d, want in the message", got)
	}
}

// Each step's call is made by the caller of its turn's contract, and step
// calls are built with a caller for every step's.
func TestEachStepIsCalledByTheCallerOfItsContract(t *testing.T) {
	t.Parallel()
	resolver, err := inputs.New(map[string]inputs.Source{"param": inputs.ParamSource{}}, briefPaths{paths: &sourcesSpy{}})
	if err != nil {
		t.Fatal(err)
	}
	clock := clocktest.NewClock(runStart)
	onBash, onCodex := sayCall("b"), sayCall("c")
	onCodex.contract = "codex/2"
	bashSpy := &turnSpy{result: call.Result{Status: call.Completed}}
	codexSpy := &turnSpy{result: call.Result{Status: call.Failed, Class: call.Auth}}
	steps, err := newStepCalls(resolver, &admissionSpy{}, map[string]turnCaller{"bash/1": bashSpy, "codex/2": codexSpy}, clock,
		map[string]plannedCall{"a": onBash, "b": onCodex}, &callsSpy{}, noDailyBudget)
	if err != nil {
		t.Fatal(err)
	}
	if got := steps.Call(context.Background(), "b", "b", map[string]string{"what": "hi"}, "", discard); got.Class != "auth" {
		t.Errorf("b gave %+v, want codex's answer", got)
	}
	if got := steps.Call(context.Background(), "a", "a", map[string]string{"what": "hi"}, "", discard); got.Status != "completed" {
		t.Errorf("a gave %+v, want bash's answer", got)
	}
	if len(bashSpy.steps) != 1 || bashSpy.steps[0].Prompt != "b" || len(codexSpy.steps) != 1 || codexSpy.steps[0].Prompt != "c" {
		t.Errorf("bash called %+v, codex %+v; want a on bash, b on codex", bashSpy.steps, codexSpy.steps)
	}

	_, err = newStepCalls(resolver, &admissionSpy{}, map[string]turnCaller{"bash/1": bashSpy}, clock, map[string]plannedCall{"a": onBash, "b": onCodex}, &callsSpy{}, noDailyBudget)
	if want := `step calls: no caller for the step "b", of the contract "codex/2"`; err == nil || err.Error() != want {
		t.Errorf("step calls with no caller for b's contract: %v, want %s", err, want)
	}
}
