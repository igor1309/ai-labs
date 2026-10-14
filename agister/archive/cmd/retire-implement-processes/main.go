// Command retire-implement-processes retires home's processes
// implement_codex, implement_pi and implement_pi_glm, so home's settings
// folder installs over a home that holds them. The folder has workflows
// of those names, each a call of implement on an agent (ADR-030 rule 6);
// a process and a workflow of one name fail check, so the install is
// refused while home holds them. An install never deletes a document
// (ADR-016 rule 8): this is the explicit step that does, run once, before
// that install.
//
// The three home holds are backed up first, as an install backup of their
// own, which installs keep and prune with theirs: their bytes, then the
// manifest, which records each as replaced by nothing. The backup is read
// back as a restore reads it; only then are they removed, under the write
// lock of home's settings. `agister install --restore <stamp>` puts them
// back. A home that holds none of them is left as it is, and nothing else
// of home is touched.
//
// Usage: retire-implement-processes [home]
// home is $AGISTER_HOME when not given, else ~/.agister, as for agister.
package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/composition/install"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], env{Getenv: os.Getenv, UserHome: os.UserHomeDir, Cwd: os.Getwd, Stdout: os.Stdout, Stderr: os.Stderr}, retirerOf))
}

// retirerOf retires from home on the wall clock.
func retirerOf(home string) retirer { return install.Retirer(home, system.Clock{}, nil) }

// source names the retirement in its backup's manifest.
const source = "retire-implement-processes"

// retired are the processes retired.
var retired = []string{"implement_codex", "implement_pi", "implement_pi_glm"}

// retirer retires documents of a home's settings.
type retirer interface {
	Retire(ctx context.Context, source string, docs []app.RetireDocument) (app.Retired, error)
}

// env is the process's environment.
type env struct {
	Getenv   func(string) string
	UserHome func() (string, error)
	Cwd      func() (string, error)
	Stdout   io.Writer
	Stderr   io.Writer
}

// run retires the processes from the home args name, else $AGISTER_HOME,
// else ~/.agister, through the retirer retirement gives for it, and
// returns the exit code.
func run(ctx context.Context, args []string, env env, retirement func(home string) retirer) int {
	fail := func(err error) int {
		fmt.Fprintf(env.Stderr, "retire: %v\n", err)
		return 1
	}
	if len(args) > 1 {
		return fail(fmt.Errorf("usage: retire-implement-processes [home]"))
	}
	home, err := homeOf(args, env)
	if err != nil {
		return fail(err)
	}
	if info, err := os.Stat(home); err != nil || !info.IsDir() {
		return fail(fmt.Errorf("%s is not a home: %v", home, err))
	}
	docs := make([]app.RetireDocument, 0, len(retired))
	for _, name := range retired {
		docs = append(docs, app.RetireDocument{Kind: document.KindProcess, Name: name})
	}
	done, err := retirement(home).Retire(ctx, source, docs)
	for _, path := range done.Removed {
		fmt.Fprintf(env.Stdout, "retired %s\n", path)
	}
	if err != nil {
		return fail(err)
	}
	if done.Stamp == "" {
		fmt.Fprintf(env.Stdout, "retire: %s holds none of %s: nothing to retire\n", home, strings.Join(retired, ", "))
		return 0
	}
	fmt.Fprintf(env.Stdout, "backed up as %s; restore with: agister install --restore %s\n", done.Stamp, done.Stamp)
	return 0
}

// homeOf is the home args name, else $AGISTER_HOME, else ~/.agister, made
// absolute as agister makes it.
func homeOf(args []string, env env) (string, error) {
	home := env.Getenv("AGISTER_HOME")
	if len(args) == 1 {
		home = args[0]
	}
	if home == "" {
		dir, err := env.UserHome()
		if err != nil {
			return "", err
		}
		return filepath.Join(dir, ".agister"), nil
	}
	if filepath.IsAbs(home) {
		return filepath.Clean(home), nil
	}
	cwd, err := env.Cwd()
	if err != nil {
		return "", err
	}
	return filepath.Join(cwd, home), nil
}
