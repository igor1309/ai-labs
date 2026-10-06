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
// it, and the recovery's record keeps what the turn itself cost.
func TestARecoveryTurnGetsWhatIsLeftOfTheCostLimit(t *testing.T) {
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
// keeps both sessions.
func TestARecoveryTurnInAnotherSessionFailsTheCall(t *testing.T) {
	t.Parallel()
	for _, reported := range []string{"prov-2", ""} {
		t.Run("reported "+reported, func(t *testing.T) {
			t.Parallel()
			h, timers := recoveryHarness(t, "no_event: 5m", 2)
			elsewhere := completes(h)
			elsewhere.turn.ProviderSessionID = reported
			play(h, silent(timers, "prov-1"), elsewhere)
			record := h.call(t, contract.CallRequest{})

			want := fmt.Sprintf("the recovery turn resumed session prov-1, but the runtime reported session %q", reported)
			if record.Result.Status != run.Failed || class(record) != run.ClassRuntimeError || message(record) != want || record.Result.Output != nil {
				t.Fatalf("result = %+v", record.Result)
			}
			if len(h.runner.calls()) != 2 || len(record.Recoveries) != 1 {
				t.Fatalf("turns %d, recoveries %+v", len(h.runner.calls()), record.Recoveries)
			}
			got := record.Recoveries[0]
			if got.Resumed != "prov-1" || got.Session != reported || got.Outcome != run.RecoveryFailed || got.Error == nil || got.Error.Message != want {
				t.Fatalf("recovery = %+v", got)
			}
			// The call's session is the one its turns were in.
			if record.Result.Session == nil || record.Result.Session.ProviderSessionID != "prov-1" {
				t.Fatalf("session = %+v", record.Result.Session)
			}
		})
	}
}

// A recovery turn that fails in any other way ends the call with that
// turn's status and class, and its record says so.
func TestARecoveryTurnThatFailsEndsTheCallAsItEnded(t *testing.T) {
	t.Parallel()
	h, timers := recoveryHarness(t, "no_event: 5m", 2)
	play(h, silent(timers, "prov-1"), turnStep{turn: run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"), ProviderSessionID: "prov-1"}})
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassRateLimited || len(h.runner.calls()) != 2 {
		t.Fatalf("result = %+v, turns %d", record.Result, len(h.runner.calls()))
	}
	if got := record.Recoveries; len(got) != 1 || got[0].Outcome != run.RecoveryFailed || got[0].Error == nil || got[0].Error.Class != run.ClassRateLimited {
		t.Fatalf("recoveries = %+v", got)
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
