package run_test

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestConclude(t *testing.T) {
	t.Parallel()
	jsonOutput := definition.Output{Format: "json"}
	text := definition.Output{Format: "text"}
	completed := run.Turn{Status: run.Completed, Output: []byte(`{"verdict":"request_changes"}`)}
	cases := []struct {
		name       string
		turn       run.Turn
		output     definition.Output
		validation error
		status     run.Status
		class      run.Class
	}{
		// A domain result is output of a completed node, whatever it says.
		{"verdict is output", completed, jsonOutput, nil, run.Completed, ""},
		{"invalid output", completed, jsonOutput, errors.New("bad"), run.Failed, run.ClassInvalidOutput},
		{"text needs no validation", run.Turn{Status: run.Completed, Text: "hi"}, text, nil, run.Completed, ""},
		{"runtime failure kept", run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "")}, jsonOutput, nil, run.Failed, run.ClassRateLimited},
		{"interruption kept", run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "")}, text, nil, run.Interrupted, run.ClassTimeout},
		{"a failure without a reason still has a class", run.Turn{Status: run.Lost}, text, nil, run.Lost, run.ClassRuntimeError},
	}
	for _, c := range cases {
		status, fault := run.Conclude(c.turn, c.output, c.validation)
		class := run.Class("")
		if fault != nil {
			class = fault.Class
		}
		if status != c.status || class != c.class {
			t.Errorf("%s: %s/%s, want %s/%s", c.name, status, class, c.status, c.class)
		}
	}
}

func TestEveryClassBelongsToOneStatus(t *testing.T) {
	t.Parallel()
	want := map[run.Class]run.Status{
		run.ClassRefused: run.Failed, run.ClassInvalidOutput: run.Failed, run.ClassBudgetExhausted: run.Failed,
		run.ClassRateLimited: run.Failed, run.ClassAuth: run.Failed, run.ClassContextOverflow: run.Failed,
		run.ClassRuntimeError: run.Failed, run.ClassRuntimeUnavailable: run.Failed, run.ClassInternal: run.Failed, run.ClassSetupFailed: run.Failed, run.ClassCommitted: run.Failed,
		run.ClassTimeout: run.Interrupted, run.ClassCancelled: run.Interrupted,
		run.ClassNoResult: run.Lost, run.ClassKilled: run.Lost, run.ClassAbandoned: run.Lost,
	}
	for class, status := range want {
		if got := run.StatusOf(class); got != status {
			t.Errorf("%s: %s, want %s", class, got, status)
		}
	}
}

// The record is evidence under a versioned schema: what it writes for the
// definitions, the effective limits and the plan is fixed here, whatever
// the packages that decide them do with their own types.
func TestRecordJSONForDefinitionsPolicyAndPlanIsFixed(t *testing.T) {
	t.Parallel()
	cost := 0.5
	record := run.Record{
		Schema: run.RecordSchema,
		ID:     "r",
		Definitions: []run.DefinitionSource{
			{Kind: "processes", Name: "p", Path: "/home/.agister/processes/p.yaml", SHA256: "abc"},
			{Kind: "agents", Name: "a", Path: "/repo/.agister/agents/a.toml", SHA256: "def", Project: true, Overrides: "/home/.agister/agents/a.toml"},
		},
		Effective: &run.EffectivePolicy{
			Timeout:     20 * time.Minute,
			MaxAttempts: 1,
			MaxCostUSD:  &cost,
			Allow:       []string{"repository.read"},
			Deny:        []string{},
			Permissions: []string{"repository.read"},
			Require:     []string{"repository.read"},
			Access:      "read-only",
			Scope:       "candidate",
		},
		Plan: &run.Plan{Primitives: []string{"Read"}, Granted: []string{"repository.read"}, Withheld: []string{"repository.diff"}},
	}
	data, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"definitions": `[{"kind":"processes","name":"p","path":"/home/.agister/processes/p.yaml","sha256":"abc"},` +
			`{"kind":"agents","name":"a","path":"/repo/.agister/agents/a.toml","sha256":"def","project":true,"overrides":"/home/.agister/agents/a.toml"}]`,
		"effective": `{"timeout":1200000000000,"max_attempts":1,"max_cost_usd":0.5,"allow":["repository.read"],"deny":[],` +
			`"permissions":["repository.read"],"require":["repository.read"],"access":"read-only","scope":"candidate"}`,
		"plan": `{"primitives":["Read"],"granted":["repository.read"],"withheld":["repository.diff"]}`,
	}
	for field, text := range want {
		if string(got[field]) != text {
			t.Errorf("%s\n got %s\nwant %s", field, got[field], text)
		}
	}
	// A record written so reads back as it was.
	var back run.Record
	if err := json.Unmarshal(data, &back); err != nil || !reflect.DeepEqual(back, record) {
		t.Errorf("read back %+v, %v", back, err)
	}
}

// A record written while policies could declare constraints still reads:
// the constraints it recorded are ignored, and everything else is kept.
func TestRecordWithConstraintsStillReads(t *testing.T) {
	t.Parallel()
	data := `{"id":"run-0","effective":{"timeout":1200000000000,"max_attempts":1,"allow":["repository.read"],"deny":[],` +
		`"permissions":["repository.read"],"access":"read-only","scope":"candidate",` +
		`"constraints":[{"subject":"agent.model_family","candidate_input":"candidate","on_unknown":"fail"}]}}`
	var record run.Record
	if err := json.Unmarshal([]byte(data), &record); err != nil {
		t.Fatal(err)
	}
	want := run.EffectivePolicy{Timeout: 20 * time.Minute, MaxAttempts: 1, Allow: []string{"repository.read"}, Deny: []string{},
		Permissions: []string{"repository.read"}, Access: "read-only", Scope: "candidate"}
	if record.ID != "run-0" || record.Effective == nil || !reflect.DeepEqual(*record.Effective, want) {
		t.Fatalf("record = %+v, effective %+v", record, record.Effective)
	}
}

// An in-place call's worktree is on its record apart from its effects
// (ADR-022 rule 2), in fixed JSON; a record written before has none, and
// still reads.
func TestRecordJSONForAnInPlaceWorktreeIsFixed(t *testing.T) {
	t.Parallel()
	ended := true
	record := run.Record{ID: "r", ProcessesEnded: &ended,
		InPlace: &run.InPlace{Dir: "/repo/sub", Worktree: "/repo", RepositoryIdentity: "/repo/.git", Revision: "abc", Verify: run.VerifyOnCopy, Content: "tree"}}
	data, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	want := `{"dir":"/repo/sub","worktree":"/repo","repository_identity":"/repo/.git","revision":"abc","verify":"copy","content":"tree"}`
	if string(got["in_place"]) != want || string(got["processes_ended"]) != "true" || got["effects"] != nil {
		t.Fatalf("record %s", data)
	}
	var back run.Record
	if err := json.Unmarshal(data, &back); err != nil || !reflect.DeepEqual(back, record) {
		t.Fatalf("read back %+v, %v", back, err)
	}

	var old run.Record
	if err := json.Unmarshal([]byte(`{"id":"run-0","effects":{"checkout":{"repository":"/repo","dir":"/tmp/w"}}}`), &old); err != nil {
		t.Fatal(err)
	}
	if old.InPlace != nil || old.ProcessesEnded != nil || old.Effects == nil || old.Effects.Checkout == nil {
		t.Fatalf("old record %+v", old)
	}
}

// A record says whether its processes are known to have ended, and "not
// known" is written, apart from a record that says neither: one written
// before records said so. That one's processes are known to have ended only
// when its call finished it, not when it is unfinished or a reap finished
// it (ADR-022 rule 3).
func TestARecordThatDoesNotSayHasItsProcessesEndedByHowItEnded(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	yes, no := true, false
	completed, failed, reaped := run.Result{Status: run.Completed}, run.Result{Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "fell over")}, run.AbandonedResult(at)
	for name, c := range map[string]struct {
		said     *bool
		finished bool
		result   *run.Result
		json     string // the field as written; none when empty
		known    bool
	}{
		"says ended":                            {said: &yes, finished: true, result: &completed, json: "true", known: true},
		"says not ended":                        {said: &no, finished: true, result: &failed, json: "false"},
		"says ended, finished by a reap":        {said: &yes, finished: true, result: &reaped, json: "true", known: true},
		"says nothing, completed":               {finished: true, result: &completed, known: true},
		"says nothing, failed":                  {finished: true, result: &failed, known: true},
		"says nothing, finished by a reap":      {finished: true, result: &reaped},
		"says nothing, unfinished":              {},
		"says not ended, unfinished, as a reap": {said: &no, json: "false"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			record := run.Record{ID: "r", ProcessesEnded: c.said, Result: c.result}
			if c.finished {
				record.FinishedAt = &at
			}
			data, err := json.Marshal(record)
			if err != nil {
				t.Fatal(err)
			}
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(data, &fields); err != nil || string(fields["processes_ended"]) != c.json {
				t.Fatalf("record %s, %v, want processes_ended %q", data, err, c.json)
			}
			var back run.Record
			if err := json.Unmarshal(data, &back); err != nil || !reflect.DeepEqual(back.ProcessesEnded, c.said) {
				t.Fatalf("read back %v, %v, want %v", back.ProcessesEnded, err, c.said)
			}
			if back.ProcessesKnownEnded() != c.known {
				t.Fatalf("processes known to have ended = %v, want %v", back.ProcessesKnownEnded(), c.known)
			}
		})
	}
}

// Usage, cost and runtime sum every turn of a call; what some turn did not
// report is unknown for the call, never a partial sum.
func TestSumAddsUpEveryTurn(t *testing.T) {
	t.Parallel()
	n := func(v int64) *int64 { return &v }
	usd := func(v float64) *float64 { return &v }
	one := run.Turn{CostUSD: usd(0.25), RuntimeMS: n(100), Usage: &run.Usage{InputTokens: n(10), OutputTokens: n(5), CacheReadTokens: n(1)}}
	two := run.Turn{CostUSD: usd(0.5), RuntimeMS: n(200), Usage: &run.Usage{InputTokens: n(20), OutputTokens: n(7)}}
	totals := run.Sum([]run.Turn{one, two})
	if totals.Cost.Source != run.CostRuntime || *totals.Cost.USD != 0.75 || *totals.RuntimeMS != 300 ||
		*totals.Usage.InputTokens != 30 || *totals.Usage.OutputTokens != 12 || totals.Usage.CacheReadTokens != nil {
		t.Fatalf("totals = %+v, usage %+v", totals, totals.Usage)
	}
	unknown := run.Sum([]run.Turn{one, {Usage: two.Usage}})
	if unknown.Cost.Source != run.CostUnknown || unknown.Cost.USD != nil || unknown.RuntimeMS != nil || *unknown.Usage.InputTokens != 30 {
		t.Fatalf("totals = %+v", unknown)
	}
	if single := run.Sum([]run.Turn{{}}); single.Cost.Source != run.CostUnknown || single.Usage != nil || single.RuntimeMS != nil {
		t.Fatalf("totals = %+v", single)
	}
}

// A turn's own cost and usage are the session totals it reported less the
// session's before it: all of them for a fresh session, unknown for a
// resumed one whose earlier totals are unknown. Figures reported only as
// the turn's own are kept.
func TestOwnIsWhatTheTurnAddedToItsSession(t *testing.T) {
	t.Parallel()
	n := func(v int64) *int64 { return &v }
	usd := func(v float64) *float64 { return &v }
	reported := func(before *run.SessionTotals) run.Turn {
		return run.Turn{Usage: &run.Usage{InputTokens: n(7)}, Session: &run.SessionTotals{CostUSD: usd(13.625)}, SessionBefore: before}
	}

	if fresh := run.Own(reported(nil), false); *fresh.CostUSD != 13.625 || *fresh.Usage.InputTokens != 7 || *fresh.Session.CostUSD != 13.625 {
		t.Fatalf("fresh = %+v", fresh)
	}
	if resumed := run.Own(reported(&run.SessionTotals{CostUSD: usd(12.5)}), true); *resumed.CostUSD != 1.125 || *resumed.Usage.InputTokens != 7 || *resumed.Session.CostUSD != 13.625 {
		t.Fatalf("resumed = %+v", resumed)
	}
	for name, before := range map[string]*run.SessionTotals{
		"no earlier totals":      nil,
		"no earlier cost":        {Usage: &run.Usage{InputTokens: n(1)}},
		"earlier cost is higher": {CostUSD: usd(14)},
	} {
		if unknown := run.Own(reported(before), true); unknown.CostUSD != nil || *unknown.Session.CostUSD != 13.625 {
			t.Fatalf("%s: %+v", name, unknown)
		}
	}

	threads := func(before *run.SessionTotals) run.Turn {
		return run.Turn{Session: &run.SessionTotals{Usage: &run.Usage{InputTokens: n(36332), CacheReadTokens: n(31104), OutputTokens: n(10)}}, SessionBefore: before}
	}
	own := run.Own(threads(&run.SessionTotals{Usage: &run.Usage{InputTokens: n(18069), CacheReadTokens: n(13184)}}), true).Usage
	if *own.InputTokens != 18263 || *own.CacheReadTokens != 17920 || own.OutputTokens != nil || own.ReasoningTokens != nil {
		t.Fatalf("usage = %+v", own)
	}
	if own := run.Own(threads(nil), false).Usage; *own.InputTokens != 36332 || *own.OutputTokens != 10 {
		t.Fatalf("fresh usage = %+v", own)
	}
	if kept := run.Own(run.Turn{CostUSD: usd(0.5)}, true); *kept.CostUSD != 0.5 {
		t.Fatalf("kept = %+v", kept)
	}
}

// A session's latest totals are those Agister recorded on its latest turn,
// on any run: the run that started it, or one continuing it, at any
// distance. Unknown, never a guess, while a run in it is unfinished, when
// the last to finish overlapped another, or when its latest turn reported
// no totals in the session, or when it started a runtime process and was
// reaped, whether or not it saved a turn. Runs in other sessions, runs that
// started no process and ran no turn, and the run asking do not count.
func TestLatestTotalsAreTheSessionsLatestRecordedTurn(t *testing.T) {
	t.Parallel()
	usd := func(v float64) *float64 { return &v }
	at := func(minute int) *time.Time {
		moment := time.Date(2026, 9, 30, 9, minute, 0, 0, time.UTC)
		return &moment
	}
	totals := func(cost float64) *run.SessionTotals { return &run.SessionTotals{CostUSD: usd(cost)} }
	// A run from created to finished (minutes; -1: unfinished) whose latest
	// turn reported session with totals.
	record := func(id, continues, session string, created, finished int, latest *run.SessionTotals) run.Record {
		r := run.Record{ID: id, Request: run.Request{Continue: continues}, CreatedAt: *at(created),
			Turn: &run.Turn{ProviderSessionID: session, Session: latest}}
		if finished >= 0 {
			r.FinishedAt = at(finished)
			r.Result = &run.Result{}
			if session != "" && continues == "" {
				r.Result.Session = &run.Session{ProviderSessionID: session}
			}
		}
		return r
	}
	a := record("a", "", "s", 0, 1, totals(1))
	b := record("b", "a", "s", 2, 3, totals(2))
	c := record("c", "b", "s", 4, 5, totals(3)) // continues a continuation
	refused := record("r", "a", "", 6, 7, nil)
	refused.Turn = nil
	other := record("o", "", "t", 8, 9, totals(9))
	// Its runtime process started; its owner ended before the turn was
	// saved, and the reaper finished it.
	reaped := func(id, continues string, created, finished int) run.Record {
		r := record(id, continues, "", created, finished, nil)
		r.Turn, r.Effects = nil, &run.Effects{Process: &run.Process{Ref: "ref-" + id}}
		result := run.AbandonedResult(r.CreatedAt)
		r.Result = &result
		return r
	}
	// It saved a turn in the session, then started another runtime process
	// (a repair turn after verification); its owner ended before that
	// turn was saved, and the reaper finished it.
	reapedAfterTurn := func(id, continues string, created, finished int) run.Record {
		r := reaped(id, continues, created, finished)
		r.Turn = &run.Turn{ProviderSessionID: "s", Session: totals(5)}
		return r
	}

	for _, test := range []struct {
		name    string
		records []run.Record
		exclude string
		want    *float64
	}{
		{"the only run", []run.Record{a}, "", usd(1)},
		{"a later continuation", []run.Record{a, b}, "", usd(2)},
		{"a continuation of a continuation", []run.Record{c, a, b}, "", usd(3)},
		{"runs that ran no turn or another session", []run.Record{a, b, refused, other}, "", usd(2)},
		{"the run asking", []run.Record{a, b, record("me", "a", "", 4, -1, nil)}, "me", usd(2)},
		{"a run still in a turn", []run.Record{a, b, record("x", "a", "", 4, -1, nil)}, "", nil},
		{"overlapping runs", []run.Record{a, record("b", "a", "s", 0, 3, totals(2))}, "", nil},
		{"no totals on the latest turn", []run.Record{a, record("b", "a", "s", 2, 3, nil)}, "", nil},
		{"latest turn reported nothing", []run.Record{a, record("b", "a", "", 2, 3, nil)}, "", nil},
		{"no run in the session", []run.Record{other}, "", nil},
		{"a continuation reaped with no turn", []run.Record{a, reaped("x", "a", 2, 3)}, "", nil},
		{"a reaped continuation of a continuation", []run.Record{a, b, reaped("x", "b", 4, 5)}, "", nil},
		{"a continuation after a reaped one", []run.Record{a, reaped("x", "a", 2, 3), record("d", "x", "s", 4, 5, totals(4))}, "", usd(4)},
		{"a continuation reaped after saving a turn", []run.Record{a, reapedAfterTurn("x", "a", 2, 3)}, "", nil},
		{"a continuation after one reaped after saving a turn", []run.Record{a, reapedAfterTurn("x", "a", 2, 3), record("d", "x", "s", 4, 5, totals(4))}, "", usd(4)},
		{"a reaped run in another session", []run.Record{a, b, reaped("x", "o", 10, 11), other}, "", usd(2)},
	} {
		got := run.LatestTotals(test.records, "s", test.exclude)
		if test.want == nil && got != nil || test.want != nil && (got == nil || *got.CostUSD != *test.want) {
			t.Fatalf("%s: got %+v, want %v", test.name, got, test.want)
		}
	}
}
