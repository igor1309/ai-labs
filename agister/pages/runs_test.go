package pages

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// fakeRuns is a run store over dir as the real one reads it: a finished
// record is finished; an unfinished one is running while its ID is in
// held and abandoned once it is not.
type fakeRuns struct {
	dir  string
	held []string
}

func (f fakeRuns) Get(_ context.Context, id string) (run.Record, run.State, error) {
	_, record, err := readRecord(f.dir, id)
	switch {
	case err != nil:
		return record, "", err
	case record.FinishedAt != nil:
		return record, run.StateFinished, nil
	case slices.Contains(f.held, id):
		return record, run.StateRunning, nil
	}
	return record, run.StateAbandoned, nil
}

// owners is a run store whose owners hold the runs held.
func owners(held ...string) Observe {
	return func(dir string) RunObserver { return fakeRuns{dir, held} }
}

// listRuns lists the runs under dir, the held ones owned.
func listRuns(t *testing.T, dir string, limit int, held ...string) RunList {
	t.Helper()
	list, err := ListRuns(context.Background(), dir, fakeRuns{dir, held}, limit)
	if err != nil {
		t.Fatal(err)
	}
	return list
}

// readRun reads the run id under dir, the held ones owned.
func readRun(t *testing.T, dir, id string, held ...string) RunDetail {
	t.Helper()
	detail, err := ReadRun(context.Background(), dir, fakeRuns{dir, held}, id)
	if err != nil {
		t.Fatal(err)
	}
	return detail
}

// runRecord writes a run's record.json, and its events.jsonl when events
// is not empty, under runs.
func runRecord(t *testing.T, runs, id, record string, events ...string) {
	t.Helper()
	write(t, filepath.Join(runs, id, "record.json"), record)
	if len(events) > 0 {
		write(t, filepath.Join(runs, id, "events.jsonl"), strings.Join(events, "\n")+"\n")
	}
}

// call is a finished call's record.
func call(id, process, created, extra string) string {
	return `{"schema":"agister.run/v1alpha3","id":"` + id + `","process":"` + process + `","agent":"a",` +
		`"request":{"process":"` + process + `","cwd":"/repo"},"created_at":"` + created + `"` + extra + `}`
}

func TestSummaryTakesModelAndEffortFromTheRecordedProfile(t *testing.T) {
	runs := t.TempDir()
	runRecord(t, runs, "run-1", call("run-1", "implement", "2026-10-01T10:00:00Z",
		`,"profile":{"model":"opus","effort":"high","session":"fresh-only"},`+
			`"runtime":{"mapping":"claude","adapter":"claude-code","contract":"c","version":"2.1"},`+
			`"effective":{"timeout":1200000000000,"max_attempts":1,"max_cost_usd":5,"allow":[],"deny":[],"permissions":[],"access":"read-write","scope":"candidate"},`+
			`"turn":{"status":"completed","model":"claude-opus-5-5"},`+
			`"parent":{"run":"wf-1","node":"first"},`+
			`"result":{"status":"completed","cost":{"usd":1.5,"source":"runtime"},"timing":{"started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:01:00Z","wall_ms":60000,"turn_ms":59000,"runtime_ms":58000}}`))
	// Written before profiles were recorded: no effort, the reported model.
	runRecord(t, runs, "run-0", call("run-0", "implement", "2026-09-30T10:00:00Z",
		`,"runtime":{"mapping":"codex","adapter":"codex","contract":"c","version":"0.9"},"turn":{"status":"failed","model":"gpt-6.1-sol"}`))

	list := listRuns(t, runs, DefaultRunLimit)
	if len(list.Runs) != 2 {
		t.Fatalf("list = %+v", list)
	}
	profiled, old := list.Runs[0], list.Runs[1]
	if *profiled.Implementor != (Implementor{Adapter: "claude-code", Version: "2.1", Model: "opus", ReportedModel: "claude-opus-5-5", Effort: "high"}) {
		t.Fatalf("implementor = %+v", profiled.Implementor)
	}
	five := 5.0
	if !reflect.DeepEqual(*profiled.Policy, RunPolicy{TimeoutMS: 1200000, MaxCostUSD: &five, Access: "read-write", Scope: "candidate"}) {
		t.Fatalf("policy = %+v", profiled.Policy)
	}
	outcome := profiled.Outcome
	if profiled.Status != "completed" || profiled.Parent != "wf-1" || outcome.Verify != nil ||
		*outcome.WallMS != 60000 || *outcome.TurnMS != 59000 || *outcome.RuntimeMS != 58000 ||
		*outcome.CostUSD != 1.5 || outcome.CostSource != "runtime" {
		t.Fatalf("summary = %+v, outcome %+v", profiled, outcome)
	}
	if *old.Implementor != (Implementor{Adapter: "codex", Version: "0.9", Model: "gpt-6.1-sol", ReportedModel: "gpt-6.1-sol"}) {
		t.Fatalf("implementor = %+v", old.Implementor)
	}
	// No result and nobody owns it: the run is lost.
	if old.Status != "lost" || old.Outcome.WallMS != nil {
		t.Fatalf("summary = %+v", old)
	}
}

func TestSummaryCountsVerifyAttempts(t *testing.T) {
	runs := t.TempDir()
	runRecord(t, runs, "run-1", call("run-1", "implement", "2026-10-01T10:00:00Z",
		`,"verify":{"command":"go test ./...","timeout":0,"max_attempts":3,"instruction":""},`+
			`"attempts":[{"number":1,"turn":{"status":"completed"},"run":{"command":"go test ./...","dir":"/c","started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:00:00Z","wall_ms":1,"output":{"head":"","bytes":0,"sha256":""},"passed":false}},`+
			`{"number":2,"turn":{"status":"completed"},"run":{"command":"go test ./...","dir":"/c","started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:00:00Z","wall_ms":1,"output":{"head":"","bytes":0,"sha256":""},"passed":true}}]`))
	detail := readRun(t, runs, "run-1")
	if verify := detail.Summary.Outcome.Verify; verify == nil || *verify != (VerifyOutcome{Attempts: 2, Passed: true}) {
		t.Fatalf("verify = %+v", verify)
	}
}

func TestReadRunReturnsTheRecordAsStored(t *testing.T) {
	home := t.TempDir()
	runs := filepath.Join(home, "runs")
	// Spacing, key order and a field no Agister record has: none of it
	// survives a record rebuilt from the domain struct.
	stored := `{
  "id": "run-1",   "schema": "agister.run/v1alpha3", "process": "implement",
  "request": {"process": "implement", "cwd": "/repo"}, "created_at": "2026-10-01T10:00:00Z",
  "verify": {"command": "go test ./...", "timeout": 0, "max_attempts": 3, "instruction": ""},
  "from_a_newer_agister": {"kept": [1, 2, 3]},
  "finished_at": "2026-10-01T10:00:01Z",
  "result": {"status": "completed", "cost": {"source": "unknown"}, "timing": {"started_at": "2026-10-01T10:00:00Z", "finished_at": "2026-10-01T10:00:01Z", "wall_ms": 1000}}
}
`
	runRecord(t, runs, "run-1", stored)

	if detail := readRun(t, runs, "run-1"); string(detail.Record) != stored {
		t.Fatalf("record = %s, want %s", detail.Record, stored)
	}
	// Through the endpoint, the same record, the unknown field with it.
	var detail struct {
		Summary RunSummary     `json:"summary"`
		Record  map[string]any `json:"record"`
	}
	if code := get(t, Handler(home, noChoose(t), owners()), "localhost:7465", "/api/runs/run-1", &detail); code != http.StatusOK {
		t.Fatalf("code %d", code)
	}
	var want map[string]any
	if err := json.Unmarshal([]byte(stored), &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(detail.Record, want) || detail.Summary.Status != "completed" {
		t.Fatalf("record = %v, summary %+v", detail.Record, detail.Summary)
	}
}

func TestAnUnfinishedRunIsRunningWhileOwnedAndLostOnceNot(t *testing.T) {
	home := t.TempDir()
	runs := filepath.Join(home, "runs")
	runRecord(t, runs, "owned", call("owned", "implement", "2026-10-01T10:00:00Z", ""))
	runRecord(t, runs, "left", call("left", "implement", "2026-10-01T09:00:00Z", ""))

	list := listRuns(t, runs, DefaultRunLimit, "owned")
	if statuses := []string{list.Runs[0].Status, list.Runs[1].Status}; !reflect.DeepEqual(statuses, []string{"running", "lost"}) {
		t.Fatalf("statuses = %v", statuses)
	}
	if detail := readRun(t, runs, "owned", "owned"); detail.Summary.Status != "running" {
		t.Fatalf("owned: %+v", detail.Summary)
	}
	if detail := readRun(t, runs, "left", "owned"); detail.Summary.Status != "lost" || detail.Summary.Outcome.WallMS != nil {
		t.Fatalf("left: %+v", detail.Summary)
	}
	// The endpoints read the owners from the run store they are given.
	h := Handler(home, noChoose(t), owners("owned"))
	var listed RunList
	if code := get(t, h, "localhost:7465", "/api/runs", &listed); code != http.StatusOK ||
		listed.Runs[0].Status != "running" || listed.Runs[1].Status != "lost" {
		t.Fatalf("code %d, list %+v", code, listed)
	}
	var detail RunDetail
	if code := get(t, h, "localhost:7465", "/api/runs/left", &detail); code != http.StatusOK || detail.Summary.Status != "lost" {
		t.Fatalf("code %d, detail %+v", code, detail.Summary)
	}
	// Once its owner lets go, the owned run is lost too.
	if detail := readRun(t, runs, "owned"); detail.Summary.Status != "lost" {
		t.Fatalf("released: %+v", detail.Summary)
	}
}

// finishing is a run store over dir whose run finishes as it is asked
// about: the run's record is replaced with finished before Get reads it.
type finishing struct {
	fakeRuns
	t        *testing.T
	finished string
}

func (f finishing) Get(ctx context.Context, id string) (run.Record, run.State, error) {
	runRecord(f.t, f.dir, id, f.finished)
	return f.fakeRuns.Get(ctx, id)
}

func TestARunThatFinishesWhileReadReadsAsFinished(t *testing.T) {
	runs := t.TempDir()
	runRecord(t, runs, "run-1", call("run-1", "implement", "2026-10-01T10:00:00Z", ""))
	finished := call("run-1", "implement", "2026-10-01T10:00:00Z",
		`,"finished_at":"2026-10-01T10:00:09Z","result":{"status":"completed","cost":{"source":"unknown"},"timing":{"started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:00:09Z","wall_ms":9000}}`)

	detail, err := ReadRun(context.Background(), runs, finishing{fakeRuns{dir: runs}, t, finished}, "run-1")
	if err != nil {
		t.Fatal(err)
	}
	if detail.Summary.Status != "completed" || *detail.Summary.Outcome.WallMS != 9000 || string(detail.Record) != finished {
		t.Fatalf("summary = %+v, record %s", detail.Summary, detail.Record)
	}
}

func TestWorkflowSummaryCountsJudgeItems(t *testing.T) {
	runs := t.TempDir()
	runRecord(t, runs, "wf-1", `{"schema":"agister.run/v1alpha3","id":"wf-1","process":"code_review","request":{"process":"code_review","cwd":"/r"},"created_at":"2026-10-01T10:00:00Z",`+
		`"workflow":{"nodes":[{"name":"first","process":"review","run":"r-1","status":"completed"},{"name":"second","process":"review","run":"r-2","status":"failed"},`+
		`{"name":"third","process":"review","run":"r-3","status":"completed"},{"name":"judge","process":"judge","join":true,"run":"r-4","status":"completed"}],"barrier":{"state":"passed"}},`+
		`"result":{"status":"completed","cost":{"source":"unknown"},"timing":{"started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:00:00Z","wall_ms":5},`+
		`"output":{"summary":"s","items":[`+
		`{"severity":"major","sources":["1#1","3#2","1#4"],"ruling":"fix"},`+
		`{"severity":"minor","sources":["3#1"],"ruling":"defer"},`+
		`{"severity":"major","sources":["1#2"],"ruling":"reject"}]}}}`)
	detail := readRun(t, runs, "wf-1")
	workflow := detail.Summary.Workflow
	if workflow == nil || len(workflow.Nodes) != 4 || workflow.Nodes[1] != (NodeSummary{Name: "second", Process: "review", Run: "r-2", Status: "failed"}) {
		t.Fatalf("workflow = %+v", workflow)
	}
	want := ItemCounts{
		Total:      3,
		ByRuling:   map[string]int{"fix": 1, "defer": 1, "reject": 1},
		BySeverity: map[string]int{"major": 2, "minor": 1},
		BySource: []SourceCount{
			{Source: 1, Node: "first", Run: "r-1", ByRuling: map[string]int{"fix": 1, "reject": 1}},
			{Source: 3, Node: "third", Run: "r-3", ByRuling: map[string]int{"fix": 1, "defer": 1}},
		},
	}
	if !reflect.DeepEqual(*workflow.Items, want) {
		t.Fatalf("items = %+v", *workflow.Items)
	}
	if detail.Summary.Implementor != nil {
		t.Fatalf("a workflow run has no implementor: %+v", detail.Summary.Implementor)
	}
}

func TestSummaryCountsSkillsAndToolCalls(t *testing.T) {
	runs := t.TempDir()
	runRecord(t, runs, "run-1", call("run-1", "implement", "2026-10-01T10:00:00Z", ""),
		`{"seq":1,"at":"2026-10-01T10:00:00Z","source":"agister","kind":"CALL_SUBMITTED"}`,
		`{"seq":2,"at":"2026-10-01T10:00:00Z","source":"protocol","kind":"TOOL_REQUESTED","data":{"name":"Skill","input":"{\"skill\":\"code-review-discipline\"}"}}`,
		`{"seq":3,"at":"2026-10-01T10:00:00Z","source":"protocol","kind":"TOOL_REQUESTED","data":{"name":"command","input":"/bin/zsh -lc 'sed -n 1,200p .agents/skills/x/SKILL.md'"}}`,
		`{"seq":4,"at":"2026-10-01T10:00:00Z","source":"protocol","kind":"TOOL_REQUESTED","data":{"name":"Read","input":"{\"file_path\":\"/repo/go.mod\"}"}}`,
		`{"seq":5,"at":"2026-10-01T10:00:00Z","source":"protocol","kind":"TOOL_RESULT","data":{}}`)
	runRecord(t, runs, "run-2", call("run-2", "implement", "2026-10-01T09:00:00Z", ""))

	list := listRuns(t, runs, DefaultRunLimit)
	if len(list.Runs) != 2 {
		t.Fatalf("list = %+v", list)
	}
	used := list.Runs[0]
	if want := []SkillUse{{"code-review-discipline", 1}, {"x", 1}}; !reflect.DeepEqual(used.Skills, want) || used.ToolCalls == nil || *used.ToolCalls != 3 {
		t.Fatalf("skills = %+v, tool calls %v", used.Skills, used.ToolCalls)
	}
	// No events: skills and tool calls are left empty.
	if none := list.Runs[1]; none.Skills != nil || none.ToolCalls != nil {
		t.Fatalf("summary = %+v", none)
	}
}

func TestListSkipsUnparseableRecordsNewestFirstWithinLimit(t *testing.T) {
	runs := t.TempDir()
	runRecord(t, runs, "run-a", call("run-a", "p", "2026-10-01T09:00:00Z", ""))
	runRecord(t, runs, "run-b", call("run-b", "p", "2026-10-01T11:00:00Z", ""))
	runRecord(t, runs, "run-c", call("run-c", "p", "2026-10-01T10:00:00Z", ""))
	runRecord(t, runs, "run-d", `{"id": "run-d", torn`)
	mkdir(t, filepath.Join(runs, "empty"))

	list := listRuns(t, runs, 2)
	var ids []string
	for _, summary := range list.Runs {
		ids = append(ids, summary.ID)
	}
	if !reflect.DeepEqual(ids, []string{"run-b", "run-c"}) || list.Total != 3 || list.Skipped != 1 {
		t.Fatalf("ids = %v, list %+v", ids, list)
	}
	if _, err := ListRuns(context.Background(), runs, fakeRuns{dir: runs}, 0); err == nil {
		t.Fatal("a limit of 0 was taken")
	}
	// No runs directory yet: no runs.
	if empty := listRuns(t, filepath.Join(runs, "missing"), 5); len(empty.Runs) != 0 {
		t.Fatalf("list = %+v", empty)
	}
}

func TestRunEndpoints(t *testing.T) {
	home := t.TempDir()
	runs := filepath.Join(home, "runs")
	runRecord(t, runs, "run-1", call("run-1", "p", "2026-10-01T09:00:00Z", ""))
	runRecord(t, runs, "run-2", call("run-2", "p", "2026-10-01T10:00:00Z", ""))
	runRecord(t, runs, "bad", `not json`)
	h := Handler(home, noChoose(t), owners())

	var list RunList
	if code := get(t, h, "localhost:7465", "/api/runs?limit=1", &list); code != http.StatusOK ||
		len(list.Runs) != 1 || list.Runs[0].ID != "run-2" || list.Skipped != 1 {
		t.Fatalf("code %d, list %+v", code, list)
	}
	for _, limit := range []string{"0", "x"} {
		if code := get(t, h, "localhost:7465", "/api/runs?limit="+limit, nil); code != http.StatusBadRequest {
			t.Fatalf("limit %s: code %d", limit, code)
		}
	}
	var detail RunDetail
	if code := get(t, h, "localhost:7465", "/api/runs/run-1", &detail); code != http.StatusOK || detail.Summary.ID != "run-1" {
		t.Fatalf("code %d, detail %+v", code, detail)
	}
	for _, target := range []string{"/api/runs/..%2Fsecret", "/api/runs/%2E%2E%2Fsecret", "/api/runs/a%2Fb", "/api/runs/a/b"} {
		if code := get(t, h, "localhost:7465", target, nil); code != http.StatusBadRequest {
			t.Fatalf("%s: code %d", target, code)
		}
	}
	// A bare .. is cleaned away by the router, a redirect, before any
	// handler sees it.
	if code := get(t, h, "localhost:7465", "/api/runs/..", nil); code != http.StatusTemporaryRedirect {
		t.Fatalf("/api/runs/..: code %d", code)
	}
	for _, id := range []string{"..", "a/b", "", "."} {
		if _, err := ReadRun(context.Background(), runs, fakeRuns{dir: runs}, id); err == nil {
			t.Fatalf("%q was read", id)
		}
	}
	if code := get(t, h, "localhost:7465", "/api/runs/run-9", nil); code != http.StatusNotFound {
		t.Fatalf("missing run: code %d", code)
	}
	var comparison Comparison
	if code := get(t, h, "localhost:7465", "/api/runs/compare", &comparison); code != http.StatusOK || comparison.Skipped != 1 {
		t.Fatalf("code %d, comparison %+v", code, comparison)
	}
	// The runs are read only from this machine.
	if code := get(t, h, "evil.example:7465", "/api/runs", nil); code != http.StatusForbidden {
		t.Fatalf("other host: code %d", code)
	}
}

func TestCompareGroupsByConfiguration(t *testing.T) {
	runs := t.TempDir()
	finished := func(status string, wall int, cost string) string {
		usd := ""
		if cost != "" {
			usd = `"usd":` + cost + `,`
		}
		return `"result":{"status":"` + status + `","cost":{` + usd + `"source":"runtime"},"timing":{"started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:00:00Z","wall_ms":` + strconv.Itoa(wall) + `}}`
	}
	configuration := func(adapter, model, effort string) string {
		return `,"profile":{"model":"` + model + `","effort":"` + effort + `"},"runtime":{"mapping":"m","adapter":"` + adapter + `","contract":"c","version":"1"},`
	}
	opus := configuration("claude-code", "opus", "high")
	sol := `,"profile":{"effort":"medium"},"runtime":{"mapping":"m","adapter":"codex","contract":"c","version":"1"},"turn":{"status":"completed","model":"gpt-6.1-sol"},`
	verify := `"verify":{"command":"t","timeout":0,"max_attempts":3,"instruction":""},"attempts":[{"number":1,"turn":{"status":"completed"}},{"number":2,"turn":{"status":"completed"}}],`
	// Each run costs its own power of two, so a group's total names its
	// members. The wall times 100, 900 and 200 have a median of 200 and a
	// mean of 400.
	runRecord(t, runs, "o-1", call("o-1", "implement", "2026-10-01T10:00:01Z", opus+verify+finished("completed", 100, "1")))
	runRecord(t, runs, "o-2", call("o-2", "implement", "2026-10-01T10:00:02Z", opus+finished("completed", 900, "2")))
	runRecord(t, runs, "o-3", call("o-3", "implement", "2026-10-01T10:00:03Z", opus+finished("failed", 200, "4")))
	// Each differs from opus in one dimension only: effort, model, process.
	runRecord(t, runs, "e-1", call("e-1", "implement", "2026-10-01T10:00:04Z", configuration("claude-code", "opus", "low")+finished("failed", 30, "8")))
	runRecord(t, runs, "m-1", call("m-1", "implement", "2026-10-01T10:00:05Z", configuration("claude-code", "sonnet", "high")+finished("completed", 70, "16")))
	runRecord(t, runs, "p-1", call("p-1", "plan", "2026-10-01T10:00:06Z", opus+finished("completed", 40, "32")))
	runRecord(t, runs, "s-1", call("s-1", "implement", "2026-10-01T10:00:07Z", sol+finished("completed", 50, "")))
	runRecord(t, runs, "s-2", call("s-2", "implement", "2026-10-01T10:00:08Z", sol+finished("failed", 70, "0.5")))
	// Neither an interrupted call, one still running, nor a workflow is compared.
	runRecord(t, runs, "s-3", call("s-3", "implement", "2026-10-01T10:00:09Z", sol+finished("interrupted", 10, "64")))
	runRecord(t, runs, "s-4", call("s-4", "implement", "2026-10-01T10:00:10Z", sol[:len(sol)-1]))
	runRecord(t, runs, "wf", call("wf", "implement", "2026-10-01T10:00:11Z", `,"workflow":{"nodes":[],"barrier":{"state":"passed"}},`+finished("completed", 1, "128")))

	comparison, err := Compare(runs)
	if err != nil {
		t.Fatal(err)
	}
	f := func(v float64) *float64 { return &v }
	want := []CompareGroup{
		{Process: "implement", Adapter: "claude-code", Model: "opus", Effort: "high", Runs: 3, Completed: 2, PassRate: 2.0 / 3,
			MeanVerifyAttempts: f(2), MedianWallMS: f(200), TotalCostUSD: 7, CostPerCompletedUSD: f(3.5)},
		{Process: "implement", Adapter: "claude-code", Model: "opus", Effort: "low", Runs: 1, Completed: 0, PassRate: 0,
			MedianWallMS: f(30), TotalCostUSD: 8},
		{Process: "implement", Adapter: "claude-code", Model: "sonnet", Effort: "high", Runs: 1, Completed: 1, PassRate: 1,
			MedianWallMS: f(70), TotalCostUSD: 16, CostPerCompletedUSD: f(16)},
		{Process: "implement", Adapter: "codex", Model: "gpt-6.1-sol", Effort: "medium", Runs: 2, Completed: 1, PassRate: 0.5,
			MedianWallMS: f(60), TotalCostUSD: 0.5, CostUnknown: 1, CostPerCompletedUSD: f(0.5)},
		{Process: "plan", Adapter: "claude-code", Model: "opus", Effort: "high", Runs: 1, Completed: 1, PassRate: 1,
			MedianWallMS: f(40), TotalCostUSD: 32, CostPerCompletedUSD: f(32)},
	}
	if !reflect.DeepEqual(comparison.Groups, want) {
		for _, group := range comparison.Groups {
			t.Logf("%+v verify %v median %v per %v", group, deref(group.MeanVerifyAttempts), deref(group.MedianWallMS), deref(group.CostPerCompletedUSD))
		}
		t.Fatal("groups differ")
	}
}

func deref(f *float64) any {
	if f == nil {
		return nil
	}
	return *f
}
