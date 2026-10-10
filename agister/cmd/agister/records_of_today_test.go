package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/pages"
)

// A record made before ADR-030 is read as it is (rule 11). The four under
// testdata/records are runs of home's own store, made before a workflow
// bound an agent: each directory holds its run's record.json and nothing
// else of the run. They are read here through the real composition, in a
// home that has none of their settings.

// todaysRecord is one committed record: what it names, and what an export
// of it says.
type todaysRecord struct {
	id      string
	process string
	agent   string // empty: the record names none
	status  string
	// listed is the status as runs list prints it, with the error's class.
	listed string
	// is says whether record, as runs show printed it, is the kind of run
	// the record was committed as.
	is func(record map[string]any) bool
	// export is the exit code of an export of the run, and exportSays what
	// it prints of the first thing the record names that was not committed
	// with it; empty when the record names nothing else, and is copied.
	export     int
	exportSays string
}

var todaysRecords = []todaysRecord{
	// A refused run: a continuation its agent's session did not allow.
	{
		id: "20261006T165603Z-7bcadd", process: "review_judge", agent: "claude-judge",
		status: "failed", listed: "failed/refused",
		is: func(record map[string]any) bool {
			return at(record, "result", "error", "class") == "refused" && record["turn"] == nil
		},
		export: cli.ExitCompleted,
	},
	// A repaired run: its first verification failed, and its second, after
	// the repair turn, passed.
	{
		id: "20261009T184118Z-ae4689", process: "implement_warder", agent: "claude-implementer-opus",
		status: "completed", listed: "completed",
		is: func(record map[string]any) bool {
			attempts, _ := record["attempts"].([]any)
			return len(attempts) == 2 && at(attempts[0], "run", "passed") == false && at(attempts[1], "run", "passed") == true
		},
		export:     cli.ExitFailed,
		exportSays: "FAILED  20261009T184118Z-ae4689: artifact artifacts/changes.patch cannot be read back: ",
	},
	// A workflow with one node and its join.
	{
		id: "20261010T095548Z-bac87a", process: "adr_review",
		status: "completed", listed: "completed",
		is: func(record map[string]any) bool {
			nodes, _ := at(record, "workflow", "nodes").([]any)
			return len(nodes) == 2 &&
				at(nodes[0], "name") == "adr" && at(nodes[0], "process") == "adr_review_codex" && at(nodes[0], "join") == nil &&
				at(nodes[1], "name") == "judge" && at(nodes[1], "process") == "review_judge" && at(nodes[1], "join") == true
		},
		export:     cli.ExitRefused,
		exportSays: "run 20261010T095548Z-12b5cf, node adr of workflow run 20261010T095548Z-bac87a, does not exist",
	},
	// A continuation: it ran in the session of an earlier run.
	{
		id: "20261010T181147Z-999397", process: "implement", agent: "claude-implementer-opus",
		status: "completed", listed: "completed",
		is: func(record map[string]any) bool {
			earlier := "20261010T172508Z-da7f75"
			return at(record, "request", "continue") == earlier && at(record, "result", "session", "continues") == earlier
		},
		export:     cli.ExitFailed,
		exportSays: "FAILED  20261010T181147Z-999397: artifact artifacts/changes.patch cannot be read back: ",
	},
}

// at is the value at path in the nested objects of value; nil when a step
// is not there.
func at(value any, path ...string) any {
	for _, key := range path {
		object, _ := value.(map[string]any)
		value = object[key]
	}
	return value
}

// homeOfTodaysRecords is a home whose run store holds the committed records
// as committed, by run ID: each run's directory its record.json and nothing
// else. Its only settings are the shipped example's service.toml, without
// which every command is refused: it has no process, agent, workflow,
// policy, runtime or schema, so none the records name, and its service is
// not theirs either. It fails the test when testdata/records holds anything
// but the records of todaysRecords.
func homeOfTodaysRecords(t *testing.T) (home string, committed map[string]string) {
	t.Helper()
	home, committed = tempDir(t), map[string]string{}
	write(t, filepath.Join(home, "service.toml"), read(t, filepath.Join("..", "..", "examples", "settings", "service.toml")))
	found := filesIn(t, filepath.Join("..", "..", "testdata", "records"))
	for _, record := range todaysRecords {
		path := record.id + "/record.json"
		data, ok := found[path]
		if !ok {
			t.Fatalf("testdata/records lacks %s", path)
		}
		delete(found, path)
		committed[record.id] = data
		write(t, filepath.Join(home, "runs", record.id, "record.json"), data)
	}
	if len(found) > 0 {
		t.Fatalf("testdata/records holds more than its four records: %v", keys(found))
	}
	return home, committed
}

// decoded is the JSON value of text.
func decoded(t *testing.T, text string) any {
	t.Helper()
	var value any
	if err := json.Unmarshal([]byte(text), &value); err != nil {
		t.Fatalf("%v: %s", err, text)
	}
	return value
}

// runs list names each record of today with its process, its agent, a dash
// where it names none, and its status.
func TestRunsListNamesTheRecordsOfToday(t *testing.T) {
	t.Parallel()
	home, _ := homeOfTodaysRecords(t)
	var want strings.Builder
	for _, record := range todaysRecords {
		agent := record.agent
		if agent == "" {
			agent = "-"
		}
		want.WriteString(record.id + "\t" + record.process + "\t" + agent + "\t" + record.listed + "\n")
	}
	r := agister(t, home, tempDir(t), "runs", "list")
	if r.code != cli.ExitCompleted || r.stdout != want.String() {
		t.Fatalf("runs list: %d\n%s%s\nwant\n%s", r.code, r.stdout, r.stderr, want.String())
	}
}

// runs show prints each record of today as it is: every field the record
// holds, with its value, and no other; among them its process, its agent
// and its status, and what makes it the kind of run it was committed as.
func TestRunsShowPrintsTheRecordsOfTodayAsTheyAre(t *testing.T) {
	t.Parallel()
	home, committed := homeOfTodaysRecords(t)
	cwd := tempDir(t)
	for _, record := range todaysRecords {
		r := agister(t, home, cwd, "runs", "show", record.id)
		if r.code != cli.ExitCompleted {
			t.Fatalf("runs show %s: %d\n%s", record.id, r.code, r.stderr)
		}
		shown, _ := decoded(t, r.stdout).(map[string]any)
		if !reflect.DeepEqual(shown, decoded(t, committed[record.id])) {
			t.Errorf("runs show %s does not print the record as committed:\n%s", record.id, r.stdout)
		}
		agent, _ := shown["agent"].(string)
		if shown["process"] != record.process || agent != record.agent || at(shown, "result", "status") != record.status {
			t.Errorf("runs show %s: process %v, agent %q, status %v", record.id, shown["process"], agent, at(shown, "result", "status"))
		}
		if !record.is(shown) {
			t.Errorf("runs show %s: not the kind of run it was committed as", record.id)
		}
	}
}

// runs export reads each record of today. The one that names nothing beyond
// itself is copied byte for byte, so its copy names its process, agent and
// status. Each of the others names what was not committed with it, its
// artifacts or its nodes' runs: the export says which it read the record to
// name, and puts no copy in place (ADR-026 rule 7).
func TestRunsExportReadsTheRecordsOfToday(t *testing.T) {
	t.Parallel()
	home, committed := homeOfTodaysRecords(t)
	cwd := tempDir(t)
	for _, record := range todaysRecords {
		to := tempDir(t)
		r := agister(t, home, cwd, "runs", "export", record.id, "--to", to)
		if r.code != record.export {
			t.Fatalf("runs export %s: %d, want %d\n%s%s", record.id, r.code, record.export, r.stdout, r.stderr)
		}
		if record.exportSays != "" {
			if left := entries(t, to); !strings.Contains(r.stdout+r.stderr, record.exportSays) || len(left) > 0 {
				t.Errorf("runs export %s: want %q and no copy, got %v and\n%s%s", record.id, record.exportSays, left, r.stdout, r.stderr)
			}
			continue
		}
		copied := filesIn(t, to)
		if want := map[string]string{record.id + "/record.json": committed[record.id]}; !reflect.DeepEqual(copied, want) {
			t.Errorf("runs export %s: the copy holds %v, not the record alone as committed\n%s", record.id, keys(copied), r.stdout)
		}
	}
}

// The Pages Runs view reads each record of today from the run store the
// process's pages read: its list names each with its process, agent and
// status, and each opens as its record, as committed.
func TestPagesReadTheRecordsOfToday(t *testing.T) {
	t.Parallel()
	home, committed := homeOfTodaysRecords(t)
	noDialog := func(context.Context) (string, error) {
		t.Error("the folder dialog was shown")
		return "", nil
	}
	handler := pages.Handler(home, noDialog, pagesEnv(fsruns.NewAppends()).Observe, pages.SkillHomes{}, pagesSettings)
	get := func(target string, out any) {
		t.Helper()
		request := httptest.NewRequest(http.MethodGet, target, nil)
		request.Host = "localhost:7465"
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", target, response.Code, response.Body)
		}
		if err := json.Unmarshal(response.Body.Bytes(), out); err != nil {
			t.Fatalf("%s: %v: %s", target, err, response.Body)
		}
	}

	var list pages.RunList
	get("/api/runs", &list)
	if list.Total != len(todaysRecords) || list.Skipped != 0 || len(list.Runs) != len(todaysRecords) {
		t.Fatalf("the list = %+v", list)
	}
	// Newest first: the records are in the order of their IDs, oldest first.
	for i, record := range todaysRecords {
		listed := list.Runs[len(list.Runs)-1-i]
		if listed.ID != record.id || listed.Process != record.process || listed.Agent != record.agent || listed.Status != record.status {
			t.Errorf("listed %s as %s: process %q, agent %q, status %q", record.id, listed.ID, listed.Process, listed.Agent, listed.Status)
		}
		var detail pages.RunDetail
		get("/api/runs/"+record.id, &detail)
		if !reflect.DeepEqual(detail.Summary, listed) {
			t.Errorf("%s opens as %+v, listed as %+v", record.id, detail.Summary, listed)
		}
		if !reflect.DeepEqual(decoded(t, string(detail.Record)), decoded(t, committed[record.id])) {
			t.Errorf("%s does not open as the record committed:\n%s", record.id, detail.Record)
		}
	}
}
