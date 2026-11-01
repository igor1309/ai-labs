package main

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

const testedWorkflow = `schema: agister.workflow/v1alpha1
params: {brief: {}}
steps:
 - {name: build, process: implement, agent: codex-sol-61, inputs: {brief: {from: params.brief}}}
 - {name: test, process: tests, agent: bash}
 - name: fix
   branch:
    - name: passed
      if: {equals: [{from: steps.test.outputs.exit_code}, 0]}
      parallel:
       - {name: done, process: pass, agent: bash}
      outputs: {stopped: none}
    - name: repair
      repeat:
       state:
        code: {from: steps.test.outputs.exit_code}
        tail: {from: steps.test.outputs.stdout.tail}
       steps:
        - name: repair_tests
          process: repair
          agent: codex-sol-61
          session: {from: steps.build.session}
          inputs: {failure: {from: state.tail}}
        - {name: retest, process: tests, agent: bash}
       next:
        code: {from: steps.retest.outputs.exit_code}
        tail: {from: steps.retest.outputs.stdout.tail}
       until: {equals: [{from: state.code}, 0]}
       max: 3
      outputs: {stopped: {from: steps.repair.outputs.stopped}}
outputs: {stopped: {from: steps.fix.outputs.stopped}}
`

func loopSettings(t *testing.T) map[string]string {
	t.Helper()
	return runSettings(t, map[string]string{
		"/r/.agister/workflows/tested.yaml": testedWorkflow,
		"/u/.agister/processes/implement.yaml": `schema: agister.process/v1alpha1
prompt: builder
params: {brief: {}}
inputs: {brief: {source: param, name: brief}}
`,
		"/r/.agister/processes/repair.yaml": `schema: agister.process/v1alpha1
prompt: repair
params: {failure: {}}
inputs: {failure: {source: param, name: failure}}
`,
		"/r/.agister/processes/tests.yaml":    "schema: agister.process/v1alpha1\nprompt: tests\n",
		"/r/.agister/processes/pass.yaml":     "schema: agister.process/v1alpha1\nprompt: pass\n",
		"/r/.agister/prompts/builder.md":      "build the brief",
		"/r/.agister/prompts/repair.md":       "repair the tests",
		"/r/.agister/prompts/tests.md":        "run tests",
		"/r/.agister/prompts/pass.md":         "done",
		"/u/.agister/prompts/continuation.md": "continue building",
	})
}

// loopFixture runs the real composition with settings and runtime, git,
// store and clock spies; its ordered calls are the wrapper invocations,
// which a parallel makes at once.
type loopFixture struct {
	*runFixture
	mu           sync.Mutex
	calls        []string
	changeRepair bool
}

func newLoopFixture(t *testing.T, codes []int) *loopFixture {
	t.Helper()
	f := &loopFixture{}
	test, repair := 0, 0
	f.runFixture = newRecordFixture(t, loopSettings(t), func(_ context.Context, turn bash.Turn) (bash.Ended, error) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if turn.Script == "done" {
			f.calls = append(f.calls, "done")
			return bash.Ended{}, nil
		}
		name := "test"
		if test > 0 {
			name = fmt.Sprintf("retest/%d", test)
		}
		f.calls = append(f.calls, name)
		if test >= len(codes) {
			t.Errorf("unexpected test %s", name)
			return bash.Ended{}, nil
		}
		code := codes[test]
		test++
		return bash.Ended{Code: code, Stdout: kept(fmt.Sprintf("failure %d", test)), Stderr: kept("")}, nil
	})
	f.runtimes.codex.answer = func(ctx context.Context, turn codex.Turn) (codex.Result, error) {
		f.mu.Lock()
		defer f.mu.Unlock()
		name := "build"
		if turn.Session != "" {
			repair++
			name = fmt.Sprintf("repair_tests/%d", repair)
			if f.changeRepair {
				f.holding.write("changed")
			}
		}
		f.calls = append(f.calls, name)
		return codexReply(codex.Reply{Session: "builder-session", Output: []byte(`{}`)})(ctx, turn)
	}
	return f
}

// Contract test: the files home holds, as Agister ships them.
func TestRepairLoopPassesRepairsOrSpendsItsMaximum(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		codes   []int
		calls   []string
		stopped string
	}{
		{[]int{0}, []string{"build", "test", "done"}, "none"},
		{[]int{1, 0}, []string{"build", "test", "repair_tests/1", "retest/1"}, "until"},
		{[]int{1, 1, 1, 1}, []string{"build", "test", "repair_tests/1", "retest/1", "repair_tests/2", "retest/2", "repair_tests/3", "retest/3"}, "max"},
	} {
		t.Run(c.stopped, func(t *testing.T) {
			t.Parallel()
			f := newLoopFixture(t, c.codes)
			got := f.run(t, "/r", "run", "tested", "--param", "brief=b.md")
			result := modelPrintedOf(t, got)
			if got.code != 0 || got.stderr != "" || result.Status != "completed" || result.Output["stopped"] != c.stopped || !slices.Equal(f.calls, c.calls) {
				t.Fatalf("ran %+v, result %+v, calls %v", got, result, f.calls)
			}
			record := f.store.last(t)
			var names []string
			for _, call := range record.Calls {
				names = append(names, call.Step)
				if call.ID != record.ID+"/"+call.Step {
					t.Errorf("call id %s for %s", call.ID, call.Step)
				}
			}
			if !slices.Equal(names, c.calls) {
				t.Errorf("record calls %v, want %v", names, c.calls)
			}
			if len(c.codes) > 1 {
				assertRepairEvents(t, f, got, len(c.codes)-1, c.stopped)
			}
		})
	}
}

func assertRepairEvents(t *testing.T, f *loopFixture, got ran, passes int, stopped string) {
	t.Helper()
	_, _, events := f.store.given()
	var facts []map[string]any
	for _, stored := range events {
		switch stored.event.Kind {
		case runstore.Branch, runstore.Pass, runstore.Stopped:
			if stored.id != f.store.last(t).ID {
				t.Errorf("event run %s", stored.id)
			}
			facts = append(facts, asJSON(t, stored.event))
		}
	}
	if len(facts) != passes+2 {
		t.Fatalf("facts %v", facts)
	}
	branch := facts[0]
	if branch["step"] != "fix" || branch["arm"] != "repair" || !reflect.DeepEqual(branch["conditions"], []any{map[string]any{"arm": "passed", "holds": false, "read": map[string]any{"steps.test.outputs.exit_code": float64(1)}}}) {
		t.Fatalf("branch event %v", branch)
	}
	for pass := 1; pass <= passes; pass++ {
		event := facts[pass]
		code := float64(1)
		if stopped == "until" && pass == passes {
			code = 0
		}
		if event["kind"] != "pass" || event["step"] != "repair" || event["pass"] != float64(pass) || !reflect.DeepEqual(event["state"], map[string]any{"code": code, "tail": fmt.Sprintf("failure %d", pass+1)}) {
			t.Errorf("pass event %v", event)
		}
	}
	stop := facts[len(facts)-1]
	if stop["step"] != "repair" || stop["stopped"] != stopped || stop["passes"] != float64(passes) {
		t.Errorf("stop event %v", stop)
	}
	for _, line := range []string{"· repair_tests/1: started on codex-sol-61\n", "· fix: took repair\n", "· repair: ended pass 1\n", fmt.Sprintf("· repair: stopped %s after %d passes\n", stopped, passes)} {
		if !strings.Contains(got.progress, line) {
			t.Errorf("progress %q lacks %q", got.progress, line)
		}
	}
}

// Contract test: the files home holds, as Agister ships them.
func TestEveryRepairContinuesTheLatestBuilderCall(t *testing.T) {
	t.Parallel()
	f := newLoopFixture(t, []int{1, 1, 0})
	got := f.run(t, "/r", "run", "tested", "--param", "brief=b.md")
	if got.code != 0 {
		t.Fatalf("ran %+v", got)
	}
	record := f.store.last(t)
	continues := continuesOf(record.Calls)
	if continues["repair_tests/1"] != record.ID+"/build" || continues["repair_tests/2"] != record.ID+"/repair_tests/1" {
		t.Errorf("continues %v", continues)
	}
	turns := f.runtimes.codex.ran()
	if len(turns) != 3 || turns[0].Session != "" || turns[1].Session != "builder-session" || turns[2].Session != "builder-session" {
		t.Fatalf("turns %+v", turns)
	}
	for i, turn := range turns[1:] {
		if !strings.Contains(turn.Message, fmt.Sprintf("## failure\n\nfailure %d", i+1)) {
			t.Errorf("repair message %s", turn.Message)
		}
	}
}

// Contract test: the files home holds, as Agister ships them.
func TestRepairLoopReuseMatchesThePassAndWorktree(t *testing.T) {
	t.Parallel()
	for _, change := range []bool{false, true} {
		t.Run(fmt.Sprint(change), func(t *testing.T) {
			t.Parallel()
			codes := []int{1, 1, 0}
			if change {
				codes = []int{1, 0}
			}
			f := newLoopFixture(t, codes)
			first := f.run(t, "/r", "run", "tested", "--param", "brief=b.md")
			if first.code != 0 {
				t.Fatalf("first run %+v", first)
			}
			earlier := f.store.last(t)
			second := newLoopFixture(t, []int{0})
			second.store = f.store
			second.clock.Advance(time.Second)
			second.changeRepair = change
			got := second.run(t, "/r", "run", "tested", "--param", "brief=b.md", "--reuse", earlier.ID)
			result := modelPrintedOf(t, got)
			if got.code != 0 || result.Output["stopped"] != "until" {
				t.Fatalf("reuse %+v, result %+v", got, result)
			}
			calls := second.store.last(t).Calls
			for _, call := range calls {
				reused := call.Step == "test" || strings.HasPrefix(call.Step, "retest/") && !change
				if (call.Reuses != nil) != reused {
					t.Errorf("call %s reuses %v, want %t", call.Step, call.Reuses, reused)
				}
				if reused && call.Reuses != nil && *call.Reuses != earlier.ID+"/"+call.Step {
					t.Errorf("call %s reuses %s", call.Step, *call.Reuses)
				}
			}
			want := []string{"build", "repair_tests/1", "repair_tests/2"}
			if !change && !slices.Equal(second.calls, want) {
				t.Errorf("fresh calls %v, want %v", second.calls, want)
			}
			if change && len(second.runtimes.bash.ran()) != 1 {
				t.Errorf("fresh bash calls %v", second.runtimes.bash.ran())
			}
			if !change && (len(calls) != 6 || calls[3].Result.Output["exit_code"] != 1 || calls[5].Result.Output["exit_code"] != 0) {
				t.Errorf("reused calls %+v", calls)
			}
		})
	}
}

// Contract test: the files home holds, as Agister ships them.
func TestCheckAcceptsTheRepairLoop(t *testing.T) {
	t.Parallel()
	f := newLoopFixture(t, nil)
	got := f.run(t, "/r", "check")
	if got.code != 0 || strings.Contains(got.stdout, "refuses tested") || len(f.calls) > 0 {
		t.Fatalf("check %+v, calls %v", got, f.calls)
	}
}
