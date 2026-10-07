package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"slices"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Exporter copies runs out of the run store to a folder the caller names,
// for audit (ADR-026 rule 7): each run's files byte for byte, nothing
// selected, rewritten or summarized. A workflow run brings its nodes' runs.
type Exporter struct {
	runs    ExportRuns
	folders ExportFolders
}

// ExportRuns reads the runs an export copies, as the run store keeps them.
type ExportRuns interface {
	// Hold takes a stable read of run id: until it is released, no process
	// writes the run, neither its owner nor one recovering what it left. A
	// run a process owns is not held: the error is a *RunOwnedError. A run
	// that does not exist is contract.ErrNotFound.
	Hold(ctx context.Context, id string) (ExportRead, error)
}

// ExportRead is a stable read of one run, held until it is released.
type ExportRead interface {
	// Record is the run's record as it stands while the read is held.
	Record() run.Record
	// State is the run's state as the store tells it while the read is
	// held: finished, or abandoned.
	State() run.State
	// Files lists the files of the run's directory by slash-separated path
	// relative to it, sorted: its record, events, provider log and
	// artifacts. The store's own state, its owner lock, is not evidence and
	// is not listed.
	Files() ([]string, error)
	// Open opens one of the files Files lists.
	Open(path string) (io.ReadCloser, error)
	// Release ends the read: the run may be written again.
	Release()
}

// RunOwnedError is what ExportRuns.Hold returns for a run a process owns,
// and so may write: its owner while it runs, or one recovering what it
// left. Finished says the record read as finished.
type RunOwnedError struct {
	ID       string
	Finished bool
}

func (e *RunOwnedError) Error() string {
	if e.Finished {
		return fmt.Sprintf("run %s is finished, and a process is recovering what it left", e.ID)
	}
	return fmt.Sprintf("run %s is still running", e.ID)
}

// ExportFolders keeps the copies in the folder the caller names.
type ExportFolders interface {
	// Folder says why dir cannot take copies: it does not exist or is not a
	// directory; nil when it can.
	Folder(dir string) error
	// Copy lists the files of the copy of run id in dir, as Files lists a
	// run's; ok is false when dir has none.
	Copy(dir, id string) (files []string, ok bool, err error)
	// OpenCopy opens one of the files Copy lists.
	OpenCopy(dir, id, path string) (io.ReadCloser, error)
	// Stage starts a new copy of run id in dir, which nothing takes for a
	// copy of the run until it is committed.
	Stage(dir, id string) (ExportStage, error)
}

// ExportStage is a copy being written.
type ExportStage interface {
	// Create creates the file at the slash-separated path in the copy.
	Create(path string) (io.WriteCloser, error)
	// Open opens a file of the copy as written.
	Open(path string) (io.ReadCloser, error)
	// Commit puts the copy in place, as the copy of the run in its folder;
	// it fails if one is there by then.
	Commit() error
	// Discard removes a copy not committed; after Commit it does nothing.
	Discard() error
}

// ExportAdapters are what an Exporter runs on.
type ExportAdapters struct {
	Runs    ExportRuns
	Folders ExportFolders
}

// NewExporter returns the use case that exports runs from runs to folders.
func NewExporter(runs ExportRuns, folders ExportFolders) *Exporter {
	return &Exporter{runs: runs, folders: folders}
}

// exported is one run an export copies: the read held of it, and the
// workflow run it comes with as a node; empty for a run the request named.
type exported struct {
	id       string
	workflow string
	read     ExportRead
}

// Export copies each run the request names, and each node's run of a
// workflow it names, to <To>/<run-id>. It is refused before it writes
// anything when To is missing or cannot take copies, or a run does not
// exist or a process owns it. Each run is held from its planning until it
// is copied, so no process writes it meanwhile. Each run is then copied,
// kept or refused on its own: a copy that is there already is kept when it
// is identical to the run, and refused, never overwritten, when it
// differs. A new copy is staged, its artifacts read back and checked
// against the digests the record names, and only then put in place. On
// cancellation, the result holds the runs exported before it, with the
// context's error.
func (e *Exporter) Export(ctx context.Context, request contract.ExportRequest) (contract.ExportResult, error) {
	if len(request.Runs) == 0 {
		return contract.ExportResult{}, &contract.InputError{Message: "an export needs a run ID"}
	}
	if request.To == "" {
		return contract.ExportResult{}, &contract.RefusedError{Message: "--to is missing: name the directory the copies go to"}
	}
	if err := e.folders.Folder(request.To); err != nil {
		return contract.ExportResult{}, &contract.RefusedError{Message: fmt.Sprintf("--to %s: %v", request.To, err)}
	}
	runs, err := e.plan(ctx, request.Runs)
	if err != nil {
		return contract.ExportResult{}, err
	}
	// Each read is released once its run is exported; on an early return,
	// the reads of the runs not reached are.
	next := 0
	defer func() {
		for _, one := range runs[next:] {
			one.read.Release()
		}
	}()
	result := contract.ExportResult{To: request.To}
	for next < len(runs) {
		one := runs[next]
		next++
		done, err := e.export(ctx, request.To, one)
		one.read.Release()
		if err != nil {
			return result, err
		}
		result.Runs = append(result.Runs, done)
	}
	return result, nil
}

// plan holds each run to export, each named run followed by its nodes'
// runs, each once. It refuses a run that does not exist or that a process
// owns: one being written cannot be copied as it ends. An abandoned run is
// no longer written, and is copied as it was left. On an error, it
// releases every read it took.
func (e *Exporter) plan(ctx context.Context, ids []string) (runs []exported, err error) {
	defer func() {
		if err != nil {
			for _, one := range runs {
				one.read.Release()
			}
			runs = nil
		}
	}()
	seen := map[string]bool{}
	var add func(id, workflow, node string) error
	add = func(id, workflow, node string) error {
		if seen[id] {
			return nil
		}
		seen[id] = true
		named := "run " + id
		if workflow != "" {
			named = fmt.Sprintf("run %s, node %s of workflow run %s,", id, node, workflow)
		}
		read, err := e.hold(ctx, id, named)
		if err != nil {
			return err
		}
		runs = append(runs, exported{id: id, workflow: workflow, read: read})
		record := read.Record()
		if record.Workflow == nil {
			return nil
		}
		for _, n := range record.Workflow.Nodes {
			if n.Run == "" {
				continue // the node never started
			}
			if err := add(n.Run, id, n.Name); err != nil {
				return err
			}
		}
		return nil
	}
	for _, id := range ids {
		if err := add(id, "", ""); err != nil {
			return runs, err
		}
	}
	return runs, nil
}

// hold takes the read of run id, named as the refusals name it. A state
// told finished beside a record that is not was told after the record was
// read, the run finishing between the two: the record is read again, so
// the nodes and artifacts planned are the finished record's.
func (e *Exporter) hold(ctx context.Context, id, named string) (ExportRead, error) {
	for range 2 {
		read, err := e.runs.Hold(ctx, id)
		var inputErr *contract.InputError
		var owned *RunOwnedError
		switch {
		case errors.Is(err, contract.ErrNotFound):
			return nil, &contract.RefusedError{Message: fmt.Sprintf("%s does not exist", named)}
		case errors.As(err, &inputErr):
			return nil, &contract.RefusedError{Message: inputErr.Message}
		case errors.As(err, &owned) && owned.Finished:
			return nil, &contract.RefusedError{Message: fmt.Sprintf("%s is finished, and a process is recovering what it left: export it once that is done", named)}
		case errors.As(err, &owned):
			return nil, &contract.RefusedError{Message: fmt.Sprintf("%s has not finished: it is still running", named)}
		case err != nil:
			return nil, err
		}
		if read.State() != run.StateFinished || read.Record().FinishedAt != nil {
			return read, nil
		}
		read.Release()
	}
	return nil, fmt.Errorf("%s reads finished, and its record does not", named)
}

// export copies one run to dir, or keeps the identical copy there, or
// refuses the one that differs, all from the read held of it. A file that
// cannot be read or written, or an artifact that does not read back as
// recorded, fails the run; the error returned is only the context's.
func (e *Exporter) export(ctx context.Context, dir string, one exported) (contract.ExportedRun, error) {
	done := contract.ExportedRun{ID: one.id, Workflow: one.workflow, Dir: filepath.Join(dir, one.id)}
	if err := ctx.Err(); err != nil {
		return done, err
	}
	failed := func(format string, args ...any) (contract.ExportedRun, error) {
		if err := ctx.Err(); err != nil {
			return done, err
		}
		done.Action, done.Problem = contract.ExportFailed, fmt.Sprintf(format, args...)
		return done, nil
	}
	record := one.read.Record()
	files, err := one.read.Files()
	if err != nil {
		return failed("listing the run: %v", err)
	}
	present, ok, err := e.folders.Copy(dir, one.id)
	if err != nil {
		done.Action, done.Problem = contract.ExportRefused, fmt.Sprintf("the copy there cannot be compared, and is not overwritten: %v", err)
		return done, nil
	}
	if ok {
		differs, size, err := e.compare(dir, one, files, present)
		if err != nil {
			return failed("comparing the copy there: %v", err)
		}
		if differs != "" {
			done.Action, done.Problem = contract.ExportRefused, "the copy there differs, and is not overwritten: "+differs
			return done, nil
		}
		if problem := checkArtifacts(record, func(path string) (io.ReadCloser, error) { return e.folders.OpenCopy(dir, one.id, path) }); problem != "" {
			return failed("the copy there: %s", problem)
		}
		done.Action, done.Files, done.Bytes = contract.ExportKept, len(present), size
		return done, nil
	}
	stage, err := e.folders.Stage(dir, one.id)
	if err != nil {
		return failed("staging the copy: %v", err)
	}
	defer stage.Discard()
	var size int64
	for _, path := range files {
		if err := ctx.Err(); err != nil {
			return done, err
		}
		n, err := copyFile(one.read, path, stage)
		if err != nil {
			return failed("copying %s: %v", path, err)
		}
		size += n
	}
	if problem := checkArtifacts(record, stage.Open); problem != "" {
		return failed("%s; no copy was put in place", problem)
	}
	if err := stage.Commit(); err != nil {
		return failed("putting the copy in place: %v", err)
	}
	done.Action, done.Files, done.Bytes = contract.ExportCopied, len(files), size
	return done, nil
}

// copyFile copies the run's file at path into the stage and returns its
// size.
func copyFile(read ExportRead, path string, stage ExportStage) (int64, error) {
	source, err := read.Open(path)
	if err != nil {
		return 0, err
	}
	defer source.Close()
	target, err := stage.Create(path)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(target, source)
	if closeErr := target.Close(); err == nil {
		err = closeErr
	}
	return n, err
}

// compare says which file first differs between the run and its copy in
// dir, empty when none does, and the copy's size when none does.
func (e *Exporter) compare(dir string, one exported, files, present []string) (differs string, size int64, err error) {
	for _, path := range present {
		if !slices.Contains(files, path) {
			return path + " is in the copy, not in the run", 0, nil
		}
	}
	for _, path := range files {
		if !slices.Contains(present, path) {
			return path + " is not in the copy", 0, nil
		}
		same, n, err := e.sameFile(dir, one, path)
		if err != nil {
			return "", 0, fmt.Errorf("%s: %w", path, err)
		}
		if !same {
			return path + " differs from the run's", 0, nil
		}
		size += n
	}
	return "", size, nil
}

// sameFile says whether the run's file at path and the copy's hold the
// same bytes, and how many when they do.
func (e *Exporter) sameFile(dir string, one exported, path string) (bool, int64, error) {
	source, err := one.read.Open(path)
	if err != nil {
		return false, 0, err
	}
	defer source.Close()
	copied, err := e.folders.OpenCopy(dir, one.id, path)
	if err != nil {
		return false, 0, err
	}
	defer copied.Close()
	return sameBytes(source, copied)
}

// sameBytes says whether a and b read the same bytes, and how many when
// they do.
func sameBytes(a, b io.Reader) (bool, int64, error) {
	bufA, bufB := make([]byte, 32*1024), make([]byte, 32*1024)
	var size int64
	for {
		n, errA := io.ReadFull(a, bufA)
		m, errB := io.ReadFull(b, bufB)
		if errA != nil && errA != io.EOF && errA != io.ErrUnexpectedEOF {
			return false, 0, errA
		}
		if errB != nil && errB != io.EOF && errB != io.ErrUnexpectedEOF {
			return false, 0, errB
		}
		if n != m || !bytes.Equal(bufA[:n], bufB[:m]) {
			return false, 0, nil
		}
		size += int64(n)
		if errA != nil || errB != nil {
			return errA != nil && errB != nil, size, nil
		}
	}
}

// checkArtifacts reads back each artifact the record names through open
// and compares its digest with the recorded one; it says which first does
// not match, or cannot be read, and empty when all match.
func checkArtifacts(record run.Record, open func(path string) (io.ReadCloser, error)) string {
	for _, artifact := range recordedArtifacts(record) {
		file, err := open(artifact.Path)
		if err != nil {
			return fmt.Sprintf("artifact %s cannot be read back: %v", artifact.Path, err)
		}
		hash := sha256.New()
		_, err = io.Copy(hash, file)
		file.Close()
		if err != nil {
			return fmt.Sprintf("artifact %s cannot be read back: %v", artifact.Path, err)
		}
		if got := "sha256:" + hex.EncodeToString(hash.Sum(nil)); got != artifact.Digest {
			return fmt.Sprintf("artifact %s reads back as %s, the record says %s", artifact.Path, got, artifact.Digest)
		}
	}
	return ""
}

// recordedArtifacts are the artifacts a record names as its own, each
// once: the result's, the inputs', the verification attempts' and the
// setup's and precheck's changes, and a workflow's collection. The
// artifact of a goal link is another run's, which that run's export
// checks.
func recordedArtifacts(record run.Record) []run.Artifact {
	var list []run.Artifact
	add := func(artifact *run.Artifact) {
		if artifact != nil && !slices.Contains(list, *artifact) {
			list = append(list, *artifact)
		}
	}
	if record.Result != nil {
		for i := range record.Result.Artifacts {
			add(&record.Result.Artifacts[i])
		}
	}
	for _, input := range record.Inputs {
		add(input.Artifact)
	}
	for _, attempt := range record.Attempts {
		add(attempt.Changes)
		if attempt.Run != nil {
			add(attempt.Run.AfterChanges)
		}
	}
	for _, ran := range []*run.CommandRun{record.SetupRun, record.PrecheckRun} {
		if ran != nil {
			add(ran.AfterChanges)
		}
	}
	if record.Workflow != nil {
		add(record.Workflow.Collection)
	}
	return list
}
