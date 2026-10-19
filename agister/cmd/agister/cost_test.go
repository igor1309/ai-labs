package main

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

func usd(n float64) *float64 { return &n }

// cost.feature, "A step on claude-code is given its process's cost limit".
// Contract test: the files home holds, as Agister ships them.
func TestAStepOnClaudeCodeIsGivenItsProcessCostLimit(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, modelSettings(t, map[string]string{"/r/.agister/processes/ask.yaml": askProcess + "limits: {cost: 1}\n"}), nil)
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1", Cost: usd(0.25), SessionCost: usd(0.25)})
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("ran %+v", got)
	}
	turns := f.runtimes.claude.ran()
	if len(turns) != 1 || !reflect.DeepEqual(turns[0].Budget, usd(1)) || !reflect.DeepEqual(turns[0].SessionCostBefore, usd(0)) {
		t.Fatalf("turns %+v, want budget 1, session cost before 0", turns)
	}
	assertRecordedCosts(t, f.store.last(t), usd(0.25), usd(0.25))
}

// assertRecordedCosts checks the record's JSON contract, independently
// of the in-memory field that the composition fills.
func assertRecordedCosts(t *testing.T, record runstore.Record, cost, sessionCost *float64) {
	t.Helper()
	data, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	var raw struct {
		Calls []struct{ Result map[string]any }
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	if len(raw.Calls) != 1 {
		t.Fatalf("calls %s, want one", data)
	}
	for name, want := range map[string]*float64{"cost": cost, "session_cost": sessionCost} {
		got, ok := raw.Calls[0].Result[name]
		var expected any
		if want != nil {
			expected = *want
		}
		if !ok || got != expected {
			t.Errorf("record %s = %v, present %v; want %v", name, got, ok, expected)
		}
	}
}

// cost.feature: continuations take the latest call's session cost, while
// older records leave it unknown.
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationIsGivenTheSessionCostFromTheLatestRecord(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name         string
		before, cost *float64
	}{
		{"known", usd(1.25), usd(0.25)}, {"legacy", nil, nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newContinueFixture(t)
			f.settings["/r/.agister/processes/ask.yaml"] = askProcess + "limits: {cost: 1}\n"
			// The requested run points to the session; its later call owns the
			// current worktree and cost together.
			first := keptCall("R1/ask", "t1", "s1")
			first.Result.SessionCost = usd(0.5)
			latest := keptCall("R2/ask", "t1", "s1")
			latest.Result.SessionCost = c.before
			f.store.kept = map[string]runstore.Record{"R1": keptRun("R1", first), "R2": keptRun("R2", latest)}
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1", Cost: c.cost, SessionCost: usd(1.5)})
			got := f.run(t, "/r", continueArgs...)
			if got.stderr != "" || got.code != 0 {
				t.Fatalf("ran %+v", got)
			}
			turns := f.runtimes.claude.ran()
			if len(turns) != 1 || turns[0].Session != "s1" || !reflect.DeepEqual(turns[0].SessionCostBefore, c.before) || !reflect.DeepEqual(turns[0].Budget, usd(1)) {
				t.Fatalf("turns %+v, want s1, before %v, budget 1", turns, c.before)
			}
			assertRecordedCosts(t, f.store.last(t), c.cost, usd(1.5))
		})
	}
}

// cost.feature, "A step continuing a session in the run is given its cost".
// Contract test: the files home holds, as Agister ships them.
func TestAStepContinuingASessionInTheRunIsGivenItsCost(t *testing.T) {
	t.Parallel()
	f := newSessionFixture(t, talkWorkflow(), nil)
	f.settings["/r/.agister/processes/ask.yaml"] = askProcess + "limits: {cost: 1}\n"
	f.runtimes.claude.answer = func(_ context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		cost, total := 0.5, 0.5
		if turn.Session != "" {
			cost, total = 0.25, 0.75
		}
		return claudecode.Result{Reply: &claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1", Cost: usd(cost), SessionCost: usd(total)}}, nil
	}
	got := f.run(t, "/r", "run", "talk", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("ran %+v", got)
	}
	turns := f.runtimes.claude.ran()
	if len(turns) != 2 || turns[1].Session != "s1" || !reflect.DeepEqual(turns[1].SessionCostBefore, usd(0.5)) || !reflect.DeepEqual(turns[1].Budget, usd(1)) {
		t.Fatalf("turns %+v, want second given s1, before 0.5, budget 1", turns)
	}
	calls := f.store.last(t).Calls
	if len(calls) != 2 || !reflect.DeepEqual(calls[0].Result.SessionCost, usd(0.5)) || !reflect.DeepEqual(calls[1].Result.SessionCost, usd(0.75)) {
		t.Fatalf("recorded calls %+v", calls)
	}
}

// cost.feature: a runtime without budgets runs with a warning. Bash has
// the same facts contract as codex for this policy.
// Contract test: the files home holds, as Agister ships them.
func TestALimitOnARuntimeThatReportsNoCostSpendsNothing(t *testing.T) {
	t.Parallel()
	for _, runtime := range []string{"codex", "bash"} {
		t.Run(runtime, func(t *testing.T) {
			t.Parallel()
			settings := modelSettings(t, map[string]string{"/r/.agister/processes/ask.yaml": askProcess + "limits: {cost: 1}\n"})
			f := newRecordFixture(t, settings, echoes)
			agent, process := "codex-sol-61", "ask"
			if runtime == "bash" {
				agent, process = "bash", "say"
				f.settings["/r/.agister/processes/say.yaml"] = fmt.Sprintf(sayProcess, "", "limits: {cost: 1}\n")
				f.settings["/r/.agister/prompts/say.md"] = "echo hi"
			} else {
				f.runtimes.codex.answer = codexReply(codex.Reply{Output: []byte(`{"ok":true}`)})
			}
			param := "q=why"
			if runtime == "bash" {
				param = "what=hi"
			}
			got := f.run(t, "/r", "run", "--process", process, "--agent", agent, "--param", param)
			if got.stderr != "" || got.code != 0 {
				t.Fatalf("ran %+v", got)
			}
			warning := "the runtime " + runtime + " reports no cost: the cost limit 1 spends nothing"
			if p := printedOf(t, got); !slices.Contains(p.Warnings, warning) || p.Cost != nil {
				t.Fatalf("printed %+v, want unknown cost and warning %q", p, warning)
			}
			calls := f.store.last(t).Calls
			if len(calls) != 1 || !slices.Contains(calls[0].Result.Warnings, warning) {
				t.Fatalf("calls %+v, want warning %q", calls, warning)
			}
			if runtime == "codex" && len(f.runtimes.codex.ran()) != 1 {
				t.Fatal("codex did not run")
			}
		})
	}
}

// Reuse records the earlier call's session cost as well as its outcome.
// Contract test: the files home holds, as Agister ships them.
func TestAReusedCallKeepsItsSessionCost(t *testing.T) {
	t.Parallel()
	f := newReuseFixture(t)
	record := f.store.kept["R1"]
	record.Calls[0].Result.SessionCost = usd(1.25)
	f.store.kept["R1"] = record
	got := f.run(t, "/r", "run", "review", "--param", "q=why", "--reuse", "R1")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("ran %+v", got)
	}
	calls := f.store.last(t).Calls
	i := slices.IndexFunc(calls, func(c runstore.Call) bool { return c.Step == "a" })
	if i < 0 || calls[i].Reuses == nil || *calls[i].Reuses != "R1/a" || !reflect.DeepEqual(calls[i].Result.SessionCost, usd(1.25)) {
		t.Fatalf("calls %+v, want a reusing R1/a and session cost 1.25", calls)
	}
}
