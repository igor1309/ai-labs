package main

import (
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

const dailyID = "20261020T070000Z-ffffff"
const extraDailyID = "20261020T060000Z-eeeeee"

func dailyCall(at string, cost *float64) runstore.Call {
	started, err := time.Parse(time.RFC3339, at)
	if err != nil {
		panic(err)
	}
	return runstore.Call{Result: runstore.CallResult{Outcome: runstore.Outcome{
		Status: "completed", Cost: cost, Timing: runstore.Timing{Started: started},
	}}}
}

// dailyFixture is daily.feature's settings, clock and records; the host's
// zone is given by the clock, independent of the machine's zone.
func dailyFixture(t *testing.T) *runFixture {
	t.Helper()
	f := newRecordFixture(t, modelSettings(t, map[string]string{"/u/.agister/budget.yaml": "daily: {cost: 20}"}), echoes)
	f.clock = clocktest.NewClock(time.Date(2026, 10, 20, 10, 0, 0, 0, time.FixedZone("host", 3*60*60)))
	f.random = randomSpy{0xff, 0xff, 0xff}
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Cost: usd(1)})
	reused := dailyCall("2026-10-20T05:00:00Z", usd(3))
	reuse := "earlier/call"
	reused.Reuses = &reuse
	f.store.kept = map[string]runstore.Record{
		"20261017T090000Z-aaaaaa": keptRun("20261017T090000Z-aaaaaa", dailyCall("2026-10-20T06:00:00Z", usd(50))),
		"20261019T200000Z-bbbbbb": keptRun("20261019T200000Z-bbbbbb", dailyCall("2026-10-19T20:00:00Z", usd(5)), dailyCall("2026-10-19T21:30:00Z", usd(2))),
		"20261019T220000Z-cccccc": keptRun("20261019T220000Z-cccccc", dailyCall("2026-10-19T22:00:00Z", usd(10))),
		"20261020T050000Z-dddddd": keptRun("20261020T050000Z-dddddd", dailyCall("2026-10-20T05:00:00Z", usd(7)), dailyCall("2026-10-20T05:00:00Z", nil), reused),
	}
	return f
}

func dailyRun(t *testing.T, f *runFixture, extra ...string) ran {
	t.Helper()
	return f.run(t, "/r", append([]string{"run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why"}, extra...)...)
}

// daily.feature, "A call is given what is left of the day".
// Contract test: the files home holds, as Agister ships them.
func TestACallIsGivenWhatIsLeftOfTheDay(t *testing.T) {
	t.Parallel()
	f := dailyFixture(t)
	got := dailyRun(t, f)
	turns := f.runtimes.claude.ran()
	if got.code != 0 || got.stderr != "" || len(turns) != 1 || !reflect.DeepEqual(turns[0].Budget, usd(1)) {
		t.Fatalf("ran %+v, turns %+v; want budget 1", got, turns)
	}
	want := []string{"20261019T200000Z-bbbbbb", "20261019T220000Z-cccccc", "20261020T050000Z-dddddd", dailyID}
	if !slices.Equal(f.store.readIDs, want) {
		t.Fatalf("read runs %v, want %v", f.store.readIDs, want)
	}
}

// daily.feature: a spent day refuses model and no-cost turns in core,
// and keeps the admitted call's failure, inputs and worktree.
// Contract test: the files home holds, as Agister ships them.
func TestACallIsNotMadeOnceTheDayIsSpent(t *testing.T) {
	t.Parallel()
	for _, agent := range []string{"claude-opus", "bash"} {
		t.Run(agent, func(t *testing.T) {
			t.Parallel()
			f := dailyFixture(t)
			f.store.kept[extraDailyID] = keptRun(extraDailyID, dailyCall("2026-10-20T06:00:00Z", usd(1)))
			process, param := "ask", "q=why"
			if agent == "bash" {
				process, param = "say", "what=hi"
				f.settings["/r/.agister/processes/say.yaml"] = strings.ReplaceAll(sayProcess, "%s", "")
				f.settings["/r/.agister/prompts/say.md"] = "echo hi"
			}
			got := f.run(t, "/r", "run", "--process", process, "--agent", agent, "--param", param)
			p := printedOf(t, got)
			if got.code != 1 || got.stderr != "" || p.Status != "failed" || p.Class == nil || *p.Class != "budget_exhausted" || p.Reason == nil || *p.Reason != "the daily budget 20 is spent: 20" || len(f.runtimes.claude.ran()) != 0 || len(f.runtimes.bash.ran()) != 0 {
				t.Fatalf("ran %+v, printed %+v; want budget_exhausted and no turn", got, p)
			}
			calls := f.store.last(t).Calls
			key, value, _ := strings.Cut(param, "=")
			if len(calls) != 1 {
				t.Fatalf("calls %+v, want one", calls)
			}
			c := calls[0]
			if c.Result.Status != "failed" || c.Result.Class == nil || *c.Result.Class != "budget_exhausted" || c.Result.Reason == nil || *c.Result.Reason != *p.Reason || c.Head != "c1" || c.Content != "t1" || len(c.Inputs) != 1 || c.Inputs[0].Name != key || c.Inputs[0].Value != value {
				t.Fatalf("recorded %+v; want admitted failure with %s", c, param)
			}
		})
	}
}

// daily.feature: a later step reads the ended earlier call from this
// run's record before it starts.
// Contract test: the files home holds, as Agister ships them.
func TestAWorkflowsLaterStepStopsOnceItsEarlierOneSpentTheDay(t *testing.T) {
	t.Parallel()
	f := dailyFixture(t)
	f.settings["/r/.agister/workflows/two.yaml"] = `schema: agister.workflow/v1alpha1
params: {q: {}}
steps:
  - {name: a, process: ask, agent: claude-opus, inputs: {q: {from: params.q}}}
  - {name: b, process: ask, agent: claude-opus, inputs: {q: {from: params.q}}}
`
	got := f.run(t, "/r", "run", "two", "--param", "q=why")
	p := printedOf(t, got)
	calls := f.store.last(t).Calls
	if got.code != 1 || got.stderr != "" || p.Class == nil || *p.Class != "budget_exhausted" || len(f.runtimes.claude.ran()) != 1 || len(calls) != 2 {
		t.Fatalf("ran %+v, printed %+v, calls %+v; want one turn and failed b", got, p, calls)
	}
	if calls[0].Step != "a" || calls[0].Result.Status != "completed" || calls[1].Step != "b" || calls[1].Result.Status != "failed" || calls[1].Result.Reason == nil || *calls[1].Result.Reason != "the daily budget 20 is spent: 20" {
		t.Fatalf("calls %+v; want a completed, b exhausted", calls)
	}
}

// daily.feature: reuse still succeeds on a spent day and reads no daily
// spend, because it makes no call.
// Contract test: the files home holds, as Agister ships them.
func TestACallTakenByAReuseIsTakenOnASpentDay(t *testing.T) {
	t.Parallel()
	f := dailyFixture(t)
	c := keptCall(extraDailyID+"/ask", "t1", "s1")
	c.Result.Outcome = dailyCall("2026-10-20T06:00:00Z", usd(1)).Result.Outcome
	c.Definitions = askDefinitions(f.settings, "claude-opus")
	c.Environment = []runstore.Variable{{Name: "A", Value: "1"}}
	c.Inputs = []runstore.Input{{Name: "q", Value: "why", Identity: identity("why")}}
	record := keptRun(extraDailyID, c)
	record.Request = runstore.Request{Process: "ask", Agent: "claude-opus"}
	f.store.kept[extraDailyID] = record
	got := dailyRun(t, f, "--reuse", extraDailyID)
	calls := f.store.last(t).Calls
	if got.code != 0 || got.stderr != "" || len(f.runtimes.claude.ran()) != 0 || len(calls) != 1 || calls[0].Reuses == nil || *calls[0].Reuses != c.ID || f.store.listed != 0 {
		t.Fatalf("ran %+v, calls %+v, listed %d; want successful reuse with no turn or spend read", got, calls, f.store.listed)
	}
}

// daily.feature: an unreadable run spends nothing and warns on the call;
// a list failure likewise spends nothing.
// Contract test: the files home holds, as Agister ships them.
func TestUnreadableRunsSpendNothingOfTheDay(t *testing.T) {
	t.Parallel()
	for _, list := range []bool{false, true} {
		name, want := "record", 11.0
		if list {
			name, want = "list", 20
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := dailyFixture(t)
			bad := errors.New("cannot read " + name)
			if list {
				f.store.failRuns = bad
			} else {
				f.store.failRecord = map[string]error{"20261019T220000Z-cccccc": bad}
			}
			got := dailyRun(t, f)
			turns := f.runtimes.claude.ran()
			warning := "the runs could not be read: " + bad.Error() + "; they spend nothing of the day"
			calls := f.store.last(t).Calls
			if got.code != 0 || got.stderr != "" || len(turns) != 1 || !reflect.DeepEqual(turns[0].Budget, usd(want)) || len(calls) != 1 || !slices.Contains(calls[0].Result.Warnings, warning) || !slices.Contains(printedOf(t, got).Warnings, warning) {
				t.Fatalf("ran %+v, turns %+v, calls %+v; want budget %g, warning %q", got, turns, calls, want, warning)
			}
		})
	}
}

// daily.feature: no budget means no run listing or reading.
// Contract test: the files home holds, as Agister ships them.
func TestNoBudgetFileReadsNoRuns(t *testing.T) {
	t.Parallel()
	f := dailyFixture(t)
	delete(f.settings, "/u/.agister/budget.yaml")
	got := dailyRun(t, f)
	turns := f.runtimes.claude.ran()
	if got.code != 0 || got.stderr != "" || len(turns) != 1 || turns[0].Budget != nil || f.store.listed != 0 || len(f.store.readIDs) != 0 {
		t.Fatalf("ran %+v, turns %+v, reads %v, listed %d; want no budget or reads", got, turns, f.store.readIDs, f.store.listed)
	}
}

// daily.feature: check and run report the same problem before any run.
// Contract test: the files home holds, as Agister ships them.
func TestABudgetProblemRefusesTheRunAndCheckReportsIt(t *testing.T) {
	t.Parallel()
	f := dailyFixture(t)
	f.settings["/u/.agister/budget.yaml"] = "daily: {cost: 0}"
	for _, got := range []ran{f.run(t, "/r", "check"), dailyRun(t, f)} {
		if got.code != 1 || (!strings.Contains(got.stdout+got.stderr, "/u/.agister/budget.yaml:1") || !strings.Contains(got.stdout+got.stderr, "daily.cost: it is more than zero")) {
			t.Fatalf("ran %+v; want budget problem", got)
		}
	}
	if _, records, _ := f.store.given(); len(records) != 0 || len(f.runtimes.claude.ran()) != 0 {
		t.Fatalf("records %+v; want no run", records)
	}
}

// A missing budget reader fails construction, so a step cannot silently
// omit the owner's ceiling.
func TestStepCallsRequireADailyBudgetReader(t *testing.T) {
	t.Parallel()
	resolver, err := inputs.New(map[string]inputs.Source{}, briefPaths{paths: &sourcesSpy{}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = newStepCalls(resolver, &admissionSpy{}, map[string]turnCaller{}, clocktest.NewClock(runStart), nil, &callsSpy{}, nil)
	if err == nil || err.Error() != "step calls: no daily budget reader" {
		t.Fatalf("error %v, want no daily budget reader", err)
	}
}

// The record selection uses the local calendar's previous midnight, and
// call accounting includes today's midnight but excludes tomorrow's.
func TestDailySpendUsesLocalDayBoundaries(t *testing.T) {
	t.Parallel()
	for _, offset := range []int{3 * 60 * 60, -7 * 60 * 60} {
		zone := time.FixedZone("host", offset)
		t.Run(zone.String()+time.Unix(int64(offset), 0).UTC().Format("150405"), func(t *testing.T) {
			t.Parallel()
			now := time.Date(2026, 10, 20, 10, 0, 0, 0, zone)
			midnight := time.Date(2026, 10, 20, 0, 0, 0, 0, zone)
			oldest, tomorrow := midnight.AddDate(0, 0, -1), midnight.AddDate(0, 0, 1)
			id := func(at time.Time) string { return at.UTC().Format("20060102T150405Z") + "-aaaaaa" }
			callAt := func(at time.Time, cost float64) runstore.Call {
				return dailyCall(at.Format(time.RFC3339), usd(cost))
			}
			store := &storeSpy{kept: map[string]runstore.Record{
				id(oldest.Add(-time.Second)): keptRun(id(oldest.Add(-time.Second)), callAt(now, 100)),
				id(oldest):                   keptRun(id(oldest), callAt(midnight.Add(-time.Second), 50), callAt(midnight, 2), callAt(tomorrow.Add(-time.Second), 3), callAt(tomorrow, 75)),
			}}
			got, warnings := dailyBudget(store, now, usd(20))
			if got.Cost != 20 || got.Spent != 5 || len(warnings) != 0 || !slices.Equal(store.readIDs, []string{id(oldest)}) {
				t.Fatalf("budget %+v, warnings %v, read %v; want spent 5 and only %s", got, warnings, store.readIDs, id(oldest))
			}
		})
	}
}
