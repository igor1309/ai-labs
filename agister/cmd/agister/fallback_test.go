package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/files"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// The composition keeps the answering agent, primary outcome, both plans
// and definitions, and every failed turn, and never follows a second
// fallback. A non-capacity end never calls the fallback.
// Contract test: the settings home ships, including codex's fallback.
func TestFallbackIsReportedAndRecordedWithoutChaining(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name      string
		primary   codex.Class
		fallback  claudecode.Class
		waits     int
		status    string
		class     string
		answering string
	}{
		{"completed fallback", codex.Capacity, "", 1, "completed", "", "claude-opus"},
		{"capacity fallback", codex.Capacity, claudecode.Capacity, 2, "failed", "capacity", "claude-opus"},
		{"rate limited primary", codex.RateLimited, "", 0, "failed", "rate_limited", "codex-sol-61"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRecordFixture(t, modelSettings(t, map[string]string{
				"/r/.agister/agents/codex-sol-61.toml": "effort = \"low\"\n",
				"/r/.agister/agents/claude-opus.toml":  "effort = \"medium\"\nfallback = \"third\"\n",
				"/r/.agister/agents/third.toml":        "schema = \"agister.agent/v1alpha1\"\nruntime = \"codex\"\nmodel = \"third-model\"\n",
			}), nil)
			f.runtimes.codex.answer = answers[codex.Turn](codex.Result{Session: "primary-session", Reply: &codex.Reply{
				Failure: c.primary, Reason: "Selected model is at capacity", Session: "primary-session"}})
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Failure: c.fallback, Reason: "Overloaded",
				Output: []byte(`{"ok":true}`), Session: "fallback-session"})
			var held [][2]int
			answer := f.runtimes.claude.answer
			f.runtimes.claude.answer = func(ctx context.Context, turn claudecode.Turn) (claudecode.Result, error) {
				_, alone, shared := f.holding.locks()
				held = append(held, [2]int{alone, shared})
				return answer(ctx, turn)
			}
			done := make(chan ran, 1)
			go func() {
				done <- f.run(t, "/r", "run", "--process", "ask", "--agent", "codex-sol-61", "--param", "q=why")
			}()
			for range c.waits {
				for _, wait := range []time.Duration{30 * time.Second, time.Minute, 3 * time.Minute, 5 * time.Minute} {
					f.clock.Started(wait)
					f.clock.Advance(wait)
				}
			}
			got := <-done
			p := printedOf(t, got)
			var output, printedOutput map[string]any
			if c.status == "completed" {
				output = map[string]any{"ok": true}
				printedOutput = map[string]any{"output": output}
			}
			if !reflect.DeepEqual(p.Output, printedOutput) {
				t.Errorf("printed output %v, want %v", p.Output, printedOutput)
			}
			if p.Status != c.status || (p.Class == nil) != (c.class == "") || p.Class != nil && *p.Class != c.class || got.stderr != "" {
				t.Fatalf("result %+v, stderr %q; want %s, %s", p, got.stderr, c.status, c.class)
			}
			turns := f.runtimes.codex.ran()
			wantSessions := []string{""}
			if c.waits > 0 {
				wantSessions = append(wantSessions, "primary-session", "primary-session", "primary-session", "primary-session")
			}
			var sessions []string
			for i, turn := range turns {
				message := askMessage
				if i > 0 {
					message = "Go on."
				}
				sessions = append(sessions, turn.Session)
				if turn.Model != "gpt-6.1-sol" || turn.Effort != "low" || turn.Message != message {
					t.Errorf("primary turn %+v, want message %q on primary model", turn, message)
				}
			}
			if !slices.Equal(sessions, wantSessions) {
				t.Errorf("sessions %q, want %q", sessions, wantSessions)
			}
			record := f.store.last(t)
			if len(record.Calls) != 1 {
				t.Fatalf("calls %+v, want one", record.Calls)
			}
			kept := record.Calls[0]
			if kept.Agent != c.answering || kept.Result.Status != c.status || !reflect.DeepEqual(kept.Result.Output, output) {
				t.Errorf("call %+v, want agent %s, status %s, output %v", kept, c.answering, c.status, output)
			}
			fallbackTurns := f.runtimes.claude.ran()
			if c.waits == 0 {
				if kept.Primary != nil || len(fallbackTurns) != 0 {
					t.Fatalf("primary %+v, fallback turns %+v; want neither", kept.Primary, fallbackTurns)
				}
				return
			}
			wantFallbacks := 1
			if c.fallback != "" {
				wantFallbacks = 5
			}
			wantTurns := make([]claudecode.Turn, wantFallbacks)
			for i := range wantTurns {
				wantTurns[i] = claudecode.Turn{Message: "Go on.", Dir: "/r", Env: append(slices.Clone(environ), "A=1"),
					Instruction: "i", Model: "opus", Effort: "medium", Options: []string{"Glob"}, Schema: []byte(answerSchema),
					Session: "fallback-session"}
				if i == 0 {
					wantTurns[i].Session, wantTurns[i].SessionCostBefore, wantTurns[i].Message = "", usd(0), askMessage
				}
			}
			if !reflect.DeepEqual(fallbackTurns, wantTurns) {
				t.Errorf("fallback turns\n%+v\nwant\n%+v", fallbackTurns, wantTurns)
			}
			for _, h := range held {
				if h != [2]int{0, 1} {
					t.Errorf("fallback holds %v, want the same reader hold", held)
				}
			}
			if asked, alone, shared := f.holding.locks(); len(asked) != 1 || alone != 0 || shared != 0 {
				t.Errorf("holds %+v, %d alone, %d shared; want one acquired, released", asked, alone, shared)
			}
			primary := kept.Primary
			if primary == nil || primary.Agent != "codex-sol-61" || primary.Result.Status != "failed" || primary.Result.Output != nil ||
				primary.Result.Class == nil || *primary.Result.Class != "capacity" ||
				primary.Result.Reason == nil || *primary.Result.Reason != "5 of 5 turns at capacity: Selected model is at capacity" ||
				primary.Result.Session == nil || *primary.Result.Session != "primary-session" || !slices.Equal(primary.Permissions.Options, []string{"read-only"}) ||
				!slices.Equal(kept.Permissions.Options, []string{"Glob"}) {
				t.Errorf("primary %+v, answering plan %+v; want primary capacity result and both agents' plans", primary, kept.Permissions)
			}
			if !slices.Contains(p.Warnings, `the step "ask" was made again on the agent "claude-opus", the fallback of "codex-sol-61": 5 of 5 turns at capacity: Selected model is at capacity`) {
				t.Errorf("warnings %q, want answering agent and cause", p.Warnings)
			}
			if kept.Result.Session == nil || *kept.Result.Session != "fallback-session" || !reflect.DeepEqual(modelPrintedOf(t, got).Sessions, map[string]string{"ask": "fallback-session"}) {
				t.Errorf("record session %v, result sessions %v; want fallback's", kept.Result.Session, modelPrintedOf(t, got).Sessions)
			}
			var definitions []string
			for _, d := range kept.Definitions {
				if d.Kind == "agent" || d.Kind == "runtime" {
					definitions = append(definitions, d.Kind+"/"+d.Name)
				}
			}
			if want := []string{"agent/claude-opus", "agent/codex-sol-61", "runtime/claude-code", "runtime/codex"}; !slices.Equal(definitions, want) {
				t.Errorf("definitions %q, want %q", definitions, want)
			}
			_, _, events := f.store.given()
			var capacity, fallback int
			for _, e := range events {
				switch e.event.Kind {
				case runstore.Capacity:
					capacity++
				case runstore.Fallback:
					fallback++
					if capacity != 5 || e.event.Agent != "claude-opus" {
						t.Errorf("fallback event %+v after %d capacity turns", e.event, capacity)
					}
				}
			}
			if capacity != c.waits*5 || fallback != 1 || !strings.Contains(got.progress, "· ask: falling back to claude-opus\n") {
				t.Errorf("capacity events %d, fallbacks %d, progress %q", capacity, fallback, got.progress)
			}
		})
	}
}

// The composition gives the fallback the day's remainder after the
// primary's spend, even with no process cost limit. Spending that
// remainder at capacity ends the call without another retry.
// Contract test: the files home holds, as Agister ships them.
func TestFallbackReceivesAndEnforcesTheRemainingDailyBudget(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, limits string }{
		{"no process cost limit", ""},
		{"daily remainder tighter than process cost limit", "limits: {cost: 5}\n"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRecordFixture(t, modelSettings(t, map[string]string{
				"/u/.agister/budget.yaml":        "daily: {cost: 3.25}\n",
				"/r/.agister/processes/ask.yaml": askProcess + c.limits,
			}), nil)
			const earlier = "20261017T060000Z-aaaaaa"
			f.store.kept = map[string]runstore.Record{
				earlier: keptRun(earlier, dailyCall("2026-10-17T06:00:00Z", usd(1))),
			}
			f.runtimes.codex.answer = codexReply(codex.Reply{Failure: codex.Capacity,
				Reason: "Selected model is at capacity", Session: "primary-session", Cost: usd(0.25)})
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Failure: claudecode.Capacity,
				Reason: "Overloaded", Session: "fallback-session", Cost: usd(1)})
			done := make(chan ran, 1)
			go func() {
				done <- f.run(t, "/r", "run", "--process", "ask", "--agent", "codex-sol-61", "--param", "q=why")
			}()
			waits := []time.Duration{30 * time.Second, time.Minute, 3 * time.Minute, 5 * time.Minute}
			for _, wait := range waits {
				f.clock.Started(wait)
				f.clock.Advance(wait)
			}
			got := <-done
			primary := f.runtimes.codex.ran()
			if len(primary) != 5 {
				t.Fatalf("primary turns %+v, want five capacity turns", primary)
			}
			fallback := f.runtimes.claude.ran()
			if len(fallback) != 1 || !reflect.DeepEqual(fallback[0].Budget, usd(1)) {
				t.Fatalf("fallback turns %+v, want one turn with budget 1", fallback)
			}
			if gotWaits := f.clock.Waits(); !slices.Equal(gotWaits, waits) {
				t.Errorf("waits %v, want only primary waits %v", gotWaits, waits)
			}
			p := printedOf(t, got)
			const reason = "the daily budget 3.25 is spent: 3.25"
			if got.code != 1 || got.stderr != "" || p.Status != "failed" || p.Class == nil || *p.Class != "budget_exhausted" || p.Reason == nil || *p.Reason != reason {
				t.Fatalf("ran %+v, printed %+v; want failed budget_exhausted: %s", got, p, reason)
			}
			record := f.store.last(t)
			if len(record.Calls) != 1 {
				t.Fatalf("record calls %+v, want one", record.Calls)
			}
			kept := record.Calls[0]
			if !reflect.DeepEqual(kept.Result.Cost, usd(2.25)) {
				t.Errorf("recorded fallback cost %v, want 2.25", kept.Result.Cost)
			}
			if kept.Primary == nil || !reflect.DeepEqual(kept.Primary.Result.Cost, usd(1.25)) {
				t.Errorf("recorded primary %+v, want cost 1.25", kept.Primary)
			}

			f.random = randomSpy{0x55, 0xfd, 0x37}
			following := f.run(t, "/r", "run", "--process", "ask", "--agent", "codex-sol-61", "--param", "q=why")
			followingPrinted := printedOf(t, following)
			if following.code != 1 || following.stderr != "" || followingPrinted.Status != "failed" || followingPrinted.Class == nil || *followingPrinted.Class != "budget_exhausted" || followingPrinted.Reason == nil || *followingPrinted.Reason != reason {
				t.Fatalf("following run %+v, printed %+v; want failed budget_exhausted: %s", following, followingPrinted, reason)
			}
			if primary := f.runtimes.codex.ran(); len(primary) != 5 {
				t.Errorf("following command started primary turns %+v, want none", primary)
			}
			if fallback := f.runtimes.claude.ran(); len(fallback) != 1 {
				t.Errorf("following command started fallback turns %+v, want none", fallback)
			}
			if !slices.Contains(f.store.readIDs, record.ID) {
				t.Errorf("following command read runs %v, want the recorded fallback run %s", f.store.readIDs, record.ID)
			}
		})
	}
}

// Contract test: bad fallback settings on disk pass through the settings
// filesystem adapter to check, which names the offending agent file.
func TestCheckRefusesBadFallbackFiles(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, fallback, process, why string }{
		{"missing", "gone", "output: {schema: answer}\n", "it names an agent that resolves"},
		{"itself", "a", "output: {schema: answer}\n", "it names another agent"},
		{"incompatible runtime", "b", "output: {schema: answer}\n", `its runtime "bash" checks output against a schema`},
		{"instruction on bash", "b", "instruction: think\n", `its runtime "bash" takes an instruction`},
		{"guidance on bash", "b", "guidance: [g]\n", `its runtime "bash" takes guidance`},
		{"staleness on bash", "b", "limits: {stale: {no_event: 1m}}\n", `its runtime "bash" reports lines for staleness limits`},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			user := t.TempDir()
			home := filepath.Join(user, ".agister")
			settings := map[string]string{
				"agents/a.toml":        fmt.Sprintf("schema = \"agister.agent/v1alpha1\"\nruntime = \"claude\"\nfallback = %q\n", c.fallback),
				"agents/b.toml":        "schema = \"agister.agent/v1alpha1\"\nruntime = \"bash\"\n",
				"runtimes/claude.yaml": "schema: agister.runtime/v1alpha1\nadapter: claude-code\ncontract: claude-code/3\n",
				"runtimes/bash.yaml":   "schema: agister.runtime/v1alpha1\nadapter: bash\ncontract: bash/1\n",
				"processes/p.yaml":     "schema: agister.process/v1alpha1\n" + c.process,
				"prompts/g.md":         "guidance",
				"schemas/answer.json":  answerSchema,
				"workflows/w.yaml":     "schema: agister.workflow/v1alpha1\nsteps: [{name: s, process: p, agent: a}]\n",
			}
			for name, text := range settings {
				file := filepath.Join(home, name)
				if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(file, []byte(text), 0600); err != nil {
					t.Fatal(err)
				}
			}
			f := files.New()
			fs, err := newLayoutFiles(f)
			if err != nil {
				t.Fatal(err)
			}
			var out, stderr strings.Builder
			cli, err := build(user, f, fs, rootSpy{root: ""}, newRuntimesSpy(t).runtimes(), schemaValidator{},
				(&sourcesSpy{}).sourcing(), (&holdingSpy{}).holding(), (&storeSpy{}).at, idleHost(t), &out, &stderr)
			if err != nil {
				t.Fatal(err)
			}
			code := cli.Run([]string{"check"}, user)
			if code != 1 || stderr.Len() != 0 || !strings.Contains(out.String(), filepath.Join(home, "agents/a.toml")+" fallback:") || !strings.Contains(out.String(), c.why) {
				t.Errorf("exit %d, stdout %s, stderr %s; want bad fallback in agent file: %s", code, &out, &stderr, c.why)
			}
		})
	}
}
