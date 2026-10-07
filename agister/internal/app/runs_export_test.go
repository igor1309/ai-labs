package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// exportRunsFake is a run store of records and their files, in memory.
type exportRunsFake struct {
	records map[string]run.Record
	states  map[string]run.State
	files   map[string]map[string]string
}

func (f *exportRunsFake) add(record run.Record, state run.State, files map[string]string) {
	f.records[record.ID], f.states[record.ID], f.files[record.ID] = record, state, files
}

func (f *exportRunsFake) Get(_ context.Context, id string) (run.Record, run.State, error) {
	record, ok := f.records[id]
	if !ok {
		return run.Record{}, "", fmt.Errorf("run %s: %w", id, contract.ErrNotFound)
	}
	return record, f.states[id], nil
}

func (f *exportRunsFake) Files(_ context.Context, id string) ([]string, error) {
	return sortedKeys(f.files[id]), nil
}

func (f *exportRunsFake) Open(_ context.Context, id, path string) (io.ReadCloser, error) {
	data, ok := f.files[id][path]
	if !ok {
		return nil, fmt.Errorf("%s: %w", path, contract.ErrNotFound)
	}
	return io.NopCloser(strings.NewReader(data)), nil
}

// exportFoldersFake keeps copies in memory; the stage's Create of failing
// fails.
type exportFoldersFake struct {
	copies    map[string]map[string]string
	failing   string
	discarded []string
}

func (f *exportFoldersFake) Folder(string) error { return nil }

func (f *exportFoldersFake) Copy(_, id string) ([]string, bool, error) {
	files, ok := f.copies[id]
	return sortedKeys(files), ok, nil
}

func (f *exportFoldersFake) OpenCopy(_, id, path string) (io.ReadCloser, error) {
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
	f.stage.files[f.path] = f.data.String()
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
