// Command agister is the composition root (ADR-001, rule 3): it connects
// layout, documents, resolve and check to files, git and the runtime
// wrappers' facts, through the adapters beside it, and answers cli's
// settings from check.
package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

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
	"github.com/igor1309/ai-labs/agister/supervisor"
)

func main() {
	os.Exit(run(context.Background(), os.Args[1:], os.Stdout, os.Stderr))
}

// run runs the command args in the working directory, over the user's
// home directory, files and git, and gives its exit code.
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
	commandLine, err := connect(ctx, user, stdout, stderr)
	if err != nil {
		fmt.Fprintln(stderr, "agister:", err)
		return 1
	}
	return commandLine.Run(args, dir)
}

// connect is the command line build gives over files, git and the
// supervisor, its grace on the wall clock.
func connect(ctx context.Context, user string, stdout, stderr io.Writer) (*cli.CLI, error) {
	g, err := git.New("git")
	if err != nil {
		return nil, err
	}
	programs, err := supervisor.New(wallTimer)
	if err != nil {
		return nil, err
	}
	f := files.New()
	fs, err := newLayoutFiles(f)
	if err != nil {
		return nil, err
	}
	roots, err := newWorktreeRoot(ctx, g)
	if err != nil {
		return nil, err
	}
	return build(user, f, fs, roots, programs, stdout, stderr)
}

// wallTimer starts wait on the wall clock.
func wallTimer(wait time.Duration) (<-chan time.Time, func()) {
	timer := time.NewTimer(wait)
	return timer.C, func() { timer.Stop() }
}

// build is the command line over links, fs and roots and every runtime
// wrapper's facts, the bash wrapper's turns run by programs, for the user
// whose home directory is user: home's folder is its ".agister" (ADR-002,
// rule 2).
func build(user string, links links, fs layout.FileSystem, roots layout.WorktreeRoot, programs bash.Supervisor, stdout, stderr io.Writer) (*cli.CLI, error) {
	b, err := bash.New(programs)
	if err != nil {
		return nil, err
	}
	wrappers, err := newContracts(
		claudeCodeFacts(claudecode.New()), codexFacts(codex.New()), piFacts(pi.New()), bashFacts(b))
	if err != nil {
		return nil, err
	}
	return newCommandLine(filepath.Join(user, ".agister"), links, fs, roots, wrappers, stdout, stderr)
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
