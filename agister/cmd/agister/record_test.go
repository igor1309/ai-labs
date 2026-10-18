package main

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// recordStart is the time record.feature's clock reads, and recordID the
// id of a run started then, randomness giving 55fd36.
var recordStart = time.Date(2026, 10, 17, 7, 16, 18, 0, time.UTC)

const recordID = "20261017T071618Z-55fd36"

// newRecordFixture is the run fixture of record.feature: the run fixture
// over settings, bash answering by answer, its clock reading recordStart,
// and git giving "/r" the content "t1".
func newRecordFixture(t *testing.T, settings map[string]string, answer func(context.Context, bash.Turn) (bash.Ended, error)) *runFixture {
	t.Helper()
	f := newRunFixture(t, settings, answer)
	f.clock = clocktest.NewClock(recordStart)
	f.holding.content = "t1"
	return f
}

// asJSON is v as JSON gives it back, decoded.
func asJSON(t *testing.T, v any) map[string]any {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

// record.feature, "A run's id is printed, and its record kept under
// home's runs".
//
// Contract test: the files home holds, as Agister ships them.
func TestARunsIDIsPrintedAndItsRecordKeptUnderHomesRuns(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, runSettings(t, nil), echoes)
	got := f.run(t, "/r", "run", "pair")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	var printed map[string]any
	if err := json.Unmarshal([]byte(got.stdout), &printed); err != nil {
		t.Fatal(err)
	}
	if printed["run_id"] != recordID {
		t.Errorf("printed the run_id %v, want %s", printed["run_id"], recordID)
	}
	if folders, _, _ := f.store.given(); !slices.Equal(folders, []string{"/u/.agister/runs"}) {
		t.Errorf("runstore over %q, want home's runs", folders)
	}
	last := f.store.last(t)
	request := last.Request
	if last.Schema != "agister.record/v1alpha1" || last.ID != recordID || request.Workflow != "pair" || request.Process != "" ||
		request.Agent != "" || len(request.Params) > 0 || request.Dir != "/r" {
		t.Errorf("the record's schema %q, id %q, request %+v; want agister.record/v1alpha1, %s, the workflow pair in /r",
			last.Schema, last.ID, request, recordID)
	}
	if last.Status != "completed" || !last.Started.Equal(recordStart) || last.Ended == nil || !last.Ended.Equal(recordStart) {
		t.Errorf("the record %s, started %v, ended %v; want completed, started and ended at %v", last.Status, last.Started, last.Ended, recordStart)
	}
	if recorded := asJSON(t, last.Result); !reflect.DeepEqual(recorded, printed) {
		t.Errorf("the record's result\n%v\nwant as printed\n%v", recorded, printed)
	}
}

// record.feature, "Each call is recorded, with its worktree and result".
//
// Contract test: the files home holds, as Agister ships them.
func TestEachCallIsRecordedWithItsWorktreeAndResult(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"})
	f.validator = &validatorSpy{}
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	calls := f.store.last(t).Calls
	if len(calls) != 1 {
		t.Fatalf("the record holds the calls %+v, want one", calls)
	}
	result := calls[0].Result
	// Its inputs are runs.feature's, proved there.
	calls[0].Result, calls[0].Inputs = runstore.CallResult{}, nil
	want := runstore.Call{ID: recordID + "/ask", Step: "ask", Process: "ask", Agent: "claude-opus", Root: "/r", Head: "c1", Content: "t1"}
	if !reflect.DeepEqual(calls[0], want) {
		t.Errorf("the record's call %+v, want %+v", calls[0], want)
	}
	if result.Status != "completed" || result.Class != nil || result.Reason != nil || result.Session == nil || *result.Session != "s1" ||
		!reflect.DeepEqual(result.Output, map[string]any{"ok": true}) {
		t.Errorf("the call's result %+v, want completed, its output the reply's, its session s1", result)
	}
}

// record.feature, "A record is lost until the run ends, its ended calls
// kept": the last record runstore is given before b's turn is taken.
//
// Contract test: the files home holds, as Agister ships them.
func TestARecordIsLostUntilTheRunEndsItsEndedCallsKept(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, runSettings(t, nil), nil)
	var during []runstore.Record
	f.runtimes.bash.answer = func(ctx context.Context, turn bash.Turn) (bash.Ended, error) {
		if slices.Contains(turn.Env, "what=hi\n") {
			_, during, _ = f.store.given()
		}
		return echoes(ctx, turn)
	}
	if got := f.run(t, "/r", "run", "pair"); got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if len(during) == 0 {
		t.Fatal("runstore was given no record while b ran, want one")
	}
	last := during[len(during)-1]
	if last.Status != "lost" || last.Result != nil || last.Ended != nil {
		t.Errorf("the record while b ran: %s, ended %v, result %+v; want lost, none", last.Status, last.Ended, last.Result)
	}
	if len(last.Calls) != 1 || last.Calls[0].Step != "a" || last.Calls[0].Result.Status != "completed" {
		t.Errorf("the record while b ran holds %+v, want a's call, completed", last.Calls)
	}
}

// record.feature, "Each event reaches runstore, in order".
//
// Contract test: the files home holds, as Agister ships them.
func TestEachEventReachesRunstoreInOrder(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, runSettings(t, nil), echoes)
	if got := f.run(t, "/r", "run", "pair"); got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	var want []storedEvent
	for _, step := range []string{"a", "b"} {
		want = append(want,
			storedEvent{id: recordID, event: runstore.Event{At: recordStart, Step: step, Kind: runstore.Started, Agent: "bash"}},
			storedEvent{id: recordID, event: runstore.Event{At: recordStart, Step: step, Kind: runstore.Ended, Status: "completed"}})
	}
	if _, _, events := f.store.given(); !reflect.DeepEqual(events, want) {
		t.Errorf("runstore was given the events\n%+v\nwant\n%+v", events, want)
	}
}

// A stale turn is appended as runstore's stale event, at the clock's time:
// what went stale, and whether a recovery turn follows.
func TestAStaleTurnIsAppendedAsAStaleEvent(t *testing.T) {
	t.Parallel()
	store := &storeSpy{}
	record, err := newRunRecord(store, clocktest.NewClock(recordStart), recordID, recordStart, cli.Request{Process: "ask"}, "/r", "/r")
	if err != nil {
		t.Fatal(err)
	}
	record.Stale("ask", workflow.Stale{What: "no event for 1m", Recovering: true})
	record.Stale("ask", workflow.Stale{What: "no event for 1m"})
	want := []storedEvent{
		{id: recordID, event: runstore.Event{At: recordStart, Step: "ask", Kind: runstore.Stale, What: "no event for 1m", Recovering: true}},
		{id: recordID, event: runstore.Event{At: recordStart, Step: "ask", Kind: runstore.Stale, What: "no event for 1m"}},
	}
	if _, _, events := store.given(); !reflect.DeepEqual(events, want) {
		t.Errorf("runstore was given the events\n%+v\nwant\n%+v", events, want)
	}
}

// record.feature, "A refusal by admission is recorded".
//
// Contract test: the files home holds, as Agister ships them.
func TestARefusalByAdmissionIsRecorded(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, shippedHome(t), nil)
	f.holding.clean = false
	f.sources.commits = map[string]string{"HEAD": "c1"}
	f.sources.files = map[string]string{"/r/s.md": stepBrief}
	f.sources.exist = []string{"/r/g.md"}
	got := f.run(t, "/r", "run", "--process", "implement", "--agent", "claude-opus", "--param", "brief=s.md")
	if got.stderr != "" || got.code != 1 {
		t.Fatalf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
	last := f.store.last(t)
	refused := func(outcome runstore.Outcome) bool {
		return outcome.Status == "failed" && outcome.Class != nil && *outcome.Class == "refused" &&
			outcome.Reason != nil && *outcome.Reason == "the worktree is not clean"
	}
	if last.Status != "failed" || last.Result == nil || !refused(last.Result.Outcome) {
		t.Errorf("the record %s, its result %+v; want failed, refused as the worktree is not clean", last.Status, last.Result)
	}
	if len(last.Calls) != 1 || !refused(last.Calls[0].Result.Outcome) || last.Calls[0].Head != "" || last.Calls[0].Content != "" {
		t.Errorf("the record holds the calls %+v, want implement's, refused, its HEAD and content empty", last.Calls)
	}
}

// record.feature, "Calls side by side that end together are both kept":
// the architecture and tests reviews end once both have started. A call
// in a record is in every record after it.
//
// Contract test: the files home holds, as Agister ships them.
func TestCallsSideBySideThatEndTogetherAreBothKept(t *testing.T) {
	t.Parallel()
	f := newReviewFixture(t)
	f.clock = clocktest.NewClock(recordStart)
	var together sync.WaitGroup
	together.Add(2)
	f.runtimes.codex.answer = func(_ context.Context, turn codex.Turn) (codex.Result, error) {
		if process := processOf(t, f.settings, turn); process == "architecture_review" || process == "tests_review" {
			together.Done()
			together.Wait()
		}
		return completesReview(t, f.settings, turn)
	}
	if got := f.run(t, "/r", "run", "code_review", "--param", "goal=g.md"); got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	_, records, _ := f.store.given()
	kept := map[string]bool{}
	for i, record := range records {
		held := map[string]bool{}
		for _, call := range record.Calls {
			held[call.Step] = true
		}
		for step := range kept {
			if !held[step] {
				t.Errorf("record %d holds %v, without %s, which a record before it held", i, record.Calls, step)
			}
		}
		kept = held
	}
	var steps []string
	for _, call := range records[len(records)-1].Calls {
		steps = append(steps, call.Step)
	}
	slices.Sort(steps)
	if want := []string{"adversarial", "architecture", "clarity", "intent", "judge", "tests"}; !slices.Equal(steps, want) {
		t.Errorf("the last record holds the calls of %q, want each of %q once", steps, want)
	}
}

// record.feature, "What is refused before anything runs is not recorded".
//
// Contract test: the files home holds, as Agister ships them.
func TestWhatIsRefusedBeforeAnythingRunsIsNotRecorded(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ request, dir string }{
		{"--process nope --agent bash", "/r"},
		{"--process say --agent pi-m3", "/r"},
		{"pair", "/out"},
	} {
		t.Run(c.request+" in "+c.dir, func(t *testing.T) {
			t.Parallel()
			f := newRecordFixture(t, runSettings(t, nil), echoes)
			got := f.run(t, c.dir, append([]string{"run"}, strings.Fields(c.request)...)...)
			if got.code != 1 || !strings.HasPrefix(got.stderr, "agister: the run is refused, and nothing runs:") {
				t.Errorf("stderr %q, exit %d; want the refusal, 1", got.stderr, got.code)
			}
			if _, records, events := f.store.given(); len(records) > 0 || len(events) > 0 {
				t.Errorf("runstore was given the records %+v and the events %+v, want nothing", records, events)
			}
		})
	}
}

// record.feature, "A record that cannot be written"; and, as the section
// "Records" of docs/run-implementation.md has it, an event that cannot be
// appended is a warning in the result, as a later write is. A failure
// before the last write is a warning in the record's result too; the last
// write's, in the printed result alone. pair writes its record four
// times: before a, after a, after b and at the end.
//
// Contract test: the files home holds, as Agister ships them.
func TestARecordThatCannotBeWritten(t *testing.T) {
	t.Parallel()
	t.Run("the first write", func(t *testing.T) {
		t.Parallel()
		f := newRecordFixture(t, runSettings(t, nil), echoes)
		f.store.failWrite = 1
		got := f.run(t, "/r", "run", "pair")
		want := ran{stderr: "agister: the run is refused, and nothing runs:\n  its record cannot be written: disk full\n", code: 1}
		if got != want {
			t.Errorf("ran %+v, want %+v", got, want)
		}
		if ran := f.runtimes.bash.ran(); len(ran) > 0 {
			t.Errorf("ran %+v, want nothing", ran)
		}
	})
	for _, c := range []struct {
		name     string
		fail     func(*storeSpy)
		warning  string
		recorded int
	}{
		{"the second write", func(s *storeSpy) { s.failWrite = 2 }, "the run's record could not be written: disk full", 1},
		{"the last write", func(s *storeSpy) { s.failWrite = 4 }, "the run's record could not be written: disk full", 0},
		{"every append", func(s *storeSpy) { s.failAppend = true }, "an event of the run could not be recorded: disk full", 1},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRecordFixture(t, runSettings(t, nil), echoes)
			c.fail(f.store)
			got := f.run(t, "/r", "run", "pair")
			if got.stderr != "" || got.code != 0 || len(f.runtimes.bash.ran()) != 2 {
				t.Fatalf("stderr %q, exit %d, ran %d turns; want none, 0, both", got.stderr, got.code, len(f.runtimes.bash.ran()))
			}
			count := func(warnings []string) int {
				return len(slices.DeleteFunc(slices.Clone(warnings), func(w string) bool { return w != c.warning }))
			}
			if p := printedOf(t, got); count(p.Warnings) != 1 {
				t.Errorf("printed the warnings %q, want %q once", p.Warnings, c.warning)
			}
			if _, records, _ := f.store.given(); len(records) != 4 {
				t.Fatalf("runstore was given %d records, want 4", len(records))
			}
			if last := f.store.last(t); last.Result == nil || count(last.Result.Warnings) != c.recorded {
				t.Errorf("the record's result %+v, want the warning %q %d times", last.Result, c.warning, c.recorded)
			}
		})
	}
}
