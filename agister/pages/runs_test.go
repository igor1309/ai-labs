package pages

import (
	"net/http"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

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

	list, err := ListRuns(runs, DefaultRunLimit)
	if err != nil || len(list.Runs) != 2 {
		t.Fatalf("list = %+v, %v", list, err)
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
	// No result: the run is still running.
	if old.Status != "running" || old.Outcome.WallMS != nil {
		t.Fatalf("summary = %+v", old)
	}
}

func TestSummaryCountsVerifyAttempts(t *testing.T) {
	runs := t.TempDir()
	runRecord(t, runs, "run-1", call("run-1", "implement", "2026-10-01T10:00:00Z",
		`,"verify":{"command":"go test ./...","timeout":0,"max_attempts":3,"instruction":""},`+
			`"attempts":[{"number":1,"turn":{"status":"completed"},"run":{"command":"go test ./...","dir":"/c","started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:00:00Z","wall_ms":1,"output":{"head":"","bytes":0,"sha256":""},"passed":false}},`+
			`{"number":2,"turn":{"status":"completed"},"run":{"command":"go test ./...","dir":"/c","started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:00:00Z","wall_ms":1,"output":{"head":"","bytes":0,"sha256":""},"passed":true}}]`))
	detail, err := ReadRun(runs, "run-1")
	if err != nil {
		t.Fatal(err)
	}
	if verify := detail.Summary.Outcome.Verify; verify == nil || *verify != (VerifyOutcome{Attempts: 2, Passed: true}) {
		t.Fatalf("verify = %+v", verify)
	}
	// The record comes back as stored.
	if !strings.Contains(string(detail.Record), `"max_attempts":3`) {
		t.Fatalf("record = %s", detail.Record)
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
	detail, err := ReadRun(runs, "wf-1")
	if err != nil {
		t.Fatal(err)
	}
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

	list, err := ListRuns(runs, DefaultRunLimit)
	if err != nil || len(list.Runs) != 2 {
		t.Fatalf("list = %+v, %v", list, err)
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

	list, err := ListRuns(runs, 2)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, summary := range list.Runs {
		ids = append(ids, summary.ID)
	}
	if !reflect.DeepEqual(ids, []string{"run-b", "run-c"}) || list.Total != 3 || list.Skipped != 1 {
		t.Fatalf("ids = %v, list %+v", ids, list)
	}
	if _, err := ListRuns(runs, 0); err == nil {
		t.Fatal("a limit of 0 was taken")
	}
	// No runs directory yet: no runs.
	if empty, err := ListRuns(filepath.Join(runs, "missing"), 5); err != nil || len(empty.Runs) != 0 {
		t.Fatalf("list = %+v, %v", empty, err)
	}
}

func TestRunEndpoints(t *testing.T) {
	home := t.TempDir()
	runs := filepath.Join(home, "runs")
	runRecord(t, runs, "run-1", call("run-1", "p", "2026-10-01T09:00:00Z", ""))
	runRecord(t, runs, "run-2", call("run-2", "p", "2026-10-01T10:00:00Z", ""))
	runRecord(t, runs, "bad", `not json`)
	h := Handler(home, noChoose(t))

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
		if _, err := ReadRun(runs, id); err == nil {
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
	opus := `,"profile":{"model":"opus","effort":"high"},"runtime":{"mapping":"m","adapter":"claude-code","contract":"c","version":"1"},`
	sol := `,"profile":{"effort":"medium"},"runtime":{"mapping":"m","adapter":"codex","contract":"c","version":"1"},"turn":{"status":"completed","model":"gpt-6.1-sol"},`
	verify := `"verify":{"command":"t","timeout":0,"max_attempts":3,"instruction":""},"attempts":[{"number":1,"turn":{"status":"completed"}},{"number":2,"turn":{"status":"completed"}}],`
	runRecord(t, runs, "o-1", call("o-1", "implement", "2026-10-01T10:00:01Z", opus+verify+finished("completed", 100, "1")))
	runRecord(t, runs, "o-2", call("o-2", "implement", "2026-10-01T10:00:02Z", opus+finished("completed", 300, "2")))
	runRecord(t, runs, "o-3", call("o-3", "implement", "2026-10-01T10:00:03Z", opus+finished("failed", 200, "3")))
	runRecord(t, runs, "s-1", call("s-1", "implement", "2026-10-01T10:00:04Z", sol+finished("completed", 50, "")))
	runRecord(t, runs, "s-2", call("s-2", "implement", "2026-10-01T10:00:05Z", sol+finished("failed", 70, "0.5")))
	// Neither an interrupted call, one still running, nor a workflow is compared.
	runRecord(t, runs, "s-3", call("s-3", "implement", "2026-10-01T10:00:06Z", sol+finished("interrupted", 10, "9")))
	runRecord(t, runs, "s-4", call("s-4", "implement", "2026-10-01T10:00:07Z", sol[:len(sol)-1]))
	runRecord(t, runs, "wf", call("wf", "implement", "2026-10-01T10:00:08Z", `,"workflow":{"nodes":[],"barrier":{"state":"passed"}},`+finished("completed", 1, "1")))

	comparison, err := Compare(runs)
	if err != nil || len(comparison.Groups) != 2 {
		t.Fatalf("comparison = %+v, %v", comparison, err)
	}
	two, half, sixty, twoHundred, three := 2.0, 0.5, 60.0, 200.0, 3.0
	want := []CompareGroup{
		{Process: "implement", Adapter: "claude-code", Model: "opus", Effort: "high", Runs: 3, Completed: 2, PassRate: 2.0 / 3,
			MeanVerifyAttempts: &two, MedianWallMS: &twoHundred, TotalCostUSD: 6, CostPerCompletedUSD: &three},
		{Process: "implement", Adapter: "codex", Model: "gpt-6.1-sol", Effort: "medium", Runs: 2, Completed: 1, PassRate: 0.5,
			MedianWallMS: &sixty, TotalCostUSD: 0.5, CostUnknown: 1, CostPerCompletedUSD: &half},
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
