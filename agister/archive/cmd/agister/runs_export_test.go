package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsexport"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// agister runs export through the real composition: the run store under
// the home and the folder the copies go to, both in the test's own
// directories (ADR-026 rule 7).

// longBrief is a brief over the length a record keeps inline, so the run
// keeps its bytes as an artifact.
var longBrief = strings.Repeat("Keep the words of the brief.\n", 100)

// exportedRun is a finished run of the process briefed whose brief is kept
// as the artifact artifacts/input-brief.txt, and its ID.
func exportedRun(t *testing.T) (home, repo, id string) {
	t.Helper()
	home, repo = setup(t, "approve")
	write(t, filepath.Join(home, "processes", "briefed.yaml"), briefedProcess)
	write(t, filepath.Join(repo, "brief.md"), longBrief)
	runs := &newRuns{home: home}
	runs.take(t)
	record := briefed(t, home, repo, runs, "brief.md")
	if artifact := onlyInput(t, record)["artifact"].(map[string]any); artifact["path"] != "artifacts/input-brief.txt" {
		t.Fatalf("the brief's artifact = %v", artifact)
	}
	return home, repo, record["id"].(string)
}

// filesIn reads every file under dir, by slash-separated path relative to
// it.
func filesIn(t *testing.T, dir string) map[string]string {
	t.Helper()
	found := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		relative, _ := filepath.Rel(dir, path)
		data, err := os.ReadFile(path)
		found[filepath.ToSlash(relative)] = string(data)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return found
}

// sameAsTheStore fails the test unless the copy of run id in to holds
// exactly the run's files in home's store, its owner lock aside, byte for
// byte.
func sameAsTheStore(t *testing.T, home, to, id string) map[string]string {
	t.Helper()
	stored := files(t, filepath.Join(home, "runs", id))
	if _, ok := stored["owner.lock"]; !ok {
		t.Fatalf("the stored run %s has no owner lock: %v", id, keys(stored))
	}
	delete(stored, "owner.lock")
	copied := files(t, filepath.Join(to, id))
	if !reflect.DeepEqual(copied, stored) {
		t.Fatalf("the copy of %s holds %v, the store %v", id, keys(copied), keys(stored))
	}
	return copied
}

func keys(m map[string]string) []string {
	var list []string
	for key := range m {
		list = append(list, key)
	}
	return list
}

// entries lists the names in dir.
func entries(t *testing.T, dir string) []string {
	t.Helper()
	list, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range list {
		names = append(names, entry.Name())
	}
	return names
}

// size is the bytes of the files.
func size(files map[string]string) int {
	n := 0
	for _, data := range files {
		n += len(data)
	}
	return n
}

// A finished process run is copied byte for byte to <to>/<run-id>: its
// record, events and artifacts, and not its owner lock; the report says
// how many files and bytes, and nothing else is left in the folder. The
// run kept none of its runtime's output, which the fake wrote: neither it
// nor its copy holds a provider.jsonl, and its record names the runtime's
// session by ID.
func TestRunsExportCopiesAProcessRun(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	to := tempDir(t)

	r := agister(t, home, repo, "runs", "export", id, "--to", to)
	if r.code != cli.ExitCompleted {
		t.Fatalf("export: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	copied := sameAsTheStore(t, home, to, id)
	for _, name := range []string{"record.json", "events.jsonl", "artifacts/input-brief.txt"} {
		if _, ok := copied[name]; !ok {
			t.Fatalf("the copy lacks %s: %v", name, keys(copied))
		}
	}
	if _, ok := copied["provider.jsonl"]; ok || runtimeEcho(filepath.Join(home, "runs", id)) == "" {
		t.Fatalf("the run kept its runtime's output, or its runtime wrote none: %v", keys(copied))
	}
	var record struct {
		Turn struct {
			Session string `json:"provider_session_id"`
		}
	}
	if err := json.Unmarshal([]byte(copied["record.json"]), &record); err != nil || record.Turn.Session == "" {
		t.Fatalf("the record names no provider session: %v", err)
	}
	if copied["artifacts/input-brief.txt"] != longBrief {
		t.Fatalf("the brief's artifact = %q", copied["artifacts/input-brief.txt"])
	}
	want := fmt.Sprintf("copied  %s: %d files, %d bytes to %s\n", id, len(copied), size(copied), filepath.Join(to, id))
	if r.stdout != want {
		t.Fatalf("report = %q, want %q", r.stdout, want)
	}
	if names := entries(t, to); !reflect.DeepEqual(names, []string{id}) {
		t.Fatalf("the folder holds %v", names)
	}
}

// A run recorded before LAB-181 holds its runtime's output, provider.jsonl:
// it is copied with the rest, byte for byte.
func TestRunsExportCopiesAnOlderRunsProviderLog(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	const provider = "{\"type\":\"system\"}\n{\"type\":\"result\"}\n"
	write(t, filepath.Join(home, "runs", id, "provider.jsonl"), provider)
	to := tempDir(t)

	r := agister(t, home, repo, "runs", "export", id, "--to", to)
	if r.code != cli.ExitCompleted {
		t.Fatalf("export: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if copied := sameAsTheStore(t, home, to, id); copied["provider.jsonl"] != provider {
		t.Fatalf("the copy's provider.jsonl = %q, of %v", copied["provider.jsonl"], keys(copied))
	}
}

// A workflow run brings each node's run, as its record names them, each to
// <to>/<node-run-id>, and the report names each node's run as the
// workflow's.
func TestRunsExportBringsAWorkflowsNodes(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	if r := agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt"); r.code != cli.ExitCompleted {
		t.Fatalf("workflow: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	id, record := workflowRun(t, home)
	to := tempDir(t)

	r := agister(t, home, repo, "runs", "export", id, "--to", to)
	if r.code != cli.ExitCompleted {
		t.Fatalf("export: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	want := []string{id}
	lines := strings.Split(strings.TrimSuffix(r.stdout, "\n"), "\n")
	if len(lines) != 1+len(record.Workflow.Nodes) || !strings.HasPrefix(lines[0], "copied  "+id+": ") {
		t.Fatalf("report:\n%s", r.stdout)
	}
	sameAsTheStore(t, home, to, id)
	for i, node := range record.Workflow.Nodes {
		if node.Run == "" {
			t.Fatalf("node %s has no run", node.Name)
		}
		want = append(want, node.Run)
		sameAsTheStore(t, home, to, node.Run)
		if prefix := "copied  " + node.Run + " (node of " + id + "): "; !strings.HasPrefix(lines[i+1], prefix) {
			t.Fatalf("report line %q, want %q", lines[i+1], prefix)
		}
	}
	names := entries(t, to)
	if len(names) != len(want) {
		t.Fatalf("the folder holds %v, want %v", names, want)
	}
	for _, name := range want {
		if !strings.Contains(strings.Join(names, " "), name) {
			t.Fatalf("the folder holds %v, want %v", names, want)
		}
	}
}

// running records, in home's store, a run that is still running: its
// owner lock is held until the test ends. A workflow names its node runs.
func running(t *testing.T, home, id string) {
	t.Helper()
	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	handle, err := store.Create(context.Background(), domain.Record{Schema: "agister.run/v1alpha1", ID: id, Process: "p", CreatedAt: stillAt})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = handle.Finish(finished(id, nil)) })
}

// finished is a finished record of run id; one with nodes is a workflow's.
func finished(id string, nodes []string) domain.Record {
	at := stillAt.Add(time.Minute)
	record := domain.Record{Schema: "agister.run/v1alpha1", ID: id, Process: "p", CreatedAt: stillAt, FinishedAt: &at, Result: &domain.Result{Status: domain.Completed}}
	if nodes != nil {
		record.Workflow = &domain.Workflow{Barrier: domain.Barrier{State: domain.BarrierPassed}}
		for i, node := range nodes {
			record.Workflow.Nodes = append(record.Workflow.Nodes, domain.Node{Name: fmt.Sprintf("n%d", i), Process: "p", Run: node})
		}
	}
	return record
}

// record records a finished run in home's store.
func record(t *testing.T, home string, record domain.Record) {
	t.Helper()
	handle, err := fsruns.Store{Dir: filepath.Join(home, "runs")}.Create(context.Background(), record)
	if err != nil {
		t.Fatal(err)
	}
	if err := handle.Finish(record); err != nil {
		t.Fatal(err)
	}
}

// An export is refused, exit 3, before it writes anything: when a run it
// names does not exist, when one is still running, when a workflow's node
// run is, and when --to is missing, does not exist or is not a directory.
func TestRunsExportIsRefusedBeforeItWritesAnything(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	running(t, home, "live")
	running(t, home, "live-node")
	record(t, home, finished("flow", []string{id, "live-node"}))
	to := tempDir(t)
	file := filepath.Join(to, "file")
	write(t, file, "not a folder\n")

	for _, c := range []struct {
		args   []string
		reason string
	}{
		{[]string{id, "nope", "--to", to}, "run nope does not exist"},
		{[]string{id, "live", "--to", to}, "run live has not finished: it is still running"},
		{[]string{"flow", "--to", to}, "run live-node, node n1 of workflow run flow, has not finished: it is still running"},
		{[]string{id}, "--to is missing"},
		{[]string{id, "--to", filepath.Join(to, "absent")}, "absent: does not exist"},
		{[]string{id, "--to", file}, "file: is not a directory"},
	} {
		r := agister(t, home, repo, append([]string{"runs", "export"}, c.args...)...)
		if r.code != cli.ExitRefused || !strings.Contains(r.stderr, c.reason) || r.stdout != "" {
			t.Errorf("%v: %d, want %q\n%s%s", c.args, r.code, c.reason, r.stdout, r.stderr)
		}
		if names := entries(t, to); !reflect.DeepEqual(names, []string{"file"}) {
			t.Fatalf("%v: the folder holds %v", c.args, names)
		}
	}
	if r := agister(t, home, repo, "runs", "export", "--to", to); r.code != cli.ExitUsage || !strings.Contains(r.stderr, "runs export needs a run ID") {
		t.Fatalf("no run: %d\n%s", r.code, r.stderr)
	}
}

// Exporting a run again to the same folder keeps the identical copy as it
// is, the same files, and says so.
func TestRunsExportKeepsAnIdenticalCopy(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	to := tempDir(t)
	if r := agister(t, home, repo, "runs", "export", id, "--to", to); r.code != cli.ExitCompleted {
		t.Fatalf("first export: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	recordCopy := filepath.Join(to, id, "record.json")
	before, err := os.Stat(recordCopy)
	if err != nil {
		t.Fatal(err)
	}

	r := agister(t, home, repo, "runs", "export", id, "--to", to)
	copied := sameAsTheStore(t, home, to, id)
	want := fmt.Sprintf("kept    %s: the copy in %s is identical (%d files, %d bytes)\n", id, filepath.Join(to, id), len(copied), size(copied))
	if r.code != cli.ExitCompleted || r.stdout != want {
		t.Fatalf("again: %d %q, want %q\n%s", r.code, r.stdout, want, r.stderr)
	}
	if after, err := os.Stat(recordCopy); err != nil || !os.SameFile(before, after) {
		t.Fatalf("the copy's record was replaced: %v", err)
	}
	if names := entries(t, to); !reflect.DeepEqual(names, []string{id}) {
		t.Fatalf("the folder holds %v", names)
	}
}

// A copy that differs from the run is never overwritten: the export is
// refused for that run, exit 3, and says which file differs; another run
// it names is still copied. A change that keeps the file's length differs
// as one that does not.
func TestRunsExportRefusesACopyThatDiffers(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	record(t, home, finished("other", nil))
	for _, c := range []struct {
		name   string
		change func(string) string
	}{
		{"a line more", func(events string) string { return events + "{\"seq\":999}\n" }},
		{"the same length", func(events string) string {
			last := strings.LastIndex(events, "}\n")
			return events[:last] + "]\n"
		}},
	} {
		to := tempDir(t)
		if r := agister(t, home, repo, "runs", "export", id, "--to", to); r.code != cli.ExitCompleted {
			t.Fatalf("%s: first export: %d\n%s%s", c.name, r.code, r.stdout, r.stderr)
		}
		events := filepath.Join(to, id, "events.jsonl")
		stored := read(t, events)
		changed := c.change(stored)
		if changed == stored || c.name == "the same length" && len(changed) != len(stored) {
			t.Fatalf("%s: the change of %q is %q", c.name, stored, changed)
		}
		write(t, events, changed)

		r := agister(t, home, repo, "runs", "export", id, "other", "--to", to)
		if r.code != cli.ExitRefused {
			t.Fatalf("%s: export: %d\n%s%s", c.name, r.code, r.stdout, r.stderr)
		}
		refused := fmt.Sprintf("REFUSED %s: %s: the copy there differs, and is not overwritten: events.jsonl differs from the run's\n", id, filepath.Join(to, id))
		if !strings.HasPrefix(r.stdout, refused) || !strings.Contains(r.stdout, "copied  other: ") {
			t.Fatalf("%s: report:\n%s\nwant first %q", c.name, r.stdout, refused)
		}
		if read(t, events) != changed {
			t.Fatalf("%s: the differing copy was overwritten", c.name)
		}
		sameAsTheStore(t, home, to, "other")
	}
}

// An export into the run store is refused, exit 3, before it writes
// anything: into the directory of the run it copies, named as it is or
// through a link, and into the store's. The run is left as it was.
func TestRunsExportIsRefusedIntoTheRunStore(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	runs := filepath.Join(home, "runs")
	source := filepath.Join(runs, id)
	links := tempDir(t)
	alias := filepath.Join(links, "run")
	if err := os.Symlink(source, alias); err != nil {
		t.Fatal(err)
	}
	before := files(t, runs)

	for _, to := range []string{source, alias, runs} {
		r := agister(t, home, repo, "runs", "export", id, "--to", to)
		reason := fmt.Sprintf("--to %s: is in the run store %s: the copies go out of it", to, runs)
		if r.code != cli.ExitRefused || !strings.Contains(r.stderr, reason) || r.stdout != "" {
			t.Errorf("--to %s: %d, want %q\n%s%s", to, r.code, reason, r.stdout, r.stderr)
		}
		if after := files(t, runs); !reflect.DeepEqual(after, before) {
			t.Fatalf("--to %s: the store holds %v, it held %v", to, keys(after), keys(before))
		}
	}
}

// An artifact that does not read back with the digest the record names
// fails the export, exit 1, naming the file; no copy is put in place.
func TestRunsExportFailsOnAnArtifactsDigest(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	write(t, filepath.Join(home, "runs", id, "artifacts", "input-brief.txt"), "Other words.\n")
	to := tempDir(t)

	r := agister(t, home, repo, "runs", "export", id, "--to", to)
	if r.code != cli.ExitFailed {
		t.Fatalf("export: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	failed := "FAILED  " + id + ": artifact artifacts/input-brief.txt reads back as sha256:"
	if !strings.HasPrefix(r.stdout, failed) || !strings.HasSuffix(r.stdout, "; no copy was put in place\n") {
		t.Fatalf("report %q, want it to start %q", r.stdout, failed)
	}
	if names := entries(t, to); len(names) != 0 {
		t.Fatalf("the folder holds %v", names)
	}
}

// An export interrupted while it writes a copy leaves only its partial
// folder, which a later export does not take for a copy: it writes the
// whole run, beside it.
func TestRunsExportDoesNotTakeAPartialCopyForOne(t *testing.T) {
	t.Parallel()
	home, repo, id := exportedRun(t)
	to := tempDir(t)
	// As an export left it when it was killed after its first file.
	stage, err := fsexport.Folders{}.Stage(to, id)
	if err != nil {
		t.Fatal(err)
	}
	file, err := stage.Create("record.json")
	if err != nil {
		t.Fatal(err)
	}
	stored, err := os.Open(filepath.Join(home, "runs", id, "record.json"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.Copy(file, stored)
	stored.Close()
	if err != nil || file.Close() != nil {
		t.Fatal(err)
	}

	r := agister(t, home, repo, "runs", "export", id, "--to", to)
	if r.code != cli.ExitCompleted || !strings.HasPrefix(r.stdout, "copied  "+id+": ") {
		t.Fatalf("export: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	sameAsTheStore(t, home, to, id)
}
