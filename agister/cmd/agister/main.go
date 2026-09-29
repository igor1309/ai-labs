// Command agister is the composition root: the only place that
// instantiates concrete adapters, decorates them and wires the core.
package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
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
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

func main() {
	ctx, stop := shutdown(context.Background())
	defer stop()
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}
	os.Exit(cli.Run(ctx, os.Args[1:], cli.IO{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr, Cwd: cwd, Getenv: os.Getenv}, compose))
}

// shutdown is cancelled by Ctrl-C, by kill, and by closing the terminal, so
// each ends the runtime and releases the workspace.
func shutdown(parent context.Context) (context.Context, context.CancelFunc) {
	return signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
}

func compose(config cli.Config) (contract.Client, error) {
	return newGated(config)
}

// newGated is the whole client behind the gate.
func newGated(config cli.Config) (*app.Gated, error) {
	gated, _, err := wire(config)
	return gated, err
}

// wire builds newGated, and the background reaper every client it builds
// shares, which submitting a call starts (tests wait on it).
func wire(config cli.Config) (*app.Gated, *app.BackgroundReaper, error) {
	log, err := diagnostics(config)
	if err != nil {
		return nil, nil, err
	}

	global := fsdefs.Store{Dir: config.Home}
	local, err := project(config, log)
	if err != nil {
		return nil, nil, err
	}
	definitions := fsdefs.Layered{Global: global, Project: local}
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
	// Abandoned runs are reaped beside the calls, never inside one.
	reaping := &app.BackgroundReaper{Reaper: &app.Reaper{
		Adopter: evidence, Processes: supervisor.Processes{}, Discarder: git.Workspaces{}, Clock: system.Clock{},
	}}
	provenance := fsprovenance.Store{Dir: filepath.Join(config.Home, "provenance")}
	checkerOn := func(definitions app.DefinitionSource) *app.Checker {
		return &app.Checker{Definitions: definitions, Validator: schema.Validator{}, Runtimes: runtimes, Sources: names(sources)}
	}
	// build makes the whole client over the sources given: the layered
	// settings and the global layer alone. The gate builds it on snapshots
	// per operation, so every use case, including the scopes that validate a
	// write, reads only the settings that operation checked; hosted runs and
	// evidence are shared by every build.
	build := func(layered, globalOnly app.DefinitionSource) contract.Client {
		// Writes go to global settings, which must stay valid on their own
		// and with the project in view.
		scopes := []app.Scope{{Name: "global settings", Check: checkerOn(globalOnly)}}
		if local != nil {
			scopes = append(scopes, app.Scope{Name: "settings in " + filepath.Dir(local.Dir), Check: checkerOn(layered)})
		}
		host := &app.Host{
			Settings:   &app.Settings{Definitions: layered, Writer: global, Examples: examples.Settings(), Scopes: scopes},
			Checker:    checkerOn(layered),
			Inspection: &app.Inspection{Definitions: layered, Runtimes: runtimes, Validator: schema.Validator{}},
			Calls: &app.Calls{
				Definitions: layered,
				Runtimes:    runtimes,
				Inputs:      sources,
				Workspaces:  git.Workspaces{},
				Provenance:  provenance,
				Validator:   schema.Validator{},
				Recorder:    evidence,
				Runs:        evidence,
				Clock:       system.Clock{},
				IDs:         system.IDs{},
				StateDir:    config.Home,
				Hosted:      hosted,
			},
			Runs: &app.Runs{Reader: evidence, Hosted: hosted},
		}
		return app.ReapOnSubmit{Client: host, Background: reaping}
	}

	// Nothing but init and check works on settings that do not pass check.
	return &app.Gated{Definitions: definitions, Global: fsdefs.Layered{Global: global}, Build: build}, reaping, nil
}

// project is the settings layer of the repository containing the working
// directory, like its .claude or .agents: <root>/.agister. None outside a
// repository, without that directory, or when it is the home itself; why
// is logged. A .agister that exists but cannot be used is an error, so
// project settings never silently stop applying.
func project(config cli.Config, log *slog.Logger) (*fsdefs.Store, error) {
	if config.Cwd == "" {
		return nil, nil
	}
	root, err := git.Workspaces{}.Root(context.Background(), config.Cwd)
	if err != nil {
		log.Debug("no project settings: not in a usable git repository", "cwd", config.Cwd, "error", err.Error())
		return nil, nil
	}
	dir := filepath.Join(root, ".agister")
	info, err := os.Stat(dir)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		log.Debug("no project settings: directory absent", "dir", dir)
		return nil, nil
	case err != nil:
		return nil, fmt.Errorf("project settings %s: %w", dir, err)
	case !info.IsDir():
		return nil, fmt.Errorf("project settings %s: not a directory", dir)
	case sameDir(dir, config.Home):
		log.Debug("no project settings: the repository's .agister is the home", "dir", dir)
		return nil, nil
	}
	log.Debug("project settings", "dir", dir)
	return &fsdefs.Store{Dir: dir}, nil
}

func sameDir(a, b string) bool {
	infoA, errA := os.Stat(a)
	infoB, errB := os.Stat(b)
	return errA == nil && errB == nil && os.SameFile(infoA, infoB)
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
