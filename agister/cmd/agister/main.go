// Command agister is the composition root: the only place that
// instantiates concrete adapters, decorates them and hands them to the core,
// which assembles itself over them (app.NewClient).
package main

import (
	"bytes"
	"context"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fscache"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsexport"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsprobes"
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
		Observe:  func(dir string) pages.RunObserver { return fsruns.Store{Dir: dir, Appends: appends} },
		Settings: pagesSettings,
	}
}

// pagesSettings gives the page the binary's own selection of the settings
// layers and its layered store, so the page cannot say otherwise.
func pagesSettings(home, root, launch string, read func(string) ([]byte, error)) (pages.SettingsStore, error) {
	return fsdefs.Inspect(home, root, launch, read)
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

// wire wires the client over the process's own composition.
func wire(config cli.Config, appends *fsruns.Appends) (contract.Client, *app.BackgroundReaper, error) {
	return process(config, appends).wire(config)
}

// process is the composition of the process: its reap removes the
// checkouts old runs left through one worktree coordinator, which keeps
// the lock files other processes take turns through under the home, its run store keeps the
// runs there and signals through appends, its runtimes and its commands
// are started by the operating system, which also ends the process groups
// a dead owner left, the user's CODEX_HOME is the environment's, and every
// wait is on the wall clock.
func process(config cli.Config, appends *fsruns.Appends) composition {
	return processIn(config, appends, os.Getenv, os.UserHomeDir)
}

// processIn is process in the environment getenv reads, for the user whose
// home userHome tells: they tell the user's CODEX_HOME.
func processIn(config cli.Config, appends *fsruns.Appends, getenv func(string) string, userHome func() (string, error)) composition {
	worktrees := git.NewWorktrees(filepath.Join(config.Home, "locks", "worktrees"))
	worktrees.Clock, worktrees.Timer = system.Clock{}, system.Timer
	return composition{
		git:       gitBacked(worktrees),
		runs:      fsruns.Store{Dir: filepath.Join(config.Home, "runs"), Appends: appends},
		starter:   supervisor.Exec{},
		commands:  supervisor.Exec{},
		processes: supervisor.Processes{},
		codexHome: runtimecomposition.CodexHome(getenv, userHome),
		timer:     system.Timer,
		poll:      system.Timer,
		readers:   system.Timer,
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
	// git finds the repository and the worktree, names and diffs their
	// content, removes what old runs left and resolves the git inputs.
	git gitAdapters
	// runs is the store of the runs' records and events.
	runs fsruns.Store
	// starter starts the runtimes' processes, and what a runtime's adapter
	// runs beside it.
	starter supervisor.Starter
	// commands starts the shell a verification command runs under.
	commands supervisor.Starter
	// processes ends the process groups an abandoned run left on record.
	processes runtimecomposition.ProcessSupervisor
	// codexHome tells the user's CODEX_HOME, which a Codex home of
	// Agister's links to.
	codexHome func() (string, error)
	// hosted holds the calls running in this process.
	hosted *app.Hosted
	// timer starts the waits of turns and commands: their timeouts,
	// graces and staleness limits.
	timer func(wait time.Duration) (fired <-chan time.Time, stop func())
	// poll starts the waits between two reads of a running record another
	// process writes that observing it makes; a run this process writes
	// is read again as it appends.
	poll func(wait time.Duration) (fired <-chan time.Time, stop func())
	// readers starts the waits between two attempts of a reap at a run's
	// owner lock that processes reading the run hold.
	readers func(wait time.Duration) (fired <-chan time.Time, stop func())
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
	// calls finds the root of the worktree a call works in, and its
	// repository.
	calls app.CallWorkspaces
	// discarder removes the checkouts and clean copies the reaper finds
	// that runs made before ADR-025 left on record (ADR-025 rule 9).
	discarder app.CheckoutDiscarder
	// content names and diffs the content of worktrees and revisions.
	content app.CallChanges
	// state reads the git state of the worktree a call holds.
	state app.HoldWorktrees
	// The git inputs: a revision, a merge base, a diff and the files it
	// changes.
	revision, mergeBase, diff, changedFiles app.InputProvider
}

// gitBacked builds the adapters over real git. Only the reaper's discard
// changes worktrees, and it takes its turn through the coordinator.
// Locating the worktree and naming and diffing content change none.
func gitBacked(worktrees *git.Worktrees) gitAdapters {
	return gitAdapters{
		calls: git.Workspaces{}, discarder: git.NewWorkspaces(worktrees),
		content: git.Workspaces{}, state: git.Workspaces{},
		revision: git.Revision{}, mergeBase: git.MergeBase{}, diff: git.Diff{}, changedFiles: git.ChangedFiles{},
	}
}

// wire builds the infrastructure, chooses the decorators and has the core
// assemble the whole client behind the gate over them. It also returns the
// background reaper every client the gate builds shares, which submitting a
// call starts (tests wait on it).
func (c composition) wire(config cli.Config) (contract.Client, *app.BackgroundReaper, error) {
	log, turns, err := diagnostics(config)
	if err != nil {
		return nil, nil, err
	}

	global := fsdefs.Store{Dir: config.Home}
	layered, err := layers(config, c.git.calls, log)
	if err != nil {
		return nil, nil, err
	}
	// The directory whose settings are layered over home's: the project's,
	// or the repository's root.
	var projectRoot string
	switch {
	case layered.Project != nil:
		projectRoot = filepath.Dir(layered.Project.Dir)
	case layered.Repository != nil:
		projectRoot = filepath.Dir(layered.Repository.Dir)
	}
	evidence := c.runs
	// Turns and commands wait on the composition's timer. A runtime starts
	// through the composition's starter, a verification command through its
	// starter of commands.
	processes := supervisor.Runtime{Starter: c.starter, Timer: c.timer}
	commands := supervisor.Commands{Starter: c.commands, Timer: c.timer}
	runtimes := runtime.Registry{
		"claude-code": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewClaudeCode(command, processes), Adapter: "claude-code", Log: log, Turns: turns, Clock: system.Clock{}}
		},
		// The Codex homes of threads given skills are kept under the
		// home, where a continuation finds them, beside the user's own.
		"codex": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewCodex(command, filepath.Join(config.Home, "codex", "homes"), c.codexHome, processes), Adapter: "codex", Log: log, Turns: turns, Clock: system.Clock{}}
		},
		// Pi's sessions are kept under the home, where a continuation
		// finds them, not in ~/.pi.
		// OpenCode keeps its sessions in its own store.
		"opencode": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewOpenCode(command, processes), Adapter: "opencode", Log: log, Turns: turns, Clock: system.Clock{}}
		},
		"pi": func(command string) app.TurnRunner {
			return logging.Runner{Inner: runtimecomposition.NewPi(command, filepath.Join(config.Home, "pi", "sessions"), processes), Adapter: "pi", Log: log, Turns: turns, Clock: system.Clock{}}
		},
	}
	// A runtime version the settings verify no primitive for is probed,
	// once; a probe that passed is kept in the home (ADR-029).
	probes := app.NewProbes(map[string]func(string) app.RuntimeProber{
		"codex": func(command string) app.RuntimeProber { return runtimecomposition.NewCodexProber(command, processes) },
	}, fsprobes.Store{Dir: filepath.Join(config.Home, "probes")}, system.Clock{})
	workspaces, content := c.git, c.git.content
	// Abandoned runs are reaped beside the calls, never inside one, but for
	// the run a dead owner left unfinished in a writer call's worktree,
	// which that call has reaped before it decides (LAB-123). A reap that
	// fails has no caller to tell and no run record to say so: the log
	// does.
	// One reaper serves both, so neither reads the other's hold of a run as
	// that run's owner: a step for a run waits for the one that holds it,
	// not for one ending another run's effects.
	// It adopts a run once the processes reading it, as a status read or
	// an export, let go, waiting for them on the composition's timer of
	// readers.
	reaper := app.NewReaper(fsruns.NewAdopter(evidence, c.readers), runtimecomposition.Processes{Supervisor: c.processes}, workspaces.discarder, system.Clock{})
	reaping := &app.BackgroundReaper{
		Reaper: reaper,
		Report: func(err error) { log.Error("reaping abandoned runs failed", "error", err.Error()) },
	}
	infra := app.Infrastructure{
		Definitions: layered,
		Global:      fsdefs.Layered{Home: global},
		Project:     projectRoot,
		Settings:    app.SettingsAdapters{Writer: global, Examples: examples.Settings()},
		Checker:     app.CheckAdapters{Validator: schema.Validator{}, Runtimes: runtimes, Probes: probes},
		Resolver:    app.ResolverAdapters{Identities: runtimes, Validator: schema.Validator{}, Probes: probes},
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
			// The working copies of file inputs are kept in the home's
			// cache, which may be removed at any time (ADR-026 rule 6).
			Copies: fscache.Store{Dir: filepath.Join(config.Home, "cache")},
			// The files a brief's parts refer to (ADR-026 rule 8).
			References: inputs.File{},
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
		// A call's hold of its worktree is kept under the home, apart from
		// the worktree commands' locks; an unfinished run a dead owner left
		// there is reaped by the reaper, and a process another run left there
		// is ended as the reaper ends it (ADR-025 rule 4). The directory keeps
		// the name it had for in-place calls (ADR-022), and the lock files
		// their names: a binary from before ADR-025, still running, holds
		// its lock file there, and its hold must exclude this binary's as
		// this binary's exclude each other.
		Holder: app.HoldAdapters{
			Locks:     system.WorktreeLocks{Dir: filepath.Join(config.Home, "locks", "in-place")},
			Worktrees: workspaces.state,
			Content:   content,
			Runs:      evidence,
			Reaper:    reaper,
			Writers:   runtimecomposition.HoldProcesses{Supervisor: c.processes},
		},
		Verifier:  app.VerifyAdapters{Content: content, Commands: runtimecomposition.Commands{Supervisor: commands}, Clock: system.Clock{}},
		Recoverer: app.RecoverAdapters{Clock: system.Clock{}},
		Runs:      app.RunsAdapters{Reader: evidence, Appends: evidence, Timer: c.poll},
		// An export copies runs from the run store to the folder the caller
		// names (ADR-026 rule 7), which is out of the store.
		Exporter: app.ExportAdapters{Runs: evidence, Folders: fsexport.Folders{Runs: evidence.Dir}},
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

// layers selects the settings layers of a command launched in the working
// directory (ADR-028 rule 1): home, the repository's, <root>/.agister, the
// root as the workspaces find it, and the project's. Home alone outside a
// repository; why is logged.
func layers(config cli.Config, workspaces app.CallWorkspaces, log *slog.Logger) (fsdefs.Layered, error) {
	home := fsdefs.Store{Dir: config.Home}
	if config.Cwd == "" {
		return fsdefs.Layered{Home: home}, nil
	}
	root, err := workspaces.Root(context.Background(), config.Cwd)
	if err != nil {
		log.Debug("no project settings: not in a usable git repository", "cwd", config.Cwd, "error", err.Error())
		return fsdefs.Layered{Home: home}, nil
	}
	selected, err := fsdefs.Select(home, root, config.Cwd)
	if err != nil {
		return fsdefs.Layered{}, err
	}
	for _, layer := range selected.Layers(context.Background()) {
		log.Debug("settings layer", "layer", string(layer.Layer), "dir", layer.Dir)
	}
	return selected, nil
}

// The log is kept within logMax bytes and logKeep old files, compressed.
const (
	logMax  = 5 << 20
	logKeep = 3
)

// diagnostics: the log is <home>/logs/agister.jsonl, info and above, and
// with --debug, debug and above there and on the terminal. It holds what
// no run's record does: warnings, errors and what a command outside any
// run says. What a turn did is its run's, in <home>/runs/<id>/, so the
// second logger, the turns', reaches only the terminal, and only with
// --debug.
func diagnostics(config cli.Config) (log, turns *slog.Logger, err error) {
	level := slog.LevelInfo
	if config.Debug != nil {
		level = slog.LevelDebug
	}
	dir := filepath.Join(config.Home, "logs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, nil, err
	}
	file := logging.File{Path: filepath.Join(dir, "agister.jsonl"), Max: logMax, Keep: logKeep}
	handlers := logging.Fanout{slog.NewJSONHandler(file, &slog.HandlerOptions{Level: level})}
	if config.Debug == nil {
		return slog.New(logging.Handler{Handler: handlers}), slog.New(slog.DiscardHandler), nil
	}
	terminal := slog.NewJSONHandler(config.Debug, &slog.HandlerOptions{Level: level})
	return slog.New(logging.Handler{Handler: append(handlers, terminal)}), slog.New(logging.Handler{Handler: terminal}), nil
}
