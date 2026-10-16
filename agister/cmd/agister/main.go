// Command agister is the composition root (ADR-001, rule 3): it connects
// layout, documents, resolve and check to files, git and the runtime
// wrappers' facts, through the adapters beside it.
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/igor1309/ai-labs/agister/files"
	"github.com/igor1309/ai-labs/agister/git"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/runtime/pi"
	"github.com/igor1309/ai-labs/agister/settings/check"
	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

func main() {
	if err := run(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "agister:", err)
		os.Exit(1)
	}
}

// run builds the checker of the working directory's settings and home's,
// over the real wrappers.
func run(ctx context.Context) error {
	user, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	launch, err := os.Getwd()
	if err != nil {
		return err
	}
	g, err := git.New("git")
	if err != nil {
		return err
	}
	fs, err := newLayoutFiles(files.New())
	if err != nil {
		return err
	}
	roots, err := newWorktreeRoot(ctx, g)
	if err != nil {
		return err
	}
	wrappers, err := newContracts(
		claudeCodeFacts(claudecode.New()), codexFacts(codex.New()), piFacts(pi.New()), bashFacts(bash.New()))
	if err != nil {
		return err
	}
	_, err = newChecker(filepath.Join(user, ".agister"), launch, fs, roots, wrappers)
	return err
}

// newChecker is check over the settings of home's folder and the launch
// directory, read once: every answer of every part comes from the one
// snapshot layout gives.
func newChecker(home, launch string, fs layout.FileSystem, roots layout.WorktreeRoot, wrappers resolve.Wrappers) (*check.Checker, error) {
	l, err := layout.New(fs, roots)
	if err != nil {
		return nil, err
	}
	snapshot := l.Read(home, launch)
	docs := documents.New(documentsSnapshot(snapshot))
	source, err := newSource(docs, snapshot)
	if err != nil {
		return nil, err
	}
	resolver, err := resolve.New(source, wrappers)
	if err != nil {
		return nil, err
	}
	resolves, err := newCheckResolve(resolver, source, snapshot.Layers)
	if err != nil {
		return nil, err
	}
	fields, err := newCheckFields(docs, snapshot.Layers)
	if err != nil {
		return nil, err
	}
	return check.New(names{snapshot: snapshot}, resolves, fields)
}
