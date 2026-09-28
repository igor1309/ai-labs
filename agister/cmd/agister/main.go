// Command agister is the composition root: the only place that
// instantiates concrete adapters, decorates them and wires the core.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"syscall"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsprovenance"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/inputs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}
	os.Exit(cli.Run(ctx, os.Args[1:], cli.IO{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr, Cwd: cwd, Getenv: os.Getenv}, compose))
}

func compose(config cli.Config) (contract.Client, error) {
	log, err := diagnostics(config)
	if err != nil {
		return nil, err
	}

	definitions := fsdefs.Store{Dir: config.Home}
	evidence := fsruns.Store{Dir: filepath.Join(config.Home, "runs")}
	runtimes := runtime.Registry{
		"claude-code": func(command string) app.TurnRunner {
			return logging.Runner{Inner: claudecode.New(command), Adapter: "claude-code", Log: log}
		},
		"codex": func(command string) app.TurnRunner {
			return logging.Runner{Inner: codex.New(command), Adapter: "codex", Log: log}
		},
	}
	sources := map[string]app.InputProvider{
		"param":             inputs.Param{},
		"file":              inputs.File{},
		"git.revision":      git.Revision{},
		"git.merge_base":    git.MergeBase{},
		"git.diff":          git.Diff{},
		"git.changed_files": git.ChangedFiles{},
	}
	hosted := app.NewHosted()

	return &app.Host{
		Settings:   &app.Settings{Definitions: definitions, Writer: definitions, Examples: examples.Settings()},
		Checker:    &app.Checker{Definitions: definitions, Validator: schema.Validator{}, Runtimes: runtimes, Sources: names(sources)},
		Inspection: &app.Inspection{Definitions: definitions, Runtimes: runtimes, Validator: schema.Validator{}},
		Calls: &app.Calls{
			Definitions: definitions,
			Runtimes:    runtimes,
			Inputs:      sources,
			Workspaces:  git.Workspaces{},
			Provenance:  fsprovenance.Store{Dir: filepath.Join(config.Home, "provenance")},
			Validator:   schema.Validator{},
			Recorder:    evidence,
			Clock:       system.Clock{},
			IDs:         system.IDs{},
			StateDir:    config.Home,
			Hosted:      hosted,
		},
		Runs: &app.Runs{Reader: evidence, Runtimes: runtimes, Hosted: hosted},
	}, nil
}

func names[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for name := range m {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

// diagnostics: info and above to <home>/logs/agister.jsonl; with --debug,
// debug and above to the file and to the terminal.
func diagnostics(config cli.Config) (*slog.Logger, error) {
	level := slog.LevelInfo
	if config.Debug != nil {
		level = slog.LevelDebug
	}
	dir := filepath.Join(config.Home, "logs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(dir, "agister.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	handlers := logging.Fanout{slog.NewJSONHandler(file, &slog.HandlerOptions{Level: level})}
	if config.Debug != nil {
		handlers = append(handlers, slog.NewJSONHandler(config.Debug, &slog.HandlerOptions{Level: level}))
	}
	return slog.New(logging.Handler{Handler: handlers}), nil
}
