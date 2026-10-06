package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Stale recovery (ADR-024) through Calls: the runner is a spy whose turns
// are scripted, and the clock and the timers are the test's.

// turnStep is one scripted turn: what its runtime reports while it runs,
// whether it then waits to be ended, and how it ends.
type turnStep struct {
	act  func(ctx context.Context, sink app.EventSink)
	hang bool
	turn run.Turn
}

// play scripts the harness's runner: one step per turn, in order. A turn
// that hangs never ends by itself: only its context, which a staleness
// limit cancels, or the harness's cleanup ends it.
func play(h *harness, steps ...turnStep) {
	var taken atomic.Int32
	for _, step := range steps {
		h.runner.turns = append(h.runner.turns, step.turn)
	}
	h.runner.acting = func(ctx context.Context, sink app.EventSink) {
		n := int(taken.Add(1)) - 1
		if n >= len(steps) {
			return
		}
		if steps[n].act != nil {
			steps[n].act(ctx, sink)
		}
		if steps[n].hang {
			select {
			case <-ctx.Done():
			case <-h.runner.release:
			}
		}
	}
}

// ended is how a runtime reports a turn Agister ended: interrupted,
// cancelled, in the session given.
func ended(session string) run.Turn {
	return run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassCancelled, ""), ProviderSessionID: session}
}

// silent is a turn in session that reports nothing for longer than
// stale.no_event 5m.
func silent(timers *timersSpy, session string) turnStep {
	return turnStep{act: func(context.Context, app.EventSink) { timers.advance(6 * time.Minute) }, hang: true, turn: ended(session)}
}

// repeating is a turn in session that makes call three times in a row,
// each but the last ending with result, when one is given.
func repeating(session string, call app.ToolCall, result string) turnStep {
	return turnStep{act: func(_ context.Context, sink app.EventSink) {
		for n := 1; n <= 3; n++ {
			call.ID = fmt.Sprintf("t%d", n)
			sink.ToolStarted(call)
			sink.ToolFinished(app.ToolResult{ID: call.ID, Output: result, Reported: result != ""})
		}
	}, hang: true, turn: ended(session)}
}

// commanding is a turn in session whose tool runs call's command for the
// whole of stale.tool_command 4m: short of the no_event 5m a test may set
// beside it, so only the one limit is reached.
func commanding(timers *timersSpy, session string, call app.ToolCall) turnStep {
	return turnStep{act: func(_ context.Context, sink app.EventSink) {
		call.ID, call.Command = "c1", true
		sink.ToolStarted(call)
		timers.advance(4 * time.Minute)
	}, hang: true, turn: ended(session)}
}

// completes is a turn that ends as the harness's default one does: valid,
// in session prov-1.
func completes(h *harness) turnStep { return turnStep{turn: h.runner.turn} }

// recoveryHarness is a staleHarness whose policy also gives the budget of
// resumes, with the instruction "Recover.", and whose agent is resumable.
func recoveryHarness(t *testing.T, limits string, resumes int) (*harness, *timersSpy) {
	t.Helper()
	h, timers := staleHarness(t, fmt.Sprintf("%s, recover: {max_resumes: %d, instruction: Recover.}", limits, resumes))
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	return h, timers
}

// eventsOf lists the call's events of kind, in order.
func eventsOf(h *harness, kind string) []run.Event {
	h.recorder.mu.Lock()
	defer h.recorder.mu.Unlock()
	var found []run.Event
	for _, event := range h.recorder.events {
		if event.Kind == kind {
			found = append(found, event)
		}
	}
	return found
}

// digestOf is the SHA-256 of text, as a record keeps it.
func digestOf(text string) string {
	digest := sha256.Sum256([]byte(text))
	return hex.EncodeToString(digest[:])
}

// outcomes lists the outcome of each of the record's recoveries.
func outcomes(record run.Record) []string {
	var list []string
	for _, recovery := range record.Recoveries {
		list = append(list, recovery.Outcome)
	}
	return list
}

var (
	goTest  = app.ToolCall{Name: "Bash", Input: `{"command":"go test ./..."}`}
	tailLog = app.ToolCall{Name: "Bash", Input: `{"command":"tail -f log"}`}
)

// staleCase is one staleness limit: the policy's limit, a turn that
// reaches it, the evidence a recovery turn is sent for it, and how a call
// it ends is concluded.
type staleCase struct {
	name     string
	limits   string
	stale    func(*timersSpy) turnStep
	limit    string
	evidence string
	// left is what the stale turn leaves of the call's 20m.
	left   time.Duration
	status run.Status
	class  run.Class
}

func staleCases() []staleCase {
	return []staleCase{
		{
			name: "repeated_tool_calls", limits: "repeated_tool_calls: 3", limit: run.StaleRepeatedToolCalls,
			stale: func(*timersSpy) turnStep { return repeating("prov-1", goTest, "FAIL\texample.com/a") },
			evidence: "## stale limit\n\nstale.repeated_tool_calls: the same tool call was made 3 times in a row, and Agister ended the turn.\n\n" +
				"## tool call\n\nBash\n\n```\n{\"command\":\"go test ./...\"}\n```\n\n## last result\n\n```\nFAIL\texample.com/a\n```",
			// A repeated call takes no time here.
			left: 20 * time.Minute, status: run.Failed, class: run.ClassBudgetExhausted,
		},
		{
			name: "tool_command", limits: "tool_command: 4m", limit: run.StaleToolCommand,
			stale: func(timers *timersSpy) turnStep { return commanding(timers, "prov-1", tailLog) },
			evidence: "## stale limit\n\nstale.tool_command: a tool's command ran for 4m0s, and Agister ended the turn.\n\n" +
				"## command\n\nBash\n\n```\n{\"command\":\"tail -f log\"}\n```",
			left: 16 * time.Minute, status: run.Interrupted, class: run.ClassTimeout,
		},
		{
			name: "no_event", limits: "no_event: 5m", limit: run.StaleNoEvent,
			stale:    func(timers *timersSpy) turnStep { return silent(timers, "prov-1") },
			evidence: "## stale limit\n\nstale.no_event: the turn was interrupted after 5m0s without an event from the runtime.",
			left:     14 * time.Minute, status: run.Interrupted, class: run.ClassTimeout,
		},
	}
}

// A turn Agister ended at a staleness limit is followed by one recovery
// turn: it resumes the session the stale turn reported, with the
// instruction and that limit's evidence, under what is left of the call's
// timeout. The call completes, and the recovery is on record with the
// stale turn it followed, the digest of the message sent, both sessions
// and its outcome.
func TestAStaleTurnIsFollowedByARecoveryTurn(t *testing.T) {
	t.Parallel()
	for _, c := range staleCases() {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, c.limits, 1)
			play(h, c.stale(timers), completes(h))
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != run.Completed || string(record.Result.Output) != `{"outcome":"no"}` {
				t.Fatalf("result = %+v: %s", record.Result, message(record))
			}
			turns := h.runner.calls()
			if len(turns) != 2 || turns[0].ResumeSessionID != "" {
				t.Fatalf("turns = %+v", turns)
			}
			recovery := turns[1]
			if want := "Recover.\n\n" + c.evidence; recovery.Prompt != want {
				t.Fatalf("message\n%s\nwant\n%s", recovery.Prompt, want)
			}
			// The rest of the request is the stale turn's own, in its
			// session, under the time the stale turn left.
			if recovery.ResumeSessionID != "prov-1" || turns[0].Timeout != 20*time.Minute || recovery.Timeout != c.left ||
				recovery.Cwd != turns[0].Cwd || recovery.Instruction != turns[0].Instruction || recovery.MaxCostUSD != nil {
				t.Fatalf("recovery turn = %+v, want %s left", recovery, c.left)
			}
			if len(record.Recoveries) != 1 {
				t.Fatalf("recoveries = %+v", record.Recoveries)
			}
			got := record.Recoveries[0]
			if got.Number != 1 || got.Follows != 1 || got.Stale.Limit != c.limit || got.Stale.At.IsZero() ||
				got.MessageSHA256 != digestOf(recovery.Prompt) || got.Resumed != "prov-1" || got.Session != "prov-1" ||
				got.Outcome != run.RecoveryCompleted || got.Error != nil {
				t.Fatalf("recovery = %+v", got)
			}
			// The latest turn is the recovery's, not the stale one.
			if record.Turn.Stale != nil || record.Turn.Status != run.Completed || record.Result.Session.ProviderSessionID != "prov-1" {
				t.Fatalf("turn = %+v, session %+v", record.Turn, record.Result.Session)
			}
			started := eventsOf(h, "RECOVERY_STARTED")
			if len(started) != 1 || started[0].Data["limit"] != c.limit || started[0].Data["session"] != "prov-1" || started[0].Data["message_sha256"] != got.MessageSHA256 {
				t.Fatalf("events = %+v", started)
			}
		})
	}
}

// A repeated call whose runtime reported no result for it is recovered
// with the call alone: the message says nothing of a result.
func TestARepeatedCallWithoutAReportedResultIsRecoveredWithTheCallAlone(t *testing.T) {
	t.Parallel()
	h, _ := recoveryHarness(t, "repeated_tool_calls: 3", 1)
	play(h, repeating("prov-1", goTest, ""), completes(h))
	record := h.call(t, contract.CallRequest{})

	want := "Recover.\n\n## stale limit\n\nstale.repeated_tool_calls: the same tool call was made 3 times in a row, and Agister ended the turn.\n\n" +
		"## tool call\n\nBash\n\n```\n{\"command\":\"go test ./...\"}\n```"
	if turns := h.runner.calls(); record.Result.Status != run.Completed || len(turns) != 2 || turns[1].Prompt != want {
		t.Fatalf("result = %+v, turns %+v", record.Result, turns)
	}
	if tool := record.Recoveries[0].Stale.Tool; tool == nil || tool.Result != nil {
		t.Fatalf("stale tool = %+v", tool)
	}
}

// The result on a repeated call's stale record is the last one the runtime
// reported for a call of the streak: an earlier streak's is not it.
func TestARepeatedCallsStaleRecordKeepsTheLastResultOfItsStreak(t *testing.T) {
	t.Parallel()
	h, _ := staleHarness(t, "repeated_tool_calls: 3")
	h.runner.block = true
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		call := func(id string, call app.ToolCall, result string) {
			call.ID = id
			sink.ToolStarted(call)
			sink.ToolFinished(app.ToolResult{ID: id, Output: result, Reported: true})
		}
		call("t1", goTest, "first")
		call("t2", tailLog, "another call's")
		call("t3", goTest, "second")
		call("t4", goTest, "third")
		call("t5", goTest, "never reported: the turn is ended at its start")
	}
	record := h.call(t, contract.CallRequest{})

	stale := record.Turn.Stale
	if stale == nil || stale.Count != 3 || stale.Tool == nil || stale.Tool.ID != "t5" || stale.Tool.Result == nil || *stale.Tool.Result != "third" {
		t.Fatalf("stale = %+v, tool %+v", stale, stale.Tool)
	}
	if event, ok := staleEvent(h); !ok || event.Data["result"] != "third" {
		t.Fatalf("event = %+v, %v", event, ok)
	}
}

// The same limit reached again on the same thing ends the call with that
// limit's status and class, though a resume is left: the evidence is not
// sent twice, and the recovery's record says the same limit again.
func TestTheSameStalenessAgainEndsTheCall(t *testing.T) {
	t.Parallel()
	for _, c := range staleCases() {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, c.limits, 2)
			play(h, c.stale(timers), c.stale(timers))
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != c.status || class(record) != c.class || !strings.HasPrefix(message(record), "stale: ") || !strings.Contains(message(record), "(stale."+c.limit+")") {
				t.Fatalf("result = %+v", record.Result)
			}
			if turns := h.runner.calls(); len(turns) != 2 {
				t.Fatalf("turns = %d, want the stale turn and one recovery", len(turns))
			}
			if !reflect.DeepEqual(outcomes(record), []string{run.RecoverySameLimit}) || record.Recoveries[0].Error == nil || record.Recoveries[0].Error.Class != c.class {
				t.Fatalf("recoveries = %+v", record.Recoveries)
			}
			refused := eventsOf(h, "RECOVERY_NOT_STARTED")
			if len(refused) != 1 || refused[0].Data["limit"] != c.limit || !strings.Contains(fmt.Sprint(refused[0].Data["reason"]), "the same evidence was sent before") {
				t.Fatalf("events = %+v", refused)
			}
		})
	}
}

// With max_resumes 0 a stale turn ends the call as it always did: no
// recovery turn, no recovery record and no event of one.
func TestWithoutABudgetAStaleTurnEndsTheCall(t *testing.T) {
	t.Parallel()
	for _, c := range staleCases() {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, c.limits, 0)
			play(h, c.stale(timers), completes(h))
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != c.status || class(record) != c.class || record.Turn.Stale == nil || record.Turn.Stale.Limit != c.limit {
				t.Fatalf("result = %+v, stale %+v", record.Result, record.Turn.Stale)
			}
			if turns := h.runner.calls(); len(turns) != 1 || len(record.Recoveries) != 0 {
				t.Fatalf("turns = %d, recoveries %+v", len(turns), record.Recoveries)
			}
			for _, kind := range h.recorder.kinds() {
				if strings.HasPrefix(kind, "RECOVERY_") {
					t.Fatalf("events = %v", h.recorder.kinds())
				}
			}
		})
	}
}

// A different limit after a recovery, or the same limit on another call,
// is new evidence: it is recovered while a resume is left, and with none
// left the call ends with the status and class of the limit just reached,
// not of the one recovered earlier.
func TestAnotherLimitAfterARecovery(t *testing.T) {
	t.Parallel()
	const limits = "no_event: 5m, repeated_tool_calls: 3"
	t.Run("with a resume left", func(t *testing.T) {
		t.Parallel()
		h, timers := recoveryHarness(t, limits, 2)
		play(h, silent(timers, "prov-1"), repeating("prov-1", goTest, ""), completes(h))
		record := h.call(t, contract.CallRequest{})

		if record.Result.Status != run.Completed || len(h.runner.calls()) != 3 {
			t.Fatalf("result = %+v: %s, turns %d", record.Result, message(record), len(h.runner.calls()))
		}
		if !reflect.DeepEqual(outcomes(record), []string{run.RecoveryDifferentLimit, run.RecoveryCompleted}) {
			t.Fatalf("recoveries = %+v", record.Recoveries)
		}
		first, second := record.Recoveries[0], record.Recoveries[1]
		if first.Number != 1 || first.Follows != 1 || first.Stale.Limit != run.StaleNoEvent ||
			second.Number != 2 || second.Follows != 2 || second.Stale.Limit != run.StaleRepeatedToolCalls {
			t.Fatalf("recoveries = %+v", record.Recoveries)
		}
		if turns := h.runner.calls(); !strings.Contains(turns[1].Prompt, "stale.no_event") || !strings.Contains(turns[2].Prompt, "stale.repeated_tool_calls") {
			t.Fatalf("messages = %q, %q", turns[1].Prompt, turns[2].Prompt)
		}
	})
	t.Run("the same limit on another call", func(t *testing.T) {
		t.Parallel()
		h, _ := recoveryHarness(t, limits, 2)
		play(h, repeating("prov-1", goTest, ""), repeating("prov-1", tailLog, ""), completes(h))
		record := h.call(t, contract.CallRequest{})

		if record.Result.Status != run.Completed || !reflect.DeepEqual(outcomes(record), []string{run.RecoveryDifferentLimit, run.RecoveryCompleted}) {
			t.Fatalf("result = %+v, recoveries %+v", record.Result, record.Recoveries)
		}
	})
	t.Run("with no resume left", func(t *testing.T) {
		t.Parallel()
		h, timers := recoveryHarness(t, limits, 1)
		play(h, silent(timers, "prov-1"), repeating("prov-1", goTest, ""), completes(h))
		record := h.call(t, contract.CallRequest{})

		// The repeated call's end, not the silent turn's timeout.
		if record.Result.Status != run.Failed || class(record) != run.ClassBudgetExhausted || !strings.Contains(message(record), "(stale.repeated_tool_calls)") {
			t.Fatalf("result = %+v", record.Result)
		}
		if len(h.runner.calls()) != 2 || !reflect.DeepEqual(outcomes(record), []string{run.RecoveryDifferentLimit}) {
			t.Fatalf("turns %d, recoveries %+v", len(h.runner.calls()), record.Recoveries)
		}
		refused := eventsOf(h, "RECOVERY_NOT_STARTED")
		if len(refused) != 1 || refused[0].Data["limit"] != run.StaleRepeatedToolCalls || refused[0].Data["reason"] != "no resume is left of stale.recover.max_resumes 1" {
			t.Fatalf("events = %+v", refused)
		}
	})
}

// A tool call or command is the same thing by the digest of its whole input
// (rule 3), not by the input its stale record keeps, which is cut at 300
// bytes: a limit reached on a second input that differs from the first only
// past that cut is new evidence, and gets its own recovery while a resume is
// left.
func TestAToolInputThatDiffersPastItsRecordedBytesGetsItsOwnRecovery(t *testing.T) {
	t.Parallel()
	// Two inputs alike in more than the bytes a stale record keeps of one.
	shared := `{"command":"` + strings.Repeat("x", 300)
	first, second := app.ToolCall{Name: "Bash", Input: shared + ` one"}`}, app.ToolCall{Name: "Bash", Input: shared + ` two"}`}
	for _, c := range []struct {
		name   string
		limits string
		limit  string
		stale  func(*timersSpy, app.ToolCall) turnStep
	}{
		{"repeated_tool_calls", "repeated_tool_calls: 3", run.StaleRepeatedToolCalls,
			func(_ *timersSpy, call app.ToolCall) turnStep { return repeating("prov-1", call, "") }},
		{"tool_command", "tool_command: 4m", run.StaleToolCommand,
			func(timers *timersSpy, call app.ToolCall) turnStep { return commanding(timers, "prov-1", call) }},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, c.limits, 2)
			play(h, c.stale(timers, first), c.stale(timers, second), completes(h))
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != run.Completed || !reflect.DeepEqual(outcomes(record), []string{run.RecoveryDifferentLimit, run.RecoveryCompleted}) {
				t.Fatalf("result = %+v: %s, recoveries %+v", record.Result, message(record), record.Recoveries)
			}
			// The second input's recovery is a turn of its own, in the call's
			// session, and none was refused.
			if turns := h.runner.calls(); len(turns) != 3 || turns[2].ResumeSessionID != "prov-1" || len(eventsOf(h, "RECOVERY_NOT_STARTED")) != 0 {
				t.Fatalf("turns = %+v, events %v", turns, h.recorder.kinds())
			}
			// Both records keep the same bounded input, and each the digest
			// of its own whole input.
			one, two := record.Recoveries[0].Stale, record.Recoveries[1].Stale
			if one.Limit != c.limit || two.Limit != c.limit || one.Tool == nil || two.Tool == nil {
				t.Fatalf("stale = %+v, %+v", one, two)
			}
			if one.Tool.Input != two.Tool.Input || len(one.Tool.Input) >= len(first.Input) ||
				one.Tool.SHA256 != digestOf(first.Input) || two.Tool.SHA256 != digestOf(second.Input) {
				t.Fatalf("tools = %+v, %+v", one.Tool, two.Tool)
			}
		})
	}
}

// A stale turn is not recovered where rule 1 does not hold: it reported no
// session, its cost is unknown under a cost limit, the limit is spent, or
// no time is left. The call ends with the limit's status and class after
// that one turn, no recovery is recorded, and an event says why.
func TestAStaleTurnIsNotRecoveredWhen(t *testing.T) {
	t.Parallel()
	costing := func(step turnStep, usd float64) turnStep {
		step.turn.CostUSD = &usd
		return step
	}
	cases := []struct {
		name   string
		policy string
		stale  func(*timersSpy) turnStep
		reason string
	}{
		{"it reported no session", "", func(timers *timersSpy) turnStep { return silent(timers, "") },
			"the stale turn reported no session to resume"},
		{"its cost is unknown under a cost limit", "max_cost_usd: 2\n", func(timers *timersSpy) turnStep { return silent(timers, "prov-1") },
			"a turn's cost is unknown, so the cost limit 2 cannot be enforced"},
		{"the cost limit is spent", "max_cost_usd: 2\n", func(timers *timersSpy) turnStep { return costing(silent(timers, "prov-1"), 2) },
			"the cost limit 2 is spent"},
		{"no time is left", "", func(timers *timersSpy) turnStep {
			step := silent(timers, "prov-1")
			return turnStep{act: func(ctx context.Context, sink app.EventSink) {
				step.act(ctx, sink)
				timers.advance(20 * time.Minute) // past the call's timeout
			}, hang: true, turn: step.turn}
		}, "the call's timeout has passed"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, "no_event: 5m", 1)
			h.defs.docs[definition.KindPolicy]["pol"] += c.policy
			play(h, c.stale(timers), completes(h))
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != run.Interrupted || class(record) != run.ClassTimeout ||
				message(record) != "stale: the runtime reported no event for 5m0s (stale.no_event)" {
				t.Fatalf("result = %+v", record.Result)
			}
			if len(h.runner.calls()) != 1 || len(record.Recoveries) != 0 || len(eventsOf(h, "RECOVERY_STARTED")) != 0 {
				t.Fatalf("turns %d, recoveries %+v, events %v", len(h.runner.calls()), record.Recoveries, h.recorder.kinds())
			}
			refused := eventsOf(h, "RECOVERY_NOT_STARTED")
			if len(refused) != 1 || refused[0].Source != run.SourceAgister || refused[0].Data["limit"] != run.StaleNoEvent || refused[0].Data["reason"] != c.reason {
				t.Fatalf("events = %+v, want %q", refused, c.reason)
			}
		})
	}
}

// Under a cost limit a recovery turn gets what the turns before it left of
// it, and the recovery's record keeps what the turn itself cost. Where the
// runtime reports its session's totals, which count every turn the session
// had, a recovery turn's own cost and usage are those totals less what the
// stale turn it resumed reported, and it is that the call's total and the
// next turn's budget count.
func TestARecoveryTurnGetsWhatIsLeftOfTheCostLimit(t *testing.T) {
	t.Parallel()
	t.Run("each turn reports its own cost", func(t *testing.T) {
		t.Parallel()
		h, timers := recoveryHarness(t, "no_event: 5m", 1)
		h.defs.docs[definition.KindPolicy]["pol"] += "max_cost_usd: 2\n"
		spent, cost := 0.5, 0.25
		stale, recovered := silent(timers, "prov-1"), completes(h)
		stale.turn.CostUSD, recovered.turn.CostUSD = &spent, &cost
		play(h, stale, recovered)
		record := h.call(t, contract.CallRequest{})

		turns := h.runner.calls()
		if record.Result.Status != run.Completed || len(turns) != 2 || turns[1].MaxCostUSD == nil || *turns[1].MaxCostUSD != 1.5 {
			t.Fatalf("result = %+v: %s, turns %+v", record.Result, message(record), turns)
		}
		if got := record.Recoveries[0]; got.CostUSD == nil || *got.CostUSD != 0.25 || *record.Result.Cost.USD != 0.75 {
			t.Fatalf("recovery = %+v, call cost %+v", got, record.Result.Cost)
		}
	})
	t.Run("each turn reports its session's totals", func(t *testing.T) {
		t.Parallel()
		h, timers := recoveryHarness(t, "no_event: 5m, repeated_tool_calls: 3", 2)
		h.defs.docs[definition.KindPolicy]["pol"] += "max_cost_usd: 2\n"
		totals := func(usd float64, input int64) *run.SessionTotals {
			return &run.SessionTotals{CostUSD: &usd, Usage: &run.Usage{InputTokens: &input}}
		}
		// The session's totals after each turn: the stale turn, the recovery
		// that goes stale at another limit, and the recovery that completes.
		stale, again, recovered := silent(timers, "prov-1"), repeating("prov-1", goTest, ""), completes(h)
		stale.turn.Session, again.turn.Session, recovered.turn.Session = totals(0.5, 100), totals(0.75, 150), totals(1.25, 250)
		play(h, stale, again, recovered)
		record := h.call(t, contract.CallRequest{})

		turns := h.runner.calls()
		if record.Result.Status != run.Completed || len(turns) != 3 || len(record.Recoveries) != 2 {
			t.Fatalf("result = %+v: %s, turns %+v, recoveries %+v", record.Result, message(record), turns, record.Recoveries)
		}
		// Each recovery's own: 0.75 less the stale turn's 0.5, then 1.25
		// less the first recovery's 0.75.
		for i, want := range []struct {
			usd   float64
			input int64
		}{{0.25, 50}, {0.5, 100}} {
			got := record.Recoveries[i]
			if got.CostUSD == nil || *got.CostUSD != want.usd || got.Usage == nil || got.Usage.InputTokens == nil || *got.Usage.InputTokens != want.input {
				t.Fatalf("recovery %d: cost %v, usage %+v, want %v and %d input tokens", i+1, deref(got.CostUSD), got.Usage, want.usd, want.input)
			}
		}
		// The latest turn resumed the session at what the turn before it
		// reported, and reported its own totals.
		if !reflect.DeepEqual(record.Turn.SessionBefore, totals(0.75, 150)) || !reflect.DeepEqual(record.Turn.Session, totals(1.25, 250)) {
			t.Fatalf("session before %+v, after %+v", record.Turn.SessionBefore, record.Turn.Session)
		}
		// The call's total is every turn's own, 0.5, 0.25 and 0.5: not the
		// sum of the totals reported.
		if cost, usage := record.Result.Cost, record.Result.Usage; cost.USD == nil || *cost.USD != 1.25 || cost.Source == run.CostUnknown ||
			usage == nil || usage.InputTokens == nil || *usage.InputTokens != 250 {
			t.Fatalf("call cost %+v, usage %+v", cost, usage)
		}
		// Each turn's budget is the limit less every turn's own before it.
		for i, want := range []float64{2, 1.5, 1.25} {
			if got := turns[i].MaxCostUSD; got == nil || *got != want {
				t.Fatalf("turn %d: cost limit %v, want %v", i+1, deref(got), want)
			}
		}
	})
}

// A turn that reported its own end before Agister ended it keeps that end
// and is not recovered, though a limit was reached: no turn follows it and
// no event speaks of a recovery.
func TestATurnThatReportedItsOwnEndIsNotRecovered(t *testing.T) {
	t.Parallel()
	h, timers := recoveryHarness(t, "no_event: 5m", 1)
	failed := silent(timers, "prov-1")
	failed.turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"), ProviderSessionID: "prov-1"}
	play(h, failed, completes(h))
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassRateLimited || record.Turn.Stale == nil {
		t.Fatalf("result = %+v, stale %+v", record.Result, record.Turn.Stale)
	}
	if len(h.runner.calls()) != 1 || len(record.Recoveries) != 0 || len(eventsOf(h, "RECOVERY_NOT_STARTED")) != 0 {
		t.Fatalf("turns %d, recoveries %+v, events %v", len(h.runner.calls()), record.Recoveries, h.recorder.kinds())
	}
}

// A recovery turn that reports another session, or none, is not in the
// call's session: the call fails as a contract violation, as after a
// repair turn that does, its output is not the call's, and the record
// keeps both sessions. So does one that Agister ended at a limit in another
// session: it is not classified as that limit, and no recovery follows it
// there, though a resume is left. And so does one that failed in another
// session: the call does not end with that turn's class.
func TestARecoveryTurnInAnotherSessionFailsTheCall(t *testing.T) {
	t.Parallel()
	valid := func(h *harness, reported string) turnStep {
		elsewhere := completes(h)
		elsewhere.turn.ProviderSessionID = reported
		return elsewhere
	}
	stale := func(_ *harness, reported string) turnStep { return repeating(reported, goTest, "") }
	failed := func(_ *harness, reported string) turnStep {
		return turnStep{turn: run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"), ProviderSessionID: reported}}
	}
	for _, c := range []struct {
		name     string
		reported string
		recovery func(h *harness, reported string) turnStep
	}{
		{"reported prov-2", "prov-2", valid},
		{"reported ", "", valid},
		{"stale, reported prov-2", "prov-2", stale},
		{"failed, reported prov-2", "prov-2", failed},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, "no_event: 5m, repeated_tool_calls: 3", 2)
			play(h, silent(timers, "prov-1"), c.recovery(h, c.reported), completes(h))
			record := h.call(t, contract.CallRequest{})

			want := fmt.Sprintf("the recovery turn resumed session prov-1, but the runtime reported session %q", c.reported)
			if record.Result.Status != run.Failed || class(record) != run.ClassRuntimeError || message(record) != want || record.Result.Output != nil {
				t.Fatalf("result = %+v", record.Result)
			}
			if len(h.runner.calls()) != 2 || len(record.Recoveries) != 1 {
				t.Fatalf("turns %d, recoveries %+v", len(h.runner.calls()), record.Recoveries)
			}
			got := record.Recoveries[0]
			if got.Resumed != "prov-1" || got.Session != c.reported || got.Outcome != run.RecoveryFailed || got.Error == nil || got.Error.Message != want {
				t.Fatalf("recovery = %+v", got)
			}
			// The call's session is the one its turns were in.
			if record.Result.Session == nil || record.Result.Session.ProviderSessionID != "prov-1" {
				t.Fatalf("session = %+v", record.Result.Session)
			}
			// Nothing was asked of the other session: no recovery was
			// started there, and none was considered.
			if len(eventsOf(h, "RECOVERY_STARTED")) != 1 || len(eventsOf(h, "RECOVERY_NOT_STARTED")) != 0 {
				t.Fatalf("events = %v", h.recorder.kinds())
			}
		})
	}
}

// A recovery turn Agister ended at a limit before it reported a session is
// in no other session: it is that limit's recovery on record, nothing says
// which session to resume, and the call ends as the limit ends it.
func TestAStaleRecoveryTurnThatReportedNoSessionEndsTheCallAtItsLimit(t *testing.T) {
	t.Parallel()
	h, timers := recoveryHarness(t, "no_event: 5m, repeated_tool_calls: 3", 2)
	play(h, silent(timers, "prov-1"), repeating("", goTest, ""), completes(h))
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassBudgetExhausted || !strings.Contains(message(record), "(stale.repeated_tool_calls)") {
		t.Fatalf("result = %+v", record.Result)
	}
	if len(h.runner.calls()) != 2 || !reflect.DeepEqual(outcomes(record), []string{run.RecoveryDifferentLimit}) || record.Recoveries[0].Session != "" {
		t.Fatalf("turns %d, recoveries %+v", len(h.runner.calls()), record.Recoveries)
	}
	refused := eventsOf(h, "RECOVERY_NOT_STARTED")
	if len(refused) != 1 || refused[0].Data["limit"] != run.StaleRepeatedToolCalls || refused[0].Data["reason"] != "the stale turn reported no session to resume" {
		t.Fatalf("events = %+v", refused)
	}
}

// A recovery turn that fails in any other way ends the call with that
// turn's status and class, and its record says so: in the call's session,
// or before it reported one, which names no other session.
func TestARecoveryTurnThatFailsEndsTheCallAsItEnded(t *testing.T) {
	t.Parallel()
	for _, reported := range []string{"prov-1", ""} {
		t.Run("reported "+reported, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, "no_event: 5m", 2)
			play(h, silent(timers, "prov-1"), turnStep{turn: run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"), ProviderSessionID: reported}})
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != run.Failed || class(record) != run.ClassRateLimited || len(h.runner.calls()) != 2 {
				t.Fatalf("result = %+v, turns %d", record.Result, len(h.runner.calls()))
			}
			if got := record.Recoveries; len(got) != 1 || got[0].Session != reported || got[0].Outcome != run.RecoveryFailed || got[0].Error == nil || got[0].Error.Class != run.ClassRateLimited {
				t.Fatalf("recoveries = %+v", got)
			}
		})
	}
}

// A call does not complete before its recoveries are recorded: a recovery
// that cannot be recorded fails the call, whatever its turn returned.
func TestARecoveryThatCannotBeRecordedFailsTheCall(t *testing.T) {
	t.Parallel()
	h, timers := recoveryHarness(t, "no_event: 5m", 1)
	play(h, silent(timers, "prov-1"), completes(h))
	h.recorder.updateErr = func(record run.Record) error {
		if len(record.Recoveries) > 0 && record.Result == nil {
			return errors.New("disk full")
		}
		return nil
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassInternal || message(record) != "recording recovery 1 failed: disk full" || record.Result.Output != nil {
		t.Fatalf("result = %+v", record.Result)
	}
}

// A repair turn Agister ended at a staleness limit is recovered like any
// turn, and the verification loop goes on with its next run on what the
// recovery turn left: the recovery spends no verification attempt.
func TestAStaleRepairTurnIsRecoveredAndVerificationGoesOn(t *testing.T) {
	t.Parallel()
	h, timers := staleHarness(t, "no_event: 5m, recover: {max_resumes: 1, instruction: Recover.}")
	verifying(h)
	// Two attempts: the second run is the last the process allows.
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "max_attempts: 3", "max_attempts: 2", 1)
	h.commands.exits = []int{1}
	fresh(h)
	play(h, completes(h), silent(timers, "prov-1"), completes(h))
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v: %s", record.Result, message(record))
	}
	turns := h.runner.calls()
	if len(turns) != 3 || !strings.HasPrefix(turns[1].Prompt, "The verification command failed.") ||
		!strings.HasPrefix(turns[2].Prompt, "Recover.\n\n## stale limit\n\nstale.no_event") || turns[2].ResumeSessionID != "prov-1" {
		t.Fatalf("turns = %+v", turns)
	}
	// Two runs, two attempts: the second is the recovery turn's.
	if len(h.commands.runs()) != 2 || len(record.Attempts) != 2 || record.Attempts[1].Number != 2 ||
		record.Attempts[1].Turn.Stale != nil || record.Attempts[1].Run == nil || !record.Attempts[1].Run.Passed {
		t.Fatalf("runs %d, attempts %+v", len(h.commands.runs()), record.Attempts)
	}
	if got := record.Recoveries; len(got) != 1 || got[0].Follows != 2 || got[0].Outcome != run.RecoveryCompleted || got[0].MessageSHA256 != digestOf(turns[2].Prompt) {
		t.Fatalf("recoveries = %+v", got)
	}
}

// The budget of resumes is the call's, whichever turn went stale: a call
// that spent its only resume on its first turn takes no recovery turn for a
// repair turn that reaches another limit. The call ends as that limit ends
// it, and an event says no resume is left.
func TestAStaleRepairTurnIsNotRecoveredOnceTheCallsResumeIsSpent(t *testing.T) {
	t.Parallel()
	h, timers := staleHarness(t, "no_event: 5m, repeated_tool_calls: 3, recover: {max_resumes: 1, instruction: Recover.}")
	verifying(h)
	h.commands.exits = []int{1}
	fresh(h)
	// The first turn goes silent and is recovered; the run on what the
	// recovery left fails, and the repair repeats a call. The last turn is
	// the recovery a second resume would take.
	play(h, silent(timers, "prov-1"), completes(h), repeating("prov-1", goTest, ""), completes(h))
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassBudgetExhausted || !strings.Contains(message(record), "(stale.repeated_tool_calls)") {
		t.Fatalf("result = %+v", record.Result)
	}
	turns := h.runner.calls()
	if len(turns) != 3 || !strings.HasPrefix(turns[1].Prompt, "Recover.\n\n## stale limit\n\nstale.no_event") ||
		!strings.HasPrefix(turns[2].Prompt, "The verification command failed.") {
		t.Fatalf("turns = %+v", turns)
	}
	// One recovery, the first turn's: the repair's limit started none.
	if got := record.Recoveries; len(got) != 1 || got[0].Follows != 1 || got[0].Stale.Limit != run.StaleNoEvent || got[0].Outcome != run.RecoveryCompleted {
		t.Fatalf("recoveries = %+v", got)
	}
	if started := eventsOf(h, "RECOVERY_STARTED"); len(started) != 1 || started[0].Data["limit"] != run.StaleNoEvent {
		t.Fatalf("events = %+v", started)
	}
	refused := eventsOf(h, "RECOVERY_NOT_STARTED")
	if len(refused) != 1 || refused[0].Data["limit"] != run.StaleRepeatedToolCalls || refused[0].Data["reason"] != "no resume is left of stale.recover.max_resumes 1" {
		t.Fatalf("events = %+v", refused)
	}
	// The stale repair is the turn the second attempt stopped at, with no
	// run of its own.
	if len(h.commands.runs()) != 1 || len(record.Attempts) != 2 || record.Attempts[1].Run != nil ||
		record.Attempts[1].Turn.Stale == nil || record.Attempts[1].Turn.Stale.Limit != run.StaleRepeatedToolCalls {
		t.Fatalf("runs %d, attempts %+v", len(h.commands.runs()), record.Attempts)
	}
}

// A repair turn Agister ended at a staleness limit that reports another
// session than the one it resumed is not in the call's session: the call
// fails as a contract violation, not as its limit, and no recovery turn is
// taken in the other session, though a resume is left.
func TestAStaleRepairTurnInAnotherSessionFailsTheCall(t *testing.T) {
	t.Parallel()
	h, timers := staleHarness(t, "no_event: 5m, recover: {max_resumes: 1, instruction: Recover.}")
	verifying(h)
	h.commands.exits = []int{1}
	fresh(h)
	// The first turn is valid in prov-1 and its run fails; the repair goes
	// silent and reports prov-2. The last turn is the recovery that resuming
	// prov-2 would take, silent there too.
	play(h, completes(h), silent(timers, "prov-2"), silent(timers, "prov-2"))
	record := h.call(t, contract.CallRequest{})

	want := `the stale turn resumed session prov-1, but the runtime reported session "prov-2"`
	if record.Result.Status != run.Failed || class(record) != run.ClassRuntimeError || message(record) != want || record.Result.Output != nil {
		t.Fatalf("result = %+v", record.Result)
	}
	turns := h.runner.calls()
	if len(turns) != 2 || !strings.HasPrefix(turns[1].Prompt, "The verification command failed.") || turns[1].ResumeSessionID != "prov-1" {
		t.Fatalf("turns = %+v", turns)
	}
	// Nothing was asked of the other session: no recovery was started
	// there, and none was considered.
	if len(record.Recoveries) != 0 || len(eventsOf(h, "RECOVERY_STARTED")) != 0 || len(eventsOf(h, "RECOVERY_NOT_STARTED")) != 0 {
		t.Fatalf("recoveries = %+v, events %v", record.Recoveries, h.recorder.kinds())
	}
	// The call's session is the one its first turn was in, and the stale
	// repair is the turn the second attempt stopped at, with the session it
	// reported and no run of its own.
	if record.Result.Session == nil || record.Result.Session.ProviderSessionID != "prov-1" {
		t.Fatalf("session = %+v", record.Result.Session)
	}
	if len(h.commands.runs()) != 1 || len(record.Attempts) != 2 || record.Attempts[1].Run != nil || record.Attempts[1].Session != "prov-2" ||
		record.Attempts[1].Turn.Stale == nil || record.Attempts[1].Turn.Stale.Limit != run.StaleNoEvent {
		t.Fatalf("runs %d, attempts %+v", len(h.commands.runs()), record.Attempts)
	}
}

// The evidence a call sent stays sent when its verification takes a repair
// turn: a repair that reaches the limit the first turn was recovered from
// is not recovered again, though a resume is left. The call ends as that
// limit ends it, after three turns and one recovery.
func TestEvidenceSentBeforeARepairTurnIsNotSentAgainAfterIt(t *testing.T) {
	t.Parallel()
	h, timers := staleHarness(t, "no_event: 5m, recover: {max_resumes: 2, instruction: Recover.}")
	verifying(h)
	h.commands.exits = []int{1}
	fresh(h)
	// The first turn goes silent and is recovered; the run on what the
	// recovery left fails, and the repair goes silent too. The last turn is
	// the recovery the second resume would take.
	play(h, silent(timers, "prov-1"), completes(h), silent(timers, "prov-1"), completes(h))
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Interrupted || class(record) != run.ClassTimeout ||
		message(record) != "stale: the runtime reported no event for 5m0s (stale.no_event)" {
		t.Fatalf("result = %+v", record.Result)
	}
	turns := h.runner.calls()
	if len(turns) != 3 || !strings.HasPrefix(turns[1].Prompt, "Recover.\n\n## stale limit\n\nstale.no_event") ||
		!strings.HasPrefix(turns[2].Prompt, "The verification command failed.") {
		t.Fatalf("turns = %+v", turns)
	}
	// One recovery, the first turn's: the repair's limit started none.
	if got := record.Recoveries; len(got) != 1 || got[0].Follows != 1 || got[0].Stale.Limit != run.StaleNoEvent || got[0].Outcome != run.RecoveryCompleted {
		t.Fatalf("recoveries = %+v", got)
	}
	if started := eventsOf(h, "RECOVERY_STARTED"); len(started) != 1 {
		t.Fatalf("events = %+v", started)
	}
	refused := eventsOf(h, "RECOVERY_NOT_STARTED")
	if len(refused) != 1 || refused[0].Data["limit"] != run.StaleNoEvent ||
		refused[0].Data["reason"] != "the same evidence was sent before: the limit was reached again on the same thing" {
		t.Fatalf("events = %+v", refused)
	}
	// The stale repair is the turn the second attempt stopped at, with no
	// run of its own.
	if len(h.commands.runs()) != 1 || len(record.Attempts) != 2 || record.Attempts[1].Run != nil ||
		record.Attempts[1].Turn.Stale == nil || record.Attempts[1].Turn.Stale.Limit != run.StaleNoEvent {
		t.Fatalf("runs %d, attempts %+v", len(h.commands.runs()), record.Attempts)
	}
}
