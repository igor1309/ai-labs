// Command agister is the composition root: the only place that
// instantiates concrete adapters, decorates them and hands them to the core,
// which assembles itself over them (app.NewClient).
package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/inputs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	runtimecomposition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/pages"
)

func main() {
	ctx, stop := shutdown(context.Background())
	defer stop()
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}
	// agister pages serves the settings page; it needs no client.
	if len(os.Args) > 1 && os.Args[1] == "pages" {
		os.Exit(pages.Main(ctx, os.Args[2:], pagesEnv()))
	}
	os.Exit(cli.Run(ctx, os.Args[1:], cli.IO{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr, Cwd: cwd, Getenv: os.Getenv}, compose))
}

// pagesEnv is agister pages' process environment; macOS open shows the page.
func pagesEnv() pages.Env {
	return pages.Env{
		Stdout:   os.Stdout,
		Stderr:   os.Stderr,
		Getenv:   os.Getenv,
		UserHome: os.UserHomeDir,
		Open:     func(url string) error { return exec.Command("open", url).Run() },
		Choose:   pages.MacDialog(runCommand),
		// The run store reads the runs' owners as agister run leaves them.
		Observe: func(dir string) pages.RunObserver { return fsruns.Store{Dir: dir} },
	}
}

func runCommand(ctx context.Context, name string, args ...string) ([]byte, []byte, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	return stdout.Bytes(), stderr.Bytes(), err
}

// shutdown is cancelled by Ctrl-C, by kill, and by closing the terminal, so
// each ends the runtime and releases the workspace.
func shutdown(parent context.Context) (context.Context, context.CancelFunc) {
	return signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
}

func compose(config cli.Config) (contract.Client, error) {
	client, _, err := wire(config)
	return client, err
}

// wire wires the client over the process's own worktree coordinator.
func wire(config cli.Config) (contract.Client, *app.BackgroundReaper, error) {
	return process(config).wire(config)
}

// process is the composition of the process: its worktree coordinator
// keeps the lock files other processes take turns through under the home.
func process(config cli.Config) composition {
	return composition{worktrees: git.NewWorktrees(filepath.Join(config.Home, "locks", "worktrees"))}
}

// composition is what one process wires its client over: the one worktree
// coordinator every adapter that changes a repository's worktrees takes
// its turn in. Tests wire over a coordinator they hold.
type composition struct{ worktrees *git.Worktrees }

// workspaceAdapters are the adapters that change a repository's worktrees,
// each as the component that requires it gets it.
type workspaceAdapters struct {
	// calls makes and releases the checkouts calls work in.
	calls app.CallWorkspaces
	// copies makes and removes the verifier's clean copies.
	copies app.VerifyCopies
	// discarder removes what the reaper finds abandoned.
	discarder app.CheckoutDiscarder
}

// workspaces builds the adapters that change worktrees, all over the
// composition's coordinator: a caller's checkout, the verifier's copy and
// the reaper's discard in one repository run one at a time.
func (c composition) workspaces() workspaceAdapters {
	shared := git.NewWorkspaces(c.worktrees)
	return workspaceAdapters{calls: shared, copies: shared, discarder: shared}
}

// wire builds the infrastructure, chooses the decorators and has the core
// assemble the whole client behind the gate over them. It also returns the
// background reaper every client the gate builds shares, which submitting a
// call starts (tests wait on it).
func (c composition) wire(config cli.Config) (contract.Client, *app.BackgroundReaper, error) {
	log, err := diagnostics(config)
	if err != nil {
		return nil, nil, err
	}

	global := fsdefs.Store{Dir: config.Home}
	local, err := project(config, log)
	if err != nil {
		return nil, nil, err
	}
	var projectRoot string
	if local != nil {
		projectRoot = filepath.Dir(local.Dir)
	}
	evidence := fsruns.Store{Dir: filepath.Join(config.Home, "runs")}
	runtimes := runtime.Registry{
		"claude-code": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewClaudeCode(command), Adapter: "claude-code", Log: log}
		},
		"codex": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewCodex(command), Adapter: "codex", Log: log}
		},
		// Pi's sessions are kept under the home, where a continuation
		// finds them, not in ~/.pi.
		// OpenCode keeps its sessions in its own store.
		"opencode": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewOpenCode(command), Adapter: "opencode", Log: log}
		},
		"pi": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewPi(command, filepath.Join(config.Home, "pi", "sessions")), Adapter: "pi", Log: log}
		},
	}
	// Over the one coordinator of the process: every workspace adapter's
	// worktree changes in a repository take their turn in it.
	workspaces := c.workspaces()
	// Naming and diffing content changes no worktree.
	content := git.Workspaces{}
	// Abandoned runs are reaped beside the calls, never inside one. A reap
	// that fails has no caller to tell and no run record to say so: the
	// log does.
	reaping := &app.BackgroundReaper{
		Reaper: app.NewReaper(evidence, runtimecomposition.Processes{Supervisor: supervisor.Processes{}}, workspaces.discarder, system.Clock{}),
		Report: func(err error) { log.Error("reaping abandoned runs failed", "error", err.Error()) },
	}
	client := app.NewClient(app.Infrastructure{
		Definitions: fsdefs.Layered{Global: global, Project: local},
		Global:      fsdefs.Layered{Global: global},
		Project:     projectRoot,
		Settings:    app.SettingsAdapters{Writer: global, Examples: examples.Settings()},
		Checker:     app.CheckAdapters{Validator: schema.Validator{}, Runtimes: runtimes},
		Resolver:    app.ResolverAdapters{Identities: runtimes, Validator: schema.Validator{}},
		Calls: app.CallAdapters{
			Runners: runtimes,
			Inputs: map[string]app.InputProvider{
				"param":             inputs.Param{},
				"file":              inputs.File{},
				"git.revision":      git.Revision{},
				"git.merge_base":    git.MergeBase{},
				"git.diff":          git.Diff{},
				"git.changed_files": git.ChangedFiles{},
			},
			Workspaces: workspaces.calls,
			Changes:    content,
			Validator:  schema.Validator{},
			Recorder:   evidence,
			Runs:       evidence,
			Clock:      system.Clock{},
			Timer:      system.Timer,
			IDs:        system.IDs{},
			StateDir:   config.Home,
		},
		Preparer: app.SetupAdapters{Content: content, Commands: runtimecomposition.Commands{Supervisor: supervisor.Commands{}}, Clock: system.Clock{}},
		Verifier: app.VerifyAdapters{Content: content, Copies: workspaces.copies, Commands: runtimecomposition.Commands{Supervisor: supervisor.Commands{}}, Clock: system.Clock{}},
		Runs:     app.RunsAdapters{Reader: evidence},
		Decorate: func(client contract.Client) contract.Client {
			return app.ReapOnSubmit{Client: client, Background: reaping}
		},
	})
	return client, reaping, nil
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
