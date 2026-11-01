package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/igor1309/ai-labs/agister/core/inputs"
)

// fileTexts is what the source "file" asks of files.
type fileTexts interface {
	Bytes(path string) ([]byte, error)
}

// pathExistence is what a brief's references ask of files.
type pathExistence interface {
	Exists(path string) (bool, error)
}

// commits is what the source "git.revision" asks of git.
type commits interface {
	Commit(ctx context.Context, dir, rev string) (string, error)
}

// changes is what the source "git.changed_files" asks of git.
type changes interface {
	Changed(ctx context.Context, dir, base, head string) ([]string, error)
}

// sourcing is what a run's inputs are read from (docs/run-implementation.md,
// "Inputs and progress"): a file's text and whether a path a brief names
// exists, of files; a revision's commit and the files changed between two,
// of git.
type sourcing struct {
	texts   fileTexts
	paths   pathExistence
	commits commits
	changes changes
}

// check is an error where a port of s is missing.
func (s sourcing) check() error {
	switch {
	case s.texts == nil:
		return errors.New("no file texts")
	case s.paths == nil:
		return errors.New("no paths")
	case s.commits == nil:
		return errors.New("no commits")
	case s.changes == nil:
		return errors.New("no changes")
	}
	return nil
}

// sources are the sources a run plugs into core/inputs, by name: a path
// relative to launch, the launch directory as the person gave it, and
// git's sources run in root, the root of its worktree.
func (s sourcing) sources(launch, root string) map[string]inputs.Source {
	return map[string]inputs.Source{
		"param":             inputs.ParamSource{},
		"file":              fileSource{texts: s.texts, launch: launch},
		revisionSourceName:  revisionSource{commits: s.commits, root: root},
		"git.changed_files": changedFilesSource{changes: s.changes, root: root},
	}
}

// revisionSourceName is the name of the source "git.revision", whose value
// is a commit: the one source a call's workspace may pin its revision to.
const revisionSourceName = "git.revision"

// pluggedIn is whether a run plugs in the source of name.
func pluggedIn(name string) bool {
	_, ok := sourcing{}.sources("", "")[name]
	return ok
}

// briefPaths answers core/inputs' paths from files: a path relative to the
// launch directory, as a person names a brief where they stand.
type briefPaths struct {
	paths  pathExistence
	launch string
}

func (b briefPaths) Exists(_ context.Context, path string) (bool, error) {
	return b.paths.Exists(fromLaunch(b.launch, path))
}

// fromLaunch is path relative to launch, or path where it is absolute.
func fromLaunch(launch, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(launch, path)
}

// argument is the argument name of arguments, or the error that source
// names none.
func argument(source string, arguments map[string]string, name string) (string, error) {
	value, ok := arguments[name]
	if !ok {
		return "", fmt.Errorf("the source %q names no %s", source, name)
	}
	return value, nil
}

// fileSource is the source "file": the text of the file at its argument
// "path", relative to the launch directory.
type fileSource struct {
	texts  fileTexts
	launch string
}

func (f fileSource) Value(_ context.Context, arguments, _ map[string]string) (inputs.Fixed, error) {
	path, err := argument("file", arguments, "path")
	if err != nil {
		return inputs.Fixed{}, err
	}
	file := fromLaunch(f.launch, path)
	text, err := f.texts.Bytes(file)
	if errors.Is(err, fs.ErrNotExist) {
		return inputs.Fixed{}, fmt.Errorf("the file %q does not exist", file)
	}
	if err != nil {
		return inputs.Fixed{}, fmt.Errorf("the file %q: %w", file, err)
	}
	return inputs.Fixed{Value: string(text)}, nil
}

// revisionSource is the source "git.revision": the full id of the commit
// its argument "rev" names in the worktree's root, which is its identity
// too (ADR-001, invariant 4).
type revisionSource struct {
	commits commits
	root    string
}

func (r revisionSource) Value(ctx context.Context, arguments, _ map[string]string) (inputs.Fixed, error) {
	rev, err := argument("git.revision", arguments, "rev")
	if err != nil {
		return inputs.Fixed{}, err
	}
	commit, err := r.commits.Commit(ctx, r.root, rev)
	if err != nil {
		return inputs.Fixed{}, err
	}
	return inputs.Fixed{Value: commit, Identity: commit}, nil
}

// changedFilesSource is the source "git.changed_files": the paths of the
// files changed in the worktree's root from the merge base of its
// arguments "base" and "head" to "head", one a line, in git's order. None
// changed refuses the input: a review of nothing is a mistake in the
// request.
type changedFilesSource struct {
	changes changes
	root    string
}

func (c changedFilesSource) Value(ctx context.Context, arguments, _ map[string]string) (inputs.Fixed, error) {
	base, err := argument("git.changed_files", arguments, "base")
	if err != nil {
		return inputs.Fixed{}, err
	}
	head, err := argument("git.changed_files", arguments, "head")
	if err != nil {
		return inputs.Fixed{}, err
	}
	paths, err := c.changes.Changed(ctx, c.root, base, head)
	if err != nil {
		return inputs.Fixed{}, err
	}
	if len(paths) == 0 {
		return inputs.Fixed{}, fmt.Errorf("nothing changed from %q to %q", base, head)
	}
	return inputs.Fixed{Value: strings.Join(paths, "\n")}, nil
}
