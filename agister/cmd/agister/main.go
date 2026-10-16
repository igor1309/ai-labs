// Command agister is the composition root (ADR-001, rule 3): it connects
// layout, documents, resolve and check to files, git and the runtime
// wrappers' facts, through the adapters beside it, and answers cli's port
// from check.
package main

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/igor1309/ai-labs/agister/cli"
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
	os.Exit(run(context.Background(), os.Args[1:], os.Stdout, os.Stderr))
}

// run runs the command args over the real wrappers, in the working
// directory, for the user's home directory, and gives its exit code.
func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	user, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(stderr, "agister:", err)
		return 1
	}
	dir, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(stderr, "agister:", err)
		return 1
	}
	commandLine, err := build(ctx, stdout, stderr)
	if err != nil {
		fmt.Fprintln(stderr, "agister:", err)
		return 1
	}
	return commandLine.Run(args, dir, user)
}

// build is the command line over files, git and the runtime wrappers'
// facts.
func build(ctx context.Context, stdout, stderr io.Writer) (*cli.CLI, error) {
	g, err := git.New("git")
	if err != nil {
		return nil, err
	}
	fs, err := newLayoutFiles(files.New())
	if err != nil {
		return nil, err
	}
	roots, err := newWorktreeRoot(ctx, g)
	if err != nil {
		return nil, err
	}
	wrappers, err := newContracts(
		claudeCodeFacts(claudecode.New()), codexFacts(codex.New()), piFacts(pi.New()), bashFacts(bash.New()))
	if err != nil {
		return nil, err
	}
	return newCommandLine(fs, roots, wrappers, stdout, stderr)
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
