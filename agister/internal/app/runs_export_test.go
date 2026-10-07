package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"maps"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// exportRunsFake is a run store of records and their files, in memory. A
// run running is owned, and is not held.
type exportRunsFake struct {
	records map[string]run.Record
	states  map[string]run.State
	files   map[string]map[string]string
	// stale is, by run, the record its next Hold reads in place of the
	// run's own, told with the run's state: the run finished between the
	// two.
	stale map[string]run.Record
	// held and released count the reads taken and let go.
	held, released int
}

func (f *exportRunsFake) add(record run.Record, state run.State, files map[string]string) {
	f.records[record.ID], f.states[record.ID], f.files[record.ID] = record, state, files
}

func (f *exportRunsFake) Hold(_ context.Context, id string) (app.ExportRead, error) {
	record, ok := f.records[id]
	if !ok {
		return nil, fmt.Errorf("run %s: %w", id, contract.ErrNotFound)
	}
	if f.states[id] == run.StateRunning {
		return nil, &app.RunOwnedError{ID: id}
	}
	if stale, ok := f.stale[id]; ok {
		delete(f.stale, id)
		record = stale
	}
	f.held++
	return &exportReadFake{runs: f, record: record, state: f.states[id], files: f.files[id]}, nil
}

// exportReadFake is a read of one run of exportRunsFake.
type exportReadFake struct {
	runs     *exportRunsFake
	record   run.Record
	state    run.State
	files    map[string]string
	released bool
}

func (r *exportReadFake) Record() run.Record { return r.record }

func (r *exportReadFake) State() run.State { return r.state }

func (r *exportReadFake) Files() ([]string, error) { return sortedKeys(r.files), nil }

func (r *exportReadFake) Open(path string) (io.ReadCloser, error) { return open(r.files, path) }

func (r *exportReadFake) Release() {
	if !r.released {
		r.released = true
		r.runs.released++
	}
}

// allReleased fails the test unless every read the export took was let go.
func (f *exportRunsFake) allReleased(t *testing.T) {
	t.Helper()
	if f.held != f.released {
		t.Fatalf("%d reads held, %d released", f.held, f.released)
	}
}

// exportFoldersFake keeps copies in memory. The stage's Create of failing
// fails; its Close of closeFailing fails once the file is written, as a
// sync can; and it keeps the bytes of corrupt otherwise than written.
// written, when set, is told each file a stage has written, and opened
// each file of a copy there that is opened.
type exportFoldersFake struct {
	copies          map[string]map[string]string
	failing         string
	closeFailing    string
	corrupt         string
	discarded       []string
	written, opened func(id, path string)
}

func (f *exportFoldersFake) Folder(string) error { return nil }

func (f *exportFoldersFake) Copy(_, id string) ([]string, bool, error) {
	files, ok := f.copies[id]
	return sortedKeys(files), ok, nil
}

func (f *exportFoldersFake) OpenCopy(_, id, path string) (io.ReadCloser, error) {
	if f.opened != nil {
		f.opened(id, path)
	}
	return open(f.copies[id], path)
}

func (f *exportFoldersFake) Stage(_, id string) (app.ExportStage, error) {
	return &exportStageFake{folders: f, id: id, files: map[string]string{}}, nil
}

type exportStageFake struct {
	folders   *exportFoldersFake
	id        string
	files     map[string]string
	committed bool
}

func (s *exportStageFake) Create(path string) (io.WriteCloser, error) {
	if path == s.folders.failing {
		return nil, errors.New("no space left")
	}
	return &stagedFile{stage: s, path: path}, nil
}

func (s *exportStageFake) Open(path string) (io.ReadCloser, error) { return open(s.files, path) }

func (s *exportStageFake) Commit() error {
	s.folders.copies[s.id], s.committed = s.files, true
	return nil
}

func (s *exportStageFake) Discard() error {
	if !s.committed {
		s.folders.discarded = append(s.folders.discarded, s.id)
	}
	return nil
}

type stagedFile struct {
	stage *exportStageFake
	path  string
	data  strings.Builder
}

func (f *stagedFile) Write(p []byte) (int, error) { return f.data.Write(p) }
func (f *stagedFile) Close() error {
	data := f.data.String()
	if f.path == f.stage.folders.corrupt {
		data = "corrupted " + data
	}
	f.stage.files[f.path] = data
	if f.stage.folders.written != nil {
		f.stage.folders.written(f.stage.id, f.path)
	}
	if f.path == f.stage.folders.closeFailing {
		return errors.New("sync failed")
	}
	return nil
}

func open(files map[string]string, path string) (io.ReadCloser, error) {
	data, ok := files[path]
	if !ok {
		return nil, fmt.Errorf("%s: %w", path, contract.ErrNotFound)
	}
	return io.NopCloser(strings.NewReader(data)), nil
}

func sortedKeys(m map[string]string) []string {
	var list []string
	for key := range m {
		list = append(list, key)
	}
	slices.Sort(list)
	return list
}

func newExport() (*exportRunsFake, *exportFoldersFake, *app.Exporter) {
	runs := &exportRunsFake{records: map[string]run.Record{}, states: map[string]run.State{}, files: map[string]map[string]string{}}
	folders := &exportFoldersFake{copies: map[string]map[string]string{}}
	return runs, folders, app.NewExporter(runs, folders)
}

// artifactOf is the artifact the record names for name, with data's
// digest.
func artifactOf(name, data string) *run.Artifact {
	sum := sha256.Sum256([]byte(data))
	return &run.Artifact{Name: name, Path: "artifacts/" + name, Digest: "sha256:" + hex.EncodeToString(sum[:]), Bytes: int64(len(data))}
}

// finishedRecord is a finished record of run id.
func finishedRecord(id string) run.Record {
	at := time.Date(2026, 10, 7, 12, 0, 0, 0, time.UTC)
	return run.Record{ID: id, Process: "p", CreatedAt: at, FinishedAt: &at, Result: &run.Result{Status: run.Completed}}
}

// A file that cannot be written fails its run: its stage is discarded and
// no copy is put in place, and the next run is still copied.
func TestExportFailsARunWhoseFileCannotBeWritten(t *testing.T) {
	t.Parallel()
	runs, folders, exporter := newExport()
	runs.add(finishedRecord("r1"), run.StateFinished, map[string]string{"record.json": "{}", "events.jsonl": "{}\n"})
	runs.add(finishedRecord("r2"), run.StateFinished, map[string]string{"record.json": "{}"})
	folders.failing = "events.jsonl"

	result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1", "r2"}, To: "/audit"})
	if err != nil || len(result.Runs) != 2 {
		t.Fatalf("export: %+v, %v", result, err)
	}
	if first := result.Runs[0]; first.Action != contract.ExportFailed || first.Problem != "copying events.jsonl: no space left" {
		t.Fatalf("r1: %+v", first)
	}
	if second := result.Runs[1]; second.Action != contract.ExportCopied || second.Files != 1 || second.Bytes != 2 || second.Dir != "/audit/r2" {
		t.Fatalf("r2: %+v", second)
	}
	if _, ok := folders.copies["r1"]; ok || !slices.Equal(folders.discarded, []string{"r1"}) {
		t.Fatalf("copies %v, discarded %v", folders.copies, folders.discarded)
	}
	runs.allReleased(t)
}

// A file whose close fails once it is written, as a sync to the disk can,
// fails its run: its stage is discarded, no copy is put in place, and the
// next run is still copied.
func TestExportFailsARunWhoseFileCannotBeSynced(t *testing.T) {
	t.Parallel()
	runs, folders, exporter := newExport()
	runs.add(finishedRecord("r1"), run.StateFinished, map[string]string{"record.json": "{}", "events.jsonl": "{}\n"})
	runs.add(finishedRecord("r2"), run.StateFinished, map[string]string{"record.json": "{}"})
	folders.closeFailing = "events.jsonl"

	result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1", "r2"}, To: "/audit"})
	if err != nil || len(result.Runs) != 2 {
		t.Fatalf("export: %+v, %v", result, err)
	}
	if first := result.Runs[0]; first.Action != contract.ExportFailed || first.Problem != "copying events.jsonl: sync failed" {
		t.Fatalf("r1: %+v", first)
	}
	if second := result.Runs[1]; second.Action != contract.ExportCopied || second.Files != 1 {
		t.Fatalf("r2: %+v", second)
	}
	if _, ok := folders.copies["r1"]; ok || !slices.Equal(folders.discarded, []string{"r1"}) {
		t.Fatalf("copies %v, discarded %v", folders.copies, folders.discarded)
	}
	runs.allReleased(t)
}

// The artifacts are checked as the copy reads them back, not as the run
// holds them: a copy written otherwise than the run, whose own bytes match
// the record, fails the export, naming the artifact, and is not put in
// place.
func TestExportChecksTheArtifactsAsTheCopyReadsBack(t *testing.T) {
	t.Parallel()
	runs, folders, exporter := newExport()
	record := finishedRecord("r1")
	artifact := artifactOf("out.txt", "bytes\n")
	record.Result.Artifacts = []run.Artifact{*artifact}
	runs.add(record, run.StateFinished, map[string]string{"record.json": "{}", "artifacts/out.txt": "bytes\n"})
	folders.corrupt = "artifacts/out.txt"

	result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"})
	if err != nil {
		t.Fatal(err)
	}
	corrupted := artifactOf("out.txt", "corrupted bytes\n").Digest
	want := "artifact artifacts/out.txt reads back as " + corrupted + ", the record says " + artifact.Digest + "; no copy was put in place"
	if done := result.Runs[0]; done.Action != contract.ExportFailed || done.Problem != want {
		t.Fatalf("export: %+v, want %q", done, want)
	}
	if _, ok := folders.copies["r1"]; ok || !slices.Equal(folders.discarded, []string{"r1"}) {
		t.Fatalf("copies %v, discarded %v", folders.copies, folders.discarded)
	}
	runs.allReleased(t)
}

// A copy there with a file the run does not have, or without one it has,
// differs: the export is refused for that run, names the file, and leaves
// the copy as it is.
func TestExportRefusesACopyWithAFileMoreOrLess(t *testing.T) {
	t.Parallel()
	stored := map[string]string{"record.json": "{}", "events.jsonl": "{}\n", "provider.jsonl": "raw\n"}
	for _, c := range []struct {
		name, problem string
		copy          map[string]string
	}{
		{"extra", "extra.txt is in the copy, not in the run", map[string]string{"record.json": "{}", "events.jsonl": "{}\n", "provider.jsonl": "raw\n", "extra.txt": "more\n"}},
		{"missing", "provider.jsonl is not in the copy", map[string]string{"record.json": "{}", "events.jsonl": "{}\n"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			runs, folders, exporter := newExport()
			runs.add(finishedRecord("r1"), run.StateFinished, stored)
			there := maps.Clone(c.copy)
			folders.copies["r1"] = there

			result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"})
			if err != nil {
				t.Fatal(err)
			}
			want := "the copy there differs, and is not overwritten: " + c.problem
			if done := result.Runs[0]; done.Action != contract.ExportRefused || done.Problem != want {
				t.Fatalf("export: %+v, want %q", done, want)
			}
			if !maps.Equal(folders.copies["r1"], c.copy) || len(folders.discarded) != 0 {
				t.Fatalf("the copy there is now %v; discarded %v", folders.copies["r1"], folders.discarded)
			}
			runs.allReleased(t)
		})
	}
}

// A workflow's record read before it finished, told with the state it has
// once finished, is read again: the export plans from the finished record,
// so it brings the node's run that record names and checks the artifact
// it names.
func TestExportPlansAWorkflowFromItsFinishedRecord(t *testing.T) {
	t.Parallel()
	collection := artifactOf("collection.json", "[]\n")
	final := finishedRecord("flow")
	final.Workflow = &run.Workflow{Nodes: []run.Node{{Name: "a", Run: "a1"}, {Name: "join", Run: "j1"}}, Collection: collection}
	before := finishedRecord("flow")
	before.FinishedAt, before.Result = nil, nil
	before.Workflow = &run.Workflow{Nodes: []run.Node{{Name: "a", Run: "a1"}, {Name: "join"}}}

	for _, c := range []struct {
		name, stored string
		want         []contract.ExportedRun
	}{
		{"as recorded", "[]\n", []contract.ExportedRun{
			{ID: "flow", Action: contract.ExportCopied},
			{ID: "a1", Workflow: "flow", Action: contract.ExportCopied},
			{ID: "j1", Workflow: "flow", Action: contract.ExportCopied},
		}},
		{"collection changed", "[1]\n", []contract.ExportedRun{
			{ID: "flow", Action: contract.ExportFailed},
			{ID: "a1", Workflow: "flow", Action: contract.ExportCopied},
			{ID: "j1", Workflow: "flow", Action: contract.ExportCopied},
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			runs, folders, exporter := newExport()
			runs.add(final, run.StateFinished, map[string]string{"record.json": "{}", "artifacts/collection.json": c.stored})
			runs.add(finishedRecord("a1"), run.StateFinished, map[string]string{"record.json": "{}"})
			runs.add(finishedRecord("j1"), run.StateFinished, map[string]string{"record.json": "{}"})
			runs.stale = map[string]run.Record{"flow": before}

			result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"flow"}, To: "/audit"})
			if err != nil || len(result.Runs) != len(c.want) {
				t.Fatalf("export: %+v, %v", result, err)
			}
			for i, want := range c.want {
				if got := result.Runs[i]; got.ID != want.ID || got.Workflow != want.Workflow || got.Action != want.Action {
					t.Errorf("run %d: %+v, want %+v", i, got, want)
				}
			}
			if c.want[0].Action == contract.ExportFailed {
				if !strings.HasPrefix(result.Runs[0].Problem, "artifact artifacts/collection.json reads back as ") {
					t.Errorf("flow: %q", result.Runs[0].Problem)
				}
				if _, ok := folders.copies["flow"]; ok {
					t.Error("a copy of flow was put in place")
				}
			}
			runs.allReleased(t)
		})
	}
}

// Every read an export takes is let go on every path: when a run is
// refused after others were taken, and when the export is cancelled before
// it copies them. A cancelled export reports no run it did not reach.
func TestExportReleasesEveryReadItTakes(t *testing.T) {
	t.Parallel()
	flow := finishedRecord("flow")
	flow.Workflow = &run.Workflow{Nodes: []run.Node{{Name: "a", Run: "a1"}, {Name: "b", Run: "live"}}}

	runs, folders, exporter := newExport()
	runs.add(flow, run.StateFinished, map[string]string{"record.json": "{}"})
	runs.add(finishedRecord("a1"), run.StateFinished, map[string]string{"record.json": "{}"})
	runs.add(finishedRecord("live"), run.StateRunning, map[string]string{"record.json": "{}"})
	var refused *contract.RefusedError
	_, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"flow"}, To: "/audit"})
	if !errors.As(err, &refused) || refused.Message != "run live, node b of workflow run flow, has not finished: it is still running" {
		t.Fatalf("refused: %v", err)
	}
	if runs.held != 2 {
		t.Fatalf("%d reads taken before the refusal, want 2", runs.held)
	}
	runs.allReleased(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result, err := exporter.Export(ctx, contract.ExportRequest{Runs: []string{"a1"}, To: "/audit"})
	if !errors.Is(err, context.Canceled) || len(result.Runs) != 0 || len(folders.copies) != 0 {
		t.Fatalf("cancelled: %+v, %v, copies %v", result, err, folders.copies)
	}
	runs.allReleased(t)
}

// Every artifact the record names as its own is read back from the copy
// and checked against its digest: the result's, the inputs', the
// verification attempts' changes and their runs', the setup's and the
// precheck's, and a workflow's collection. A goal link's artifact is
// another run's, and is not looked for in this one.
func TestExportChecksEveryArtifactTheRecordNames(t *testing.T) {
	t.Parallel()
	names := []string{"result.txt", "input-brief.txt", "attempt-1.patch", "attempt-1-run.patch", "setup.patch", "precheck.patch", "collection.json"}
	record := finishedRecord("r1")
	artifact := map[string]*run.Artifact{}
	for _, name := range names {
		artifact[name] = artifactOf(name, "bytes of "+name)
	}
	record.Result.Artifacts = []run.Artifact{*artifact["result.txt"]}
	record.Inputs = []run.Input{{Name: "brief", Artifact: artifact["input-brief.txt"]}}
	record.Attempts = []run.Attempt{{Number: 1, Changes: artifact["attempt-1.patch"], Run: &run.CommandRun{AfterChanges: artifact["attempt-1-run.patch"]}}}
	record.SetupRun = &run.CommandRun{AfterChanges: artifact["setup.patch"]}
	record.PrecheckRun = &run.CommandRun{AfterChanges: artifact["precheck.patch"]}
	record.Workflow = &run.Workflow{Collection: artifact["collection.json"]}
	record.Links = &run.Links{Goal: &run.GoalLink{Run: "r0", Input: "goal", Artifact: artifactOf("input-goal.txt", "the goal")}}
	stored := func(changed string) map[string]string {
		files := map[string]string{"record.json": "{}"}
		for _, name := range names {
			files["artifacts/"+name] = "bytes of " + name
		}
		if changed != "" {
			files["artifacts/"+changed] = "other bytes"
		}
		return files
	}

	runs, _, exporter := newExport()
	runs.add(record, run.StateFinished, stored(""))
	result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"})
	if err != nil || result.Runs[0].Action != contract.ExportCopied {
		t.Fatalf("every artifact as recorded: %+v, %v", result, err)
	}
	for _, name := range names {
		runs, folders, exporter := newExport()
		runs.add(record, run.StateFinished, stored(name))
		result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"})
		if err != nil {
			t.Fatal(err)
		}
		done := result.Runs[0]
		if want := "artifact artifacts/" + name + " reads back as "; done.Action != contract.ExportFailed || !strings.HasPrefix(done.Problem, want) || !strings.HasSuffix(done.Problem, ", the record says "+artifact[name].Digest+"; no copy was put in place") {
			t.Errorf("%s changed: %+v", name, done)
		}
		if _, ok := folders.copies["r1"]; ok {
			t.Errorf("%s changed: a copy was put in place", name)
		}
		runs.allReleased(t)
	}
}

// An abandoned run is no longer written: it is copied as it was left. Only
// a run still running is refused.
func TestExportCopiesAnAbandonedRun(t *testing.T) {
	t.Parallel()
	runs, _, exporter := newExport()
	abandoned := finishedRecord("r1")
	abandoned.FinishedAt, abandoned.Result = nil, nil
	runs.add(abandoned, run.StateAbandoned, map[string]string{"record.json": "{}"})
	result, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"})
	if err != nil || result.Runs[0].Action != contract.ExportCopied {
		t.Fatalf("abandoned: %+v, %v", result, err)
	}
	runs.add(abandoned, run.StateRunning, map[string]string{"record.json": "{}"})
	var refused *contract.RefusedError
	if _, err := exporter.Export(context.Background(), contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"}); !errors.As(err, &refused) {
		t.Fatalf("running: %v", err)
	}
}

// An export cancelled while it copies or compares its last run reports
// the context's error with the runs it finished: the last one's copy is
// not put in place, nor the copy there reported kept.
func TestExportCancelledDuringItsLastRunReportsIt(t *testing.T) {
	t.Parallel()
	stored := map[string]string{"events.jsonl": "{}\n", "record.json": "{}"}
	for _, c := range []struct {
		name  string
		there bool
	}{
		{"copying", false},
		{"comparing", true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			runs, folders, exporter := newExport()
			runs.add(finishedRecord("r1"), run.StateFinished, stored)
			runs.add(finishedRecord("r2"), run.StateFinished, stored)
			if c.there {
				folders.copies["r2"] = maps.Clone(stored)
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			// The run's last file, written or read from the copy there.
			last := func(id, path string) {
				if id == "r2" && path == "record.json" {
					cancel()
				}
			}
			folders.written, folders.opened = last, last

			result, err := exporter.Export(ctx, contract.ExportRequest{Runs: []string{"r1", "r2"}, To: "/audit"})
			if !errors.Is(err, context.Canceled) {
				t.Fatalf("export: %+v, %v", result, err)
			}
			if len(result.Runs) != 1 || result.Runs[0].ID != "r1" || result.Runs[0].Action != contract.ExportCopied {
				t.Fatalf("the runs reported: %+v", result.Runs)
			}
			if c.there {
				if !maps.Equal(folders.copies["r2"], stored) || len(folders.discarded) != 0 {
					t.Fatalf("the copy there is now %v; discarded %v", folders.copies["r2"], folders.discarded)
				}
			} else if _, ok := folders.copies["r2"]; ok || !slices.Equal(folders.discarded, []string{"r2"}) {
				t.Fatalf("copies %v, discarded %v", folders.copies, folders.discarded)
			}
			runs.allReleased(t)
		})
	}
}

// commitHook is the folders of an export whose stages call committed once
// each commit has put its copy in place.
type commitHook struct {
	*exportFoldersFake
	committed func(id string)
}

func (f commitHook) Stage(dir, id string) (app.ExportStage, error) {
	stage, err := f.exportFoldersFake.Stage(dir, id)
	if err != nil {
		return nil, err
	}
	return hookedStage{ExportStage: stage, committed: func() { f.committed(id) }}, nil
}

type hookedStage struct {
	app.ExportStage
	committed func()
}

func (s hookedStage) Commit() error {
	err := s.ExportStage.Commit()
	s.committed()
	return err
}

// An export cancelled once the first run's copy is put in place reports
// that run as copied, with the context's error, and copies none of the
// others.
func TestExportCancelledKeepsTheRunsItCopied(t *testing.T) {
	t.Parallel()
	runs, folders, _ := newExport()
	for _, id := range []string{"r1", "r2", "r3"} {
		runs.add(finishedRecord(id), run.StateFinished, map[string]string{"events.jsonl": "{}\n", "record.json": "{}"})
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	exporter := app.NewExporter(runs, commitHook{exportFoldersFake: folders, committed: func(id string) {
		if id == "r1" {
			cancel()
		}
	}})

	result, err := exporter.Export(ctx, contract.ExportRequest{Runs: []string{"r1", "r2", "r3"}, To: "/audit"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("export: %+v, %v", result, err)
	}
	want := []contract.ExportedRun{{ID: "r1", Dir: "/audit/r1", Action: contract.ExportCopied, Files: 2, Bytes: 5}}
	if !slices.Equal(result.Runs, want) {
		t.Fatalf("the runs reported: %+v, want %+v", result.Runs, want)
	}
	if copied := slices.Sorted(maps.Keys(folders.copies)); !slices.Equal(copied, []string{"r1"}) {
		t.Fatalf("copies of %v", copied)
	}
	runs.allReleased(t)
}
