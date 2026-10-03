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
	"runtime/debug"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/inputs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	runtimecomposition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/pages"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

func main() {
	ctx, stop := shutdown(context.Background())
	defer stop()
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}
	// The process's one record of what its run handles append: every run
	// store built here signals through it.
	appends := fsruns.NewAppends()
	// agister pages serves the settings page; it needs no client.
	if len(os.Args) > 1 && os.Args[1] == "pages" {
		os.Exit(pages.Main(ctx, os.Args[2:], pagesEnv(appends)))
	}
	info, _ := debug.ReadBuildInfo()
	os.Exit(cli.Run(ctx, os.Args[1:], cli.IO{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr, Cwd: cwd, Getenv: os.Getenv, Version: version(info)}, compose(appends)))
}

// version names the build: its module version, its revision (short, with
// +dirty when the tree had uncommitted changes) and its commit time. What
// the build does not record, as go test and go run outside a checkout do
// not, is unknown.
func version(info *debug.BuildInfo) string {
	module, revision, committed, dirty := "unknown", "unknown", "unknown", ""
	if info == nil {
		return module + " " + revision + " " + committed
	}
	if info.Main.Version != "" {
		module = info.Main.Version
	}
	for _, setting := range info.Settings {
		switch {
		case setting.Key == "vcs.revision" && setting.Value != "":
			revision = setting.Value[:min(8, len(setting.Value))]
		case setting.Key == "vcs.time" && setting.Value != "":
			committed = setting.Value
		case setting.Key == "vcs.modified" && setting.Value == "true":
			dirty = "+dirty"
		}
	}
	return module + " " + revision + dirty + " " + committed
}

// pagesEnv is agister pages' process environment; macOS open shows the page.
// Its run stores signal through appends, as every run store of the process
// does.
func pagesEnv(appends *fsruns.Appends) pages.Env {
	return pages.Env{
		Stdout:   os.Stdout,
		Stderr:   os.Stderr,
		Getenv:   os.Getenv,
		UserHome: os.UserHomeDir,
		Open:     func(url string) error { return exec.Command("open", url).Run() },
		Choose:   pages.MacDialog(runCommand),
		// The run store reads the runs' owners as agister run leaves them.
		Observe: func(dir string) pages.RunObserver { return fsruns.Store{Dir: dir, Appends: appends} },
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

// compose composes the client of the process whose run stores signal
// through appends.
func compose(appends *fsruns.Appends) func(cli.Config) (contract.Client, error) {
	return func(config cli.Config) (contract.Client, error) {
		client, _, err := wire(config, appends)
		return client, err
	}
}

// wire wires the client over the process's own worktree coordinator.
func wire(config cli.Config, appends *fsruns.Appends) (contract.Client, *app.BackgroundReaper, error) {
	return process(config, appends).wire(config)
}

// process is the composition of the process: its git-backed adapters run
// git over one worktree coordinator, which keeps the lock files other
// processes take turns through under the home, its run store keeps the
// runs there and signals through appends, its runtimes and its commands
// are started by the operating system, which also ends the process groups
// a dead owner left, and every wait is on the wall clock.
func process(config cli.Config, appends *fsruns.Appends) composition {
	worktrees := git.NewWorktrees(filepath.Join(config.Home, "locks", "worktrees"))
	worktrees.Clock, worktrees.Timer = system.Clock{}, system.Timer
	return composition{
		git:       gitBacked(worktrees),
		runs:      fsruns.Store{Dir: filepath.Join(config.Home, "runs"), Appends: appends},
		starter:   supervisor.Exec{},
		commands:  supervisor.Exec{},
		processes: supervisor.Processes{},
		timer:     system.Timer,
		poll:      system.Timer,
		hosted:    app.NewHosted(),
	}
}

// composition is what one process wires its client over: the adapters
// backed by git, the run store, the starters of its runtimes and of its
// commands, the reaper of the process groups a dead owner left, the timers
// its waits start on and the calls it hosts. Tests wire over a fake of git,
// starters and timers they hold, wait on the hosted calls' Done, and
// abandon a run through the store in place of killing its owner.
type composition struct {
	// git finds the repository, makes the checkouts and clean copies,
	// names and diffs their content and resolves the git inputs.
	git gitAdapters
	// runs is the store of the runs' records and events.
	runs fsruns.Store
	// starter starts the runtimes' processes, and what a runtime's adapter
	// runs beside it.
	starter supervisor.Starter
	// commands starts the shell a setup or verification command runs
	// under.
	commands supervisor.Starter
	// processes ends the process groups an abandoned run left on record.
	processes runtimecomposition.ProcessSupervisor
	// hosted holds the calls running in this process.
	hosted *app.Hosted
	// timer starts the waits of turns and commands: their timeouts,
	// graces and staleness limits.
	timer func(wait time.Duration) (fired <-chan time.Time, stop func())
	// poll starts the waits between two reads of a running record another
	// process writes that observing it makes; a run this process writes
	// is read again as it appends.
	poll func(wait time.Duration) (fired <-chan time.Time, stop func())
	// stages, when set, is the folder installs stage their results in, in
	// place of the system's temporary folder.
	stages string
	// adjust, when set, adjusts what the client runs on: tests fix the
	// clock and the stamps of installs, spy on home and the staging, and
	// stop an install between its writes.
	adjust func(*app.Infrastructure)
}

// gitAdapters are the adapters backed by git, each as the component that
// requires it gets it.
type gitAdapters struct {
	// calls finds the repository's root and makes and releases the
	// checkouts calls work in.
	calls app.CallWorkspaces
	// copies makes and removes the verifier's clean copies.
	copies app.VerifyCopies
	// discarder removes what the reaper finds abandoned.
	discarder app.CheckoutDiscarder
	// content names and diffs the content of checkouts and revisions.
	content app.CallChanges
	// The git inputs: a revision, a merge base, a diff and the files it
	// changes.
	revision, mergeBase, diff, changedFiles app.InputProvider
}

// gitBacked builds the adapters over real git. Those that change worktrees
// share the coordinator: a caller's checkout, the verifier's copy and the
// reaper's discard in one repository run one at a time. Naming and diffing
// content changes no worktree.
func gitBacked(worktrees *git.Worktrees) gitAdapters {
	shared := git.NewWorkspaces(worktrees)
	return gitAdapters{
		calls: shared, copies: shared, discarder: shared,
		content:  git.Workspaces{},
		revision: git.Revision{}, mergeBase: git.MergeBase{}, diff: git.Diff{}, changedFiles: git.ChangedFiles{},
	}
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
	local, absent, err := project(config, c.git.calls, log)
	if err != nil {
		return nil, nil, err
	}
	var projectRoot string
	if local != nil {
		projectRoot = filepath.Dir(local.Dir)
	}
	evidence := c.runs
	// Turns and commands wait on the composition's timer. A runtime starts
	// through the composition's starter, a setup or verification command
	// through its starter of commands.
	processes := supervisor.Runtime{Starter: c.starter, Timer: c.timer}
	commands := supervisor.Commands{Starter: c.commands, Timer: c.timer}
	runtimes := runtime.Registry{
		"claude-code": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewClaudeCode(command, processes), Adapter: "claude-code", Log: log, Clock: system.Clock{}}
		},
		"codex": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewCodex(command, processes), Adapter: "codex", Log: log, Clock: system.Clock{}}
		},
		// Pi's sessions are kept under the home, where a continuation
		// finds them, not in ~/.pi.
		// OpenCode keeps its sessions in its own store.
		"opencode": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewOpenCode(command, processes), Adapter: "opencode", Log: log, Clock: system.Clock{}}
		},
		"pi": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewPi(command, filepath.Join(config.Home, "pi", "sessions"), processes), Adapter: "pi", Log: log, Clock: system.Clock{}}
		},
	}
	workspaces, content := c.git, c.git.content
	// Abandoned runs are reaped beside the calls, never inside one. A reap
	// that fails has no caller to tell and no run record to say so: the
	// log does.
	reaping := &app.BackgroundReaper{
		Reaper: app.NewReaper(evidence, runtimecomposition.Processes{Supervisor: c.processes}, workspaces.discarder, system.Clock{}),
		Report: func(err error) { log.Error("reaping abandoned runs failed", "error", err.Error()) },
	}
	infra := app.Infrastructure{
		Definitions: fsdefs.Layered{Global: global, Project: local, Absent: absent},
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
				"git.revision":      workspaces.revision,
				"git.merge_base":    workspaces.mergeBase,
				"git.diff":          workspaces.diff,
				"git.changed_files": workspaces.changedFiles,
			},
			Workspaces: workspaces.calls,
			Changes:    content,
			Validator:  schema.Validator{},
			Recorder:   evidence,
			Runs:       evidence,
			Clock:      system.Clock{},
			Timer:      c.timer,
			IDs:        system.IDs{},
			StateDir:   config.Home,
		},
		Preparer: app.SetupAdapters{Content: content, Commands: runtimecomposition.SetupCommands{Supervisor: commands}, Clock: system.Clock{}},
		Verifier: app.VerifyAdapters{Content: content, Copies: workspaces.copies, Commands: runtimecomposition.Commands{Supervisor: commands}, Clock: system.Clock{}},
		Runs:     app.RunsAdapters{Reader: evidence, Appends: evidence, Timer: c.poll},
		// Installs read a folder laid out like the global settings, and
		// write the global settings, backed up beside them; each result is
		// checked on a staged copy.
		Installer: app.InstallAdapters{
			Source:  global,
			Home:    global,
			Backups: installBackups{fsdefs.Backups{Dir: filepath.Join(config.Home, "backups")}},
			Clock:   system.Clock{},
			Stamps:  system.IDs{},
		},
		Staging: installStager{global.StagingIn(c.stages)},
		Decorate: func(client contract.Client) contract.Client {
			return app.ReapOnSubmit{Client: client, Background: reaping}
		},
		Hosted: c.hosted,
	}
	if c.adjust != nil {
		c.adjust(&infra)
	}
	return app.NewClient(infra), reaping, nil
}

// project is the settings layer of the repository containing the working
// directory, like its .claude or .agents: <root>/.agister, the root as the
// workspaces find it. None outside a repository, without that directory,
// or when it is the home itself; why is logged. A .agister that exists but
// cannot be used is an error, so project settings never silently stop
// applying. absent is the directory of a repository without one, where a
// document not found was expected.
func project(config cli.Config, workspaces app.CallWorkspaces, log *slog.Logger) (local *fsdefs.Store, absent string, err error) {
	if config.Cwd == "" {
		return nil, "", nil
	}
	root, err := workspaces.Root(context.Background(), config.Cwd)
	if err != nil {
		log.Debug("no project settings: not in a usable git repository", "cwd", config.Cwd, "error", err.Error())
		return nil, "", nil
	}
	dir := filepath.Join(root, ".agister")
	info, err := os.Stat(dir)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		log.Debug("no project settings: directory absent", "dir", dir)
		return nil, dir, nil
	case err != nil:
		return nil, "", fmt.Errorf("project settings %s: %w", dir, err)
	case !info.IsDir():
		return nil, "", fmt.Errorf("project settings %s: not a directory", dir)
	case sameDir(dir, config.Home):
		log.Debug("no project settings: the repository's .agister is the home", "dir", dir)
		return nil, "", nil
	}
	log.Debug("project settings", "dir", dir)
	return &fsdefs.Store{Dir: dir}, "", nil
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
