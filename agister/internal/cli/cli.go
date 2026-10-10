// Package cli is Agister's command-line client. It depends only on the
// client contract: it parses arguments, calls the contract and presents
// results. It knows no settings, records, runtimes or kinds of work.
package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// Exit codes. A run's code follows its node status; what a completed
// run's output means is for the caller to read, not for the exit code.
const (
	ExitCompleted    = 0
	ExitFailed       = 1
	ExitInterrupted  = 2
	ExitRefused      = 3
	ExitLost         = 4
	ExitUsage        = 64
	ExitInternal     = 70
	ExitStoppedWatch = 130
)

const usage = `agister — run agent calls and workflows defined in settings

Usage:
  agister init [--force]             install the example settings in <home>: shows each file it would
                                     create (and with --force replace), writes only after you type yes
  agister install <dir> [--json]     install a folder of settings, such as a repository's .agister, into
                                     <home>, document by document: shows what it would create, replace
                                     (with a diff) and keep, checks the result, writes only after you
                                     type yes, and backs up what it replaces (--json: print the result)
  agister install --restore <stamp> [--json]
                                     undo that install: put back what it replaced, remove what it
                                     created, after you type yes; the last five installs are kept
  agister check [--probe] [--tree] [--dir <path>] [--json]
                                     verify the composed settings (--probe: also ask each runtime its
                                     version; --tree: what defines what, in which layer's file, and
                                     the fields each nearer layer gave; --json: the whole report);
                                     each problem refuses what uses the document it
                                     is in, and says what that is; broken service settings, a file
                                     name that is not a name, an unlistable settings directory, a
                                     workflow named like a process or an invalid project layer stop
                                     commands except init, install, check, cancelling a run and
                                     following an admitted run
  agister agent create <name> --runtime <runtime> [--model <m>] [--model-family <f>] [--effort <e>]
                         [--session fresh-only|resumable] [--command <path>] [--force]
                                     write an agent to <home>; refused if it adds a problem;
                                     --force replaces an existing one after you type yes
  agister agent list
  agister process list [--dir <path>]
  agister process show <process> [--agent <name>] [--dir <path>]
                                     the process as a call would see it, each document's layer files
                                     and each field's layer
  agister workflow list [--dir <path>]
  agister workflow show <workflow> [--dir <path>]
                                     its params, nodes, and each node's process as a call would see it
                                     check, list and show read the settings a call launched in --dir
                                     (default: this directory) would get
  agister run <process> [--param <name>=<value>]... [--agent <name>] [--timeout <d>] [--max-cost <usd>]
                         [--continue <run-id>] [--goal <run-id>[:<input>]] [--answers <run-id>]
                         [--dir <path>] [--json]
                                     (--json: print the node result, with its run_id and each
                                     artifact's path absolute)
                                     the call works in the git worktree that holds --dir (default:
                                     this directory), with its settings, and leaves its changes there
                                     --continue resumes that run's session in the same worktree,
                                     which holds the session's latest run's changes
                                     --goal records the goal the run serves: that run's input (default
                                     goal), by its digest; --answers records the completed run whose
                                     judgement it answers; each is refused unless that run has it
  agister run <workflow> [--param <name>=<value>]... [--goal <run-id>[:<input>]] [--answers <run-id>]
                         [--dir <path>] [--json]
                                     fan-out nodes run concurrently, the join once all of them ended,
                                     if at least one completed; each node is a run of its own; a
                                     workflow of one call takes its process's params and is that
                                     call's one run, which also takes --timeout, --max-cost and,
                                     where its process is resumable, --continue
  agister runs [list]
  agister runs show <run-id>
  agister runs watch <run-id> [--after <seq>]
  agister runs export <run-id>... --to <dir>
                                     copy each run, and each node's run of a workflow, byte for byte to
                                     <dir>/<run-id> for audit, without its owner lock; refused before
                                     it writes anything when --to is missing or not a directory, or a
                                     run does not exist or is still running; an identical copy there is
                                     kept, one that differs is refused and never overwritten; each
                                     artifact is read back and checked against the record's digest
  agister pages [--addr <host:port>] [--home <dir>] [--no-open]
                                     serve the settings page on this machine and open it; see
                                     agister pages --help
  agister version                    this binary's version, revision and commit time; needs no
                                     settings (also --version)

Options:
  --home <dir>   Agister's state and global settings (default: $AGISTER_HOME, else ~/.agister), the
                 home layer; the repository layer, <repository>/.agister, and the project layer, the
                 nearest .agister from the launch directory up and below the repository's root, are
                 composed over it field by field (a prompt, a skill and a schema are taken whole)
  --quiet        No progress on stderr
  -h, --help     This help; needs no settings
  --version      This binary's version, as agister version prints it

Scripts answer the yes prompts with: echo yes | agister ...

<home>/logs/agister.jsonl keeps the warnings and errors no run records, each command that is
refused or fails and the warnings of each check, one that passes too, among them, never what a
turn did: a turn's detail is kept with its run, in <home>/runs/<id>/. The cap is per file: the
current log stays within 5 MB, and at most three older compressed files are kept beside it.

Exit codes: 0 completed, 1 failed, 2 interrupted, 3 refused, 4 lost, 64 usage or invalid settings,
70 internal error, 130 stopped watching.`

// IO is the process environment the CLI works in.
type IO struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
	Cwd    string
	Getenv func(string) string
	// Version names this binary: its module version, revision and commit
	// time, as the composition root reads them from the build.
	Version string
}

// Config is what the composition root needs to build a client.
type Config struct {
	Home string
	Cwd  string // where the project's own settings are looked for
}

// Build constructs the client; supplied by the composition root.
type Build func(Config) (contract.Client, error)

// Logs opens the log of the home a command works in, where the CLI says
// what it refuses or fails at; supplied by the composition root.
type Logs func(Config) (*slog.Logger, error)

type usageError struct{ message string }

func (e usageError) Error() string { return e.message }

// declinedError is the error of a command the user did not confirm.
type declinedError struct{ message string }

func (e declinedError) Error() string { return e.message }

// Run executes one command line and returns the exit code.
func Run(ctx context.Context, args []string, env IO, build Build, logs Logs) int {
	// Help and the version need no home: there is no log to open yet.
	log := slog.New(slog.DiscardHandler)
	opts, positionals, err := parse(args)
	if err != nil {
		// A command line that cannot be read is refused in the log of the
		// home it names as far as it was read, without a client; one whose
		// log cannot be opened is refused all the same.
		if opened, unopened := logs(Config{Home: home(opts.home, env), Cwd: env.Cwd}); unopened == nil {
			command, _ := Lookup(positionals)
			log = opened.With("command", command.Name, "cwd", env.Cwd)
		}
		return failed(ctx, env, log, err)
	}
	if opts.help {
		fmt.Fprintln(env.Stdout, usage)
		return 0
	}
	// The version names the binary whatever the settings say: it is what to
	// look at when they need a newer one.
	if opts.version || len(positionals) > 0 && positionals[0] == "version" {
		fmt.Fprintln(env.Stdout, "agister "+version(env))
		return 0
	}
	// A call works in the worktree that holds the caller's directory, with
	// the settings of that directory's layers (ADR-025 rule 1, ADR-028
	// rule 1); run takes --dir, and so do check and the list and show
	// commands, which read what a call launched there would get (rule 2).
	config := Config{Home: home(opts.home, env), Cwd: env.Cwd}
	if opts.dir != "" {
		config.Cwd = absolute(opts.dir, env.Cwd)
	}
	opened, err := logs(config)
	if err != nil {
		return failed(ctx, env, log, err)
	}
	command, _ := Lookup(positionals) // dispatch refuses an unknown one
	log = opened.With("command", command.Name, "cwd", config.Cwd)
	client, err := build(config)
	if err != nil {
		return failed(ctx, env, log, err)
	}
	code, err := dispatch(ctx, client, log, opts, positionals, config, env)
	if err != nil {
		return failed(ctx, env, log, err)
	}
	return code
}

// failed says err, what the command was refused by or failed at, on stderr
// and returns its exit code. No run records it, so the log does, as one
// error, a refusal by the settings with their problems. A command the
// caller interrupted or did not confirm has not failed, and is not logged.
func failed(ctx context.Context, env IO, log *slog.Logger, err error) int {
	var settingsErr *contract.SettingsError
	var declinedErr declinedError
	refused, declined := errors.As(err, &settingsErr), errors.As(err, &declinedErr)
	switch {
	case ctx.Err() != nil || declined:
	case refused:
		log.ErrorContext(ctx, "the settings refused the command", "error", err.Error(), "problems", messages(settingsErr.Report))
	default:
		log.ErrorContext(ctx, "the command failed", "error", err.Error())
	}
	if refused {
		printCheck(env, settingsErr.Report)
	}
	fmt.Fprintf(env.Stderr, "agister: %v\n", err)
	var usageErr usageError
	var inputErr *contract.InputError
	var refusedErr *contract.RefusedError
	switch {
	case refused, declined:
		return ExitUsage
	case errors.As(err, &refusedErr):
		return ExitRefused
	case errors.As(err, &usageErr):
		fmt.Fprintf(env.Stderr, "\n%s\n", usage)
		return ExitUsage
	case errors.As(err, &inputErr):
		newerHint(env, inputErr.Unknown)
		return ExitUsage
	case errors.Is(err, contract.ErrNotFound):
		return ExitUsage
	default:
		return ExitInternal
	}
}

type options struct {
	home, runtime, model, modelFamily, effort, session, command string
	agent, timeout, maxCost, continueRun, restore, dir          string
	goal, answers, to                                           string
	force, quiet, json, help, probe, tree, version              bool
	after                                                       int
	params                                                      paramFlag
}

type paramFlag map[string]string

func (p paramFlag) String() string { return "" }
func (p paramFlag) Set(value string) error {
	name, text, ok := strings.Cut(value, "=")
	if !ok || name == "" {
		return fmt.Errorf("expected <name>=<value>, got %q", value)
	}
	p[name] = text
	return nil
}

// Command is a command dispatch runs, named as a command line names it
// ("runs show"), and the flags it takes beyond the global ones.
type Command struct {
	Name  string
	Flags []string
}

// globalFlags are the flags every command takes.
var globalFlags = []string{"home", "quiet", "help", "h", "version"}

// commands are the commands dispatch runs, each with the flags it takes;
// parse gives a command only those.
var commands = []Command{
	{"init", []string{"force"}},
	{"install", []string{"restore", "json"}},
	{"check", []string{"probe", "tree", "dir", "json"}},
	{"agent create", []string{"runtime", "model", "model-family", "effort", "session", "command", "force"}},
	{"agent list", nil},
	{"process list", []string{"dir"}},
	{"process show", []string{"agent", "dir", "json"}},
	{"workflow list", []string{"dir"}},
	{"workflow show", []string{"dir", "json"}},
	{"run", []string{"param", "agent", "timeout", "max-cost", "continue", "goal", "answers", "dir", "json"}},
	{"runs list", nil},
	{"runs show", nil},
	{"runs watch", []string{"after", "json"}},
	{"runs export", []string{"to"}},
	{"version", nil},
}

// Commands are the commands dispatch runs, each with the flags it takes
// beyond GlobalFlags.
func Commands() []Command {
	list := make([]Command, 0, len(commands))
	for _, command := range commands {
		list = append(list, Command{Name: command.Name, Flags: slices.Clone(command.Flags)})
	}
	return list
}

// GlobalFlags are the flags every command takes.
func GlobalFlags() []string { return slices.Clone(globalFlags) }

// Lookup is the command a command line's positionals name, as dispatch
// resolves it: the first word, and the second when the first has
// subcommands ("list" when none is given); the bare command line names
// Command{}. ok is false for a command dispatch does not run.
func Lookup(positionals []string) (Command, bool) {
	if len(positionals) == 0 || positionals[0] == "" {
		return Command{}, true
	}
	name := positionals[0]
	if slices.ContainsFunc(commands, func(c Command) bool { return strings.HasPrefix(c.Name, name+" ") }) {
		sub := "list"
		if len(positionals) > 1 && positionals[1] != "" {
			sub = positionals[1]
		}
		name += " " + sub
	}
	for _, command := range commands {
		if command.Name == name {
			return Command{Name: name, Flags: slices.Clone(command.Flags)}, true
		}
	}
	return Command{Name: name}, false
}

// parse reads a command line. Every flag parses on every command, but only
// the global ones and those its command takes reach the options.
func parse(args []string) (options, []string, error) {
	opts, positionals, err := parseTaking(args, func(string) bool { return true })
	if err != nil {
		return opts, positionals, err
	}
	command, _ := Lookup(positionals) // dispatch refuses an unknown one
	return parseTaking(args, func(name string) bool {
		return slices.Contains(globalFlags, name) || slices.Contains(command.Flags, name)
	})
}

// parseTaking parses args into the options of the flags takes accepts and
// drops the others. With an error it returns what it read before it.
func parseTaking(args []string, takes func(name string) bool) (options, []string, error) {
	opts, dropped := options{params: paramFlag{}}, options{params: paramFlag{}}
	set := flags(func(name string) *options {
		if takes(name) {
			return &opts
		}
		return &dropped
	})
	// Flags may appear anywhere among positionals.
	var positionals []string
	for {
		if err := set.Parse(args); err != nil {
			return opts, positionals, usageError{err.Error()}
		}
		if set.NArg() == 0 {
			break
		}
		positionals = append(positionals, set.Arg(0))
		args = set.Args()[1:]
	}
	return opts, positionals, nil
}

// flags declares every option, each bound to the options into gives for
// its name; usage must describe each one.
func flags(into func(name string) *options) *flag.FlagSet {
	set := flag.NewFlagSet("agister", flag.ContinueOnError)
	set.SetOutput(io.Discard)
	set.StringVar(&into("home").home, "home", "", "")
	set.StringVar(&into("runtime").runtime, "runtime", "", "")
	set.StringVar(&into("model").model, "model", "", "")
	set.StringVar(&into("model-family").modelFamily, "model-family", "", "")
	set.StringVar(&into("effort").effort, "effort", "", "")
	set.StringVar(&into("command").command, "command", "", "")
	set.StringVar(&into("agent").agent, "agent", "", "")
	set.StringVar(&into("timeout").timeout, "timeout", "", "")
	set.StringVar(&into("session").session, "session", "", "")
	set.StringVar(&into("max-cost").maxCost, "max-cost", "", "")
	set.StringVar(&into("continue").continueRun, "continue", "", "")
	set.StringVar(&into("goal").goal, "goal", "", "")
	set.StringVar(&into("answers").answers, "answers", "", "")
	set.StringVar(&into("dir").dir, "dir", "", "")
	set.StringVar(&into("restore").restore, "restore", "", "")
	set.StringVar(&into("to").to, "to", "", "")
	set.BoolVar(&into("force").force, "force", false, "")
	set.BoolVar(&into("quiet").quiet, "quiet", false, "")
	set.BoolVar(&into("json").json, "json", false, "")
	set.BoolVar(&into("probe").probe, "probe", false, "")
	set.BoolVar(&into("tree").tree, "tree", false, "")
	set.BoolVar(&into("help").help, "help", false, "")
	set.BoolVar(&into("h").help, "h", false, "")
	set.BoolVar(&into("version").version, "version", false, "")
	set.IntVar(&into("after").after, "after", 0, "")
	set.Var(into("param").params, "param", "")
	return set
}

// dispatch runs the command the positionals name on client. What it
// reports as refused or failed without an error, and what a check warns of,
// it says in log.
func dispatch(ctx context.Context, client contract.Client, log *slog.Logger, opts options, positionals []string, config Config, env IO) (int, error) {
	var command string
	var rest []string
	if len(positionals) > 0 {
		command, rest = positionals[0], positionals[1:]
	}
	// The client refuses everything but init, install and check while the
	// settings have a problem that stops every command; check prints its own
	// report, and a bare agister checks before it shows the usage.
	if command == "check" {
		report, err := client.Check(ctx, opts.probe)
		if err != nil {
			return 0, err
		}
		// No run records a check: the log keeps its warnings, those of one
		// that passes too, and its problems. A check the caller interrupted
		// has not failed, and its report is of a probe cut short.
		if ctx.Err() == nil && len(report.Warnings) > 0 {
			log.WarnContext(ctx, "the settings have warnings", "warnings", report.Warnings)
		}
		if ctx.Err() == nil && len(report.Problems) > 0 {
			log.ErrorContext(ctx, "the settings have problems", "problems", messages(report))
		}
		return printCheckAs(env, report, opts)
	}
	if command == "" {
		report, err := client.Check(ctx, false)
		if err != nil {
			return 0, err
		}
		if stopsEverything(report) {
			return 0, &contract.SettingsError{Report: report}
		}
	}
	if command == "" {
		fmt.Fprintln(env.Stdout, usage)
		return ExitUsage, nil
	}
	arg := func(i int, what string) (string, error) {
		if len(rest) <= i {
			return "", usageError{command + " needs " + what}
		}
		return rest[i], nil
	}
	if found, ok := Lookup(positionals); !ok {
		if parent, sub, has := strings.Cut(found.Name, " "); has {
			return 0, usageError{"unknown " + parent + " command: " + sub}
		}
		return 0, usageError{"unknown command: " + command}
	}

	switch command {
	case "init":
		return initSettings(ctx, client, opts.force, config.Home, env)

	case "install":
		if opts.restore != "" {
			if len(rest) > 0 {
				return 0, usageError{"install --restore takes a stamp, not a folder"}
			}
			return restoreSettings(ctx, client, opts.restore, config.Home, env, opts.json)
		}
		dir, err := arg(0, "a folder of settings")
		if err != nil {
			return 0, err
		}
		return installSettings(ctx, client, absolute(dir, env.Cwd), config.Home, env, opts.json)

	case "agent":
		sub, _ := arg(0, "a subcommand")
		switch sub {
		case "create":
			name, err := arg(1, "an agent name")
			if err != nil {
				return 0, err
			}
			if opts.runtime == "" {
				return 0, usageError{"agent create needs --runtime"}
			}
			agent := contract.Agent{Name: name, Runtime: opts.runtime, Model: opts.model, ModelFamily: opts.modelFamily, Effort: opts.effort, Session: opts.session, Command: opts.command}
			plan, err := client.CreateAgent(ctx, agent, opts.force, nil)
			if err != nil {
				return 0, err
			}
			if plan.Replaces {
				fmt.Fprintf(env.Stdout, "will REPLACE %s (its current content is lost)\n", plan.Path)
				if err := confirm(env, fmt.Sprintf("Type yes to replace agent %s:", name), "agent create cancelled; nothing was written"); err != nil {
					return 0, err
				}
			}
			written, err := client.CreateAgent(ctx, agent, opts.force, &plan)
			if err != nil {
				return 0, err
			}
			verb := "created"
			if written.Replaces {
				verb = "replaced"
			}
			fmt.Fprintf(env.Stdout, "%s agent %s: %s\n", verb, name, written.Path)
			return 0, nil
		case "list", "":
			agents, err := client.ListAgents(ctx)
			if err != nil {
				return 0, err
			}
			for _, agent := range agents {
				if agent.Problem != "" {
					fmt.Fprintf(env.Stdout, "%s\t%s%s\n", agent.Name, agent.Problem, refused(agent.Refusal))
					continue
				}
				fmt.Fprintf(env.Stdout, "%s\t%s\t%s\t%s\t%s%s\n", agent.Name, agent.Runtime, or(agent.Model, "(default model)"), or(agent.Effort, "-"), or(agent.ModelFamily, "-"), refused(agent.Refusal))
			}
			return 0, nil
		}

	case "process":
		sub, _ := arg(0, "a subcommand")
		switch sub {
		case "list", "":
			processes, err := client.ListProcesses(ctx)
			if err != nil {
				return 0, err
			}
			for _, process := range processes {
				// One that names no agent has the one a node binds it to
				// (ADR-030 rule 5).
				line := fmt.Sprintf("%s\tagent:%s\t%s", process.Name, or(process.Agent, "-"), process.Output)
				if process.Problem != "" {
					line = process.Name + "\t" + process.Problem
				}
				fmt.Fprintln(env.Stdout, line+refused(process.Refusal))
			}
			return 0, nil
		case "show":
			name, err := arg(1, "a process name")
			if err != nil {
				return 0, err
			}
			view, err := client.ShowProcess(ctx, name, opts.agent)
			if err != nil {
				return 0, err
			}
			if opts.json {
				return 0, printJSON(env.Stdout, view)
			}
			showProcess(env.Stdout, view)
			return 0, nil
		}

	case "workflow":
		sub, _ := arg(0, "a subcommand")
		switch sub {
		case "list", "":
			workflows, err := client.ListWorkflows(ctx)
			if err != nil {
				return 0, err
			}
			for _, workflow := range workflows {
				line := fmt.Sprintf("%s\t%s\tjoin %s", workflow.Name, strings.Join(workflow.FanOut, ","), workflow.Join)
				if workflow.Call != "" {
					line = fmt.Sprintf("%s\tcall %s", workflow.Name, workflow.Call)
				}
				if workflow.Problem != "" {
					line = workflow.Name + "\t" + workflow.Problem
				}
				fmt.Fprintln(env.Stdout, line+refused(workflow.Refusal))
			}
			return 0, nil
		case "show":
			name, err := arg(1, "a workflow name")
			if err != nil {
				return 0, err
			}
			view, err := client.ShowWorkflow(ctx, name)
			if err != nil {
				return 0, err
			}
			if opts.json {
				return 0, printJSON(env.Stdout, view)
			}
			showWorkflow(env.Stdout, view)
			return 0, nil
		}

	case "run":
		name, err := arg(0, "a process or workflow name")
		if err != nil {
			return 0, err
		}
		request := contract.CallRequest{Process: name, Params: opts.params, Agent: opts.agent, Timeout: opts.timeout, Continue: opts.continueRun, Goal: opts.goal, Answers: opts.answers, Cwd: config.Cwd}
		if opts.maxCost != "" {
			limit, err := strconv.ParseFloat(opts.maxCost, 64)
			if err != nil || limit <= 0 {
				return 0, usageError{"--max-cost needs a positive number of USD"}
			}
			request.MaxCostUSD = &limit
		}
		id, err := client.Submit(ctx, request)
		if err != nil {
			return 0, err
		}
		return follow(ctx, client, id, 0, true, env, opts)

	case "runs":
		sub, _ := arg(0, "a subcommand")
		switch sub {
		case "list", "":
			runs, err := client.ListRuns(ctx)
			if err != nil {
				return 0, err
			}
			for _, run := range runs {
				fmt.Fprintf(env.Stdout, "%s\t%s\t%s\t%s\n", run.ID, run.Process, or(run.Agent, "-"), status(run))
			}
			return 0, nil
		case "show":
			id, err := arg(1, "a run ID")
			if err != nil {
				return 0, err
			}
			run, err := client.Inspect(ctx, id)
			if err != nil {
				return 0, err
			}
			env.Stdout.Write(run.Record)
			fmt.Fprintln(env.Stdout)
			return 0, nil
		case "watch":
			id, err := arg(1, "a run ID")
			if err != nil {
				return 0, err
			}
			return follow(ctx, client, id, opts.after, false, env, opts)
		case "export":
			if len(rest) < 2 {
				return 0, usageError{"runs export needs a run ID"}
			}
			to := opts.to
			if to != "" {
				to = absolute(to, env.Cwd)
			}
			result, err := client.Export(ctx, contract.ExportRequest{Runs: rest[1:], To: to})
			// The runs exported before an interrupt are reported as done.
			code, problems := printExport(env.Stdout, result)
			if errors.Is(err, context.Canceled) {
				fmt.Fprintln(env.Stderr, "agister: export interrupted: the runs reported above were exported, the others were not")
				return ExitInterrupted, nil
			}
			if err != nil {
				return 0, err
			}
			if len(problems) > 0 {
				log.ErrorContext(ctx, "the export refused or failed", "problems", problems)
			}
			return code, nil
		}
	}
	// Lookup refused every command the switch does not run; a test keeps it so.
	return 0, usageError{"unknown command: " + command}
}

// follow observes a run to its end and presents its result. On interrupt,
// a run this command started is cancelled and still reported; a watched
// run is left alone and only the watching stops.
func follow(ctx context.Context, client contract.Client, id string, after int, owned bool, env IO, opts options) (int, error) {
	if !opts.quiet {
		fmt.Fprintf(env.Stderr, "run %s\n", id)
	}
	observeCtx := ctx
	if owned {
		observeCtx = context.WithoutCancel(ctx)
		observed := make(chan struct{})
		defer close(observed)
		go func() {
			select {
			case <-ctx.Done():
				_ = client.Cancel(context.WithoutCancel(ctx), id)
			case <-observed:
			}
		}()
	}
	err := client.Observe(observeCtx, id, after, func(event contract.Event) error {
		if !opts.quiet {
			if line := describe(event); line != "" {
				fmt.Fprintln(env.Stderr, printable(line))
			}
		}
		return nil
	})
	if !owned && ctx.Err() != nil {
		fmt.Fprintf(env.Stderr, "stopped watching run %s; it continues\n", id)
		return ExitStoppedWatch, nil
	}
	if err != nil {
		return 0, err
	}
	run, err := client.Inspect(context.WithoutCancel(ctx), id)
	if err != nil {
		return 0, err
	}
	if opts.json {
		_ = printJSON(env.Stdout, printedResult(run))
	} else if result := run.Result; result != nil && len(result.Output) > 0 {
		var pretty any
		_ = json.Unmarshal(result.Output, &pretty)
		_ = printJSON(env.Stdout, pretty)
	} else if result != nil && result.Status == "completed" && result.Text != "" {
		fmt.Fprintln(env.Stdout, result.Text)
	}
	summarize(env.Stderr, run)
	if result := run.Result; result != nil && result.Error != nil {
		newerHint(env, result.Error.Unknown)
	}
	return exitCode(run), nil
}

// printExport reports what an export did with each run, and returns its
// exit code: failed when a copy did not read back as recorded, else refused
// when a copy that differs was there. problems are the runs it refused or
// failed at, each with why.
func printExport(w io.Writer, result contract.ExportResult) (code int, problems []string) {
	for _, exported := range result.Runs {
		name := exported.ID
		if exported.Workflow != "" {
			name += " (node of " + exported.Workflow + ")"
		}
		switch exported.Action {
		case contract.ExportCopied:
			fmt.Fprintf(w, "copied  %s: %d files, %d bytes to %s\n", name, exported.Files, exported.Bytes, exported.Dir)
		case contract.ExportKept:
			fmt.Fprintf(w, "kept    %s: the copy in %s is identical (%d files, %d bytes)\n", name, exported.Dir, exported.Files, exported.Bytes)
		case contract.ExportRefused:
			fmt.Fprintf(w, "REFUSED %s: %s: %s\n", name, exported.Dir, printable(exported.Problem))
			problems = append(problems, exported.ID+": refused: "+exported.Problem)
			if code == ExitCompleted {
				code = ExitRefused
			}
		default:
			fmt.Fprintf(w, "FAILED  %s: %s\n", name, printable(exported.Problem))
			problems = append(problems, exported.ID+": failed: "+exported.Problem)
			code = ExitFailed
		}
	}
	return code, problems
}

// printed is a node result as --json prints it: named by its run, each
// artifact's path absolute. The stored record keeps the relative paths.
type printed struct {
	RunID string `json:"run_id"`
	*contract.Result
}

func printedResult(run contract.Run) printed {
	if run.Result == nil {
		return printed{RunID: run.ID}
	}
	result := *run.Result
	result.Artifacts = nil
	for _, artifact := range run.Result.Artifacts {
		artifact.Path = filepath.Join(run.Dir, artifact.Path)
		result.Artifacts = append(result.Artifacts, artifact)
	}
	return printed{RunID: run.ID, Result: &result}
}

func exitCode(run contract.Run) int {
	result := run.Result
	if result == nil {
		return ExitInternal // Observe returned, so the run is no longer running
	}
	switch result.Status {
	case "completed":
		return ExitCompleted
	case "interrupted":
		return ExitInterrupted
	case "lost":
		return ExitLost
	}
	if result.Error != nil && result.Error.Class == "refused" {
		return ExitRefused
	}
	return ExitFailed
}

func summarize(w io.Writer, run contract.Run) {
	parts := []string{"run " + run.ID + ": " + status(run)}
	result := run.Result
	if result == nil {
		fmt.Fprintln(w, strings.Join(parts, " "))
		return
	}
	if result.Error != nil && result.Error.Message != "" {
		parts = append(parts, "("+printable(result.Error.Message)+")")
	}
	if result.Cost.USD != nil {
		parts = append(parts, fmt.Sprintf("$%.4f", *result.Cost.USD))
	}
	if result.Timing.WallMS > 0 {
		parts = append(parts, (time.Duration(result.Timing.WallMS) * time.Millisecond).Round(100*time.Millisecond).String())
	}
	if u := result.Usage; u != nil && u.InputTokens != nil && u.OutputTokens != nil {
		parts = append(parts, fmt.Sprintf("%d in/%d out tokens", *u.InputTokens, *u.OutputTokens))
	}
	fmt.Fprintln(w, strings.Join(parts, " "))
	if run.StderrTail != "" {
		fmt.Fprintf(w, "  stderr: %s\n", printable(truncate(run.StderrTail, 500)))
	}
	for _, artifact := range result.Artifacts {
		fmt.Fprintf(w, "  artifact: %s (%d bytes, %s)\n", artifact.Path, artifact.Bytes, artifact.Digest)
	}
	if result.Session != nil {
		fmt.Fprintf(w, "  provider session: %s", printable(result.Session.ProviderSessionID))
		if result.Session.Continues != "" {
			fmt.Fprintf(w, " (continues run %s)", result.Session.Continues)
		}
		fmt.Fprintln(w)
	}
}

// printable escapes control characters other than newline and tab, so text
// from the agent or the runtime cannot drive the terminal.
func printable(text string) string {
	var out strings.Builder
	for _, r := range text {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			fmt.Fprintf(&out, "\\x%02x", r)
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
}

// inLine is a field of a trail event (a touched path, a tool's name) as a
// line of a watch shows it: as it is, or quoted as Go quotes a string when
// it holds what would break the line or read as its end (a newline or
// another unprintable character, a quote, a backslash). The record keeps
// the field as given.
func inLine(field any) any {
	text, ok := field.(string)
	if !ok {
		return field
	}
	if quoted := strconv.Quote(text); quoted != `"`+text+`"` {
		return quoted
	}
	return text
}

// atLineEnd is a denied call's input, which ends its line, as a watch shows
// it: quoted as inLine quotes a field when it holds a newline or another
// unprintable character, or starts with a quote as a quoted input would.
// The quotes and backslashes of the JSON an input is leave it as it is:
// nothing follows them to be misread. The record keeps the input as given.
func atLineEnd(input any) any {
	text, ok := input.(string)
	if !ok {
		return input
	}
	if strings.HasPrefix(text, `"`) || !utf8.ValidString(text) || strings.ContainsFunc(text, func(r rune) bool { return !strconv.IsPrint(r) }) {
		return strconv.Quote(text)
	}
	return text
}

// status is the node status, qualified by its failure class.
func status(run contract.Run) string {
	result := run.Result
	if result == nil {
		return run.State
	}
	if result.Error != nil {
		return result.Status + "/" + result.Error.Class
	}
	return result.Status
}

func describe(event contract.Event) string {
	data := event.Data
	switch event.Kind {
	case "PLANNED":
		return fmt.Sprintf("· plan: %v", data["primitives"])
	case "PERMISSIONS_WITHHELD":
		return fmt.Sprintf("· withheld: %v", data["permissions"])
	case "REFUSED":
		return fmt.Sprintf("! refused: %v", data["reason"])
	case "PROCESS_STARTED":
		return fmt.Sprintf("· started pid %v", data["pid"])
	case "PROVIDER_SESSION_BOUND":
		return fmt.Sprintf("· session %v", data["provider_session_id"])
	case "TOOL_REQUESTED":
		return fmt.Sprintf("· %v %v", data["name"], data["input"])
	case "TOOL_RESULT":
		if isError, _ := data["is_error"].(bool); isError {
			return "  ↳ tool error"
		}
	case "TOUCHED":
		return fmt.Sprintf("· touched %v (%v)", inLine(data["path"]), inLine(data["tool"]))
	case "PERMISSION_DENIED":
		return fmt.Sprintf("! denied: %v %v", inLine(data["tool"]), atLineEnd(data["input"]))
	case "VERIFY_STARTED":
		return fmt.Sprintf("· verify attempt %v: %v", data["attempt"], data["command"])
	case "VERIFY_FINISHED":
		ended := fmt.Sprintf("exit %v", data["code"])
		switch {
		case data["timed_out"] == true:
			ended = "timed out"
		case data["cancelled"] == true:
			ended = "cancelled"
		case data["error"] != nil && data["error"] != "":
			ended = fmt.Sprintf("could not run: %v", data["error"])
		case data["code"] == nil:
			ended = fmt.Sprintf("killed by %v", data["signal"])
		}
		return fmt.Sprintf("· verify attempt %v: %s, %v bytes of output", data["attempt"], ended, data["bytes"])
	case "NODE_STARTED":
		return fmt.Sprintf("· node %v (%v): run %v", data["node"], data["process"], data["run"])
	case "NODE_FINISHED":
		ended := fmt.Sprint(data["status"])
		if class, ok := data["class"]; ok {
			ended += fmt.Sprintf("/%v", class)
		}
		return fmt.Sprintf("· node %v: %s", data["node"], ended)
	case "BARRIER":
		blocker, blocked := data["blocked_by"]
		incomplete, ok := data["incomplete"]
		switch {
		case blocked && ok:
			return fmt.Sprintf("! barrier %v: no node completed (%s), no join", data["state"], names(incomplete))
		case blocked:
			// Stored before ADR-004: the first node that did not complete
			// blocked the join.
			return fmt.Sprintf("! barrier %v by node %v: no join", data["state"], blocker)
		case ok:
			return fmt.Sprintf("! barrier %v: the join runs without %s, which did not complete", data["state"], names(incomplete))
		}
		return fmt.Sprintf("· barrier %v", data["state"])
	case "REPAIR_STARTED":
		return fmt.Sprintf("· repair turn for attempt %v in session %v", data["attempt"], data["session"])
	case "RECOVERY_STARTED":
		return fmt.Sprintf("· recovery turn %v for stale.%v in session %v", data["recovery"], data["limit"], data["session"])
	case "NO_CHANGES":
		return "· no changes in the checkout"
	case "PROVIDER_ERROR", "PROVIDER_RETRY", "RATE_LIMITED", "TIMEOUT", "ABORT_REQUESTED", "SPAWN_FAILED",
		"STREAM_PARSE_ERROR", "SESSION_ID_MISMATCH", "TURN_FAILED", "WORKSPACE_RELEASE_FAILED", "ARTIFACT_FAILED", "CACHE_FAILED",
		"LEFTOVER_PROCESSES_KILLED", "LEFTOVER_CLEANUP_UNKNOWN", "STDOUT_HELD_OPEN", "VERIFY_CHANGED_CONTENT", "VERIFY_STOPPED", "NODE_NOT_STARTED",
		"RECOVERY_NOT_STARTED":
		encoded, _ := json.Marshal(data)
		return fmt.Sprintf("! %s %s", event.Kind, encoded)
	}
	return ""
}

// names lists an event's node names, as the workflow recorded them or as
// read back from its events.
func names(value any) string {
	var list []string
	switch value := value.(type) {
	case []string:
		list = value
	case []any:
		for _, name := range value {
			list = append(list, fmt.Sprint(name))
		}
	}
	return strings.Join(list, ", ")
}

func showProcess(w io.Writer, view contract.ProcessView) {
	var params []string
	for _, param := range view.Params {
		if param.Required {
			params = append(params, param.Name+" (required)")
		} else {
			params = append(params, param.Name+"="+param.Default)
		}
	}
	agent := "(none: a workflow's node binds it to one)"
	if view.Agent != "" {
		agent = view.Agent + " (runtime " + view.Runtime + ")"
	}
	lines := [][2]string{
		{"process", view.Name},
		{"agent", agent},
		{"params", or(strings.Join(params, ", "), "(none)")},
		{"inputs", or(strings.Join(view.Inputs, ", "), "(none)")},
		{"output", view.Output},
		{"permissions", or(strings.Join(view.Permissions, ", "), "(none)")},
		{"  allowed", or(strings.Join(view.Allowed, ", "), "(none)")},
		{"  denied", or(strings.Join(view.Denied, ", "), "(none)")},
		{"workspace", view.Access + ", scope " + view.Scope},
		{"limits", limits(view)},
	}
	if text := stale(view.Stale); text != "" {
		lines = append(lines, [2]string{"  stale", text})
	}
	if verify := view.Verify; verify != nil {
		lines = append(lines,
			[2]string{"verify", verify.Command},
			[2]string{"  limits", fmt.Sprintf("timeout %s, attempts %d", verify.Timeout, verify.MaxAttempts)},
			[2]string{"  on failure", verify.Instruction},
		)
		if view.VerifyName != "" {
			lines = append(lines, [2]string{"  from", "verify:" + view.VerifyName})
		}
	} else if view.VerifyName != "" {
		lines = append(lines, [2]string{"verify", "verify:" + view.VerifyName + " (not resolved)"})
	}
	// The prompt, then the guidance, each with where it comes from
	// (ADR-028 rule 8).
	prompt := func(label, name string) {
		text := name + " (not resolved)"
		for _, source := range view.Sources {
			if source.Kind == "prompts" && source.Name == name {
				text = name + ": " + source.Layer + " " + source.Path
			}
		}
		lines = append(lines, [2]string{label, text})
	}
	if view.Prompt != "" {
		prompt("prompt", view.Prompt)
		if len(view.Guidance) == 0 {
			lines = append(lines, [2]string{"guidance", "(none)"})
		}
	}
	for i, name := range view.Guidance {
		label := ""
		if i == 0 {
			label = "guidance"
		}
		prompt(label, name)
	}
	// The call's skills, the process's then its agent's (ADR-021).
	skills := false
	skill := func(name, namer string) {
		label := ""
		if !skills {
			label, skills = "skills", true
		}
		text := name + " (" + namer + ", not resolved)"
		for _, source := range view.Sources {
			if source.Kind == "skills" && source.Name == name {
				text = name + " (" + namer + "): " + source.Layer + " " + source.Path
			}
		}
		lines = append(lines, [2]string{label, text})
	}
	for _, name := range view.Skills {
		skill(name, "process")
	}
	for _, name := range view.AgentSkills {
		skill(name, "agent")
	}
	if view.Refusal != "" {
		lines = append(lines, [2]string{"plan", "REFUSED: " + view.Refusal})
	} else {
		lines = append(lines, [2]string{"plan", strings.Join(view.Primitives, ", ")}, [2]string{"  withheld", or(strings.Join(view.Withheld, ", "), "(none)")})
	}
	lines = append(lines, sourceLines(view.Sources)...)
	for _, warning := range view.Warnings {
		lines = append(lines, [2]string{"WARNING", warning})
	}
	for _, line := range lines {
		fmt.Fprintf(w, "%-12s %s\n", line[0], line[1])
	}
}

func showWorkflow(w io.Writer, view contract.WorkflowView) {
	var params []string
	for _, param := range view.Params {
		if param.Required {
			params = append(params, param.Name+" (required)")
		} else {
			params = append(params, param.Name+"="+param.Default)
		}
	}
	lines := [][2]string{
		{"workflow", view.Name},
		{"params", or(strings.Join(params, ", "), "(none)")},
		{"inputs", or(strings.Join(view.Inputs, ", "), "(none)")},
	}
	node := func(label string, node contract.WorkflowNode, gets string) {
		process := node.Process
		text := fmt.Sprintf("%s: process %s", node.Name, process.Name)
		if process.Agent != "" {
			text += fmt.Sprintf(", agent %s (runtime %s)", process.Agent, process.Runtime)
		}
		lines = append(lines, [2]string{label, text}, [2]string{"  receives", gets})
		if process.Refusal != "" {
			lines = append(lines, [2]string{"  plan", "REFUSED: " + process.Refusal})
			// What else a plan refused for a required permission withholds.
			if len(process.Withheld) > 0 {
				lines = append(lines, [2]string{"  withheld", strings.Join(process.Withheld, ", ")})
			}
		} else {
			lines = append(lines, [2]string{"  plan", or(strings.Join(process.Primitives, ", "), "(none)")}, [2]string{"  withheld", or(strings.Join(process.Withheld, ", "), "(none)")})
		}
	}
	if call := view.Call; call != nil {
		node("call", *call, "params "+or(strings.Join(call.Params, ", "), "(none)")+": the workflow's, its process's own")
	} else {
		for i, fanOut := range view.FanOut {
			label := ""
			if i == 0 {
				label = "fan-out"
			}
			node(label, fanOut, "params "+or(strings.Join(fanOut.Params, ", "), "(none)"))
		}
		node("join", view.Join, "the collection as input "+or(view.Collection, "(none)")+", and nothing else")
	}
	if view.Refusal != "" {
		lines = append(lines, [2]string{"run", "REFUSED: " + view.Refusal})
	}
	lines = append(lines, sourceLines(view.Sources)...)
	for _, warning := range view.Warnings {
		lines = append(lines, [2]string{"WARNING", warning})
	}
	for _, line := range lines {
		fmt.Fprintf(w, "%-12s %s\n", line[0], line[1])
	}
}

// sourceLines are the lines of a view that say where its definitions come
// from (ADR-028 rule 12): each document with its layer files, nearest
// first, then every field of each composed document, with the layer it
// came from. A document taken whole has no fields. A process's base's files
// and the fields they gave name the base (ADR-030 rule 9).
func sourceLines(sources []contract.DefinitionOrigin) [][2]string {
	var lines [][2]string
	for i, source := range sources {
		label := ""
		if i == 0 {
			label = "sources"
		}
		subject := fmt.Sprintf("%s %s: ", kindNames[source.Kind], source.Name)
		if len(source.Layers) == 0 {
			lines = append(lines, [2]string{label, subject + source.Layer + " " + source.Path})
		}
		for j, layer := range source.Layers {
			text := layer.Layer + " " + layer.Path + ofBase(source.Name, layer)
			if layer.Replaced {
				text += " (replaced)"
			}
			if j == 0 {
				lines = append(lines, [2]string{label, subject + text})
				continue
			}
			lines = append(lines, [2]string{"", strings.Repeat(" ", utf8.RuneCountInString(subject)) + text})
		}
	}
	label := "fields"
	for _, source := range sources {
		if len(source.Layers) == 0 || source.Layers[0].Fields == nil {
			continue
		}
		type field struct{ name, layer string }
		var fields []field
		width := 0
		for _, layer := range source.Layers {
			for _, name := range layer.Fields {
				fields = append(fields, field{name, layer.Layer + ofBase(source.Name, layer)})
				width = max(width, utf8.RuneCountInString(name))
			}
		}
		sort.SliceStable(fields, func(i, j int) bool { return fields[i].name < fields[j].name })
		lines = append(lines, [2]string{label, kindNames[source.Kind] + " " + source.Name})
		label = ""
		for _, field := range fields {
			lines = append(lines, [2]string{"", "  " + field.name + strings.Repeat(" ", width-utf8.RuneCountInString(field.name)) + "  " + field.layer})
		}
	}
	return lines
}

// ofBase names the base a layer's file is of, where it is not the file of
// the document named name itself (ADR-030 rule 9); "" otherwise.
func ofBase(name string, layer contract.DefinitionLayer) string {
	if layer.Process == "" || layer.Process == name {
		return ""
	}
	return " (base " + layer.Process + ")"
}

// confirm asks the user to type "yes" before a destructive write; any other
// answer, or none, is the cancellation error.
func confirm(env IO, question, cancelled string) error {
	fmt.Fprintln(env.Stderr, question)
	var answer string
	if env.Stdin != nil {
		answer, _ = bufio.NewReader(env.Stdin).ReadString('\n')
	}
	if strings.TrimSpace(answer) != "yes" {
		return declinedError{cancelled}
	}
	return nil
}

// initSettings shows what init would write and writes only after the user
// types "yes": it creates files and, with --force, replaces edited ones.
func initSettings(ctx context.Context, client contract.Client, force bool, home string, env IO) (int, error) {
	plan, err := client.Init(ctx, force, nil)
	if err != nil {
		return 0, err
	}
	writes := len(plan.Created) + len(plan.Replaced)
	for _, path := range plan.Created {
		fmt.Fprintf(env.Stdout, "will create  %s\n", path)
	}
	for _, path := range plan.Replaced {
		fmt.Fprintf(env.Stdout, "will REPLACE %s (its current content is lost)\n", path)
	}
	for _, path := range plan.Kept {
		fmt.Fprintf(env.Stdout, "will keep    %s (exists; --force replaces it)\n", path)
	}
	if writes == 0 {
		fmt.Fprintf(env.Stdout, "nothing to write in %s\n", home)
		return 0, nil
	}
	if err := confirm(env, fmt.Sprintf("Type yes to write %d file(s) in %s:", writes, home), "init cancelled; nothing was written"); err != nil {
		return 0, err
	}
	result, err := client.Init(ctx, force, &plan)
	if err != nil {
		return 0, err
	}
	for _, path := range result.Created {
		fmt.Fprintf(env.Stdout, "created  %s\n", path)
	}
	for _, path := range result.Replaced {
		fmt.Fprintf(env.Stdout, "replaced %s\n", path)
	}
	for _, path := range result.Kept {
		fmt.Fprintf(env.Stdout, "kept     %s\n", path)
	}
	return 0, nil
}

// installSettings shows what installing the folder dir would do, and
// installs it only after the user types "yes". With asJSON the plan is
// shown on stderr and the result printed as JSON.
func installSettings(ctx context.Context, client contract.Client, dir, home string, env IO, asJSON bool) (int, error) {
	plan, err := client.Install(ctx, dir, nil)
	if err != nil {
		return 0, err
	}
	shown := env.Stdout
	if asJSON {
		shown = env.Stderr
	}
	for _, doc := range plan.Documents {
		switch doc.Action {
		case contract.InstallCreate:
			fmt.Fprintf(shown, "will create  %s\n", doc.Path)
		case contract.InstallReplace:
			fmt.Fprintf(shown, "will REPLACE %s\n", doc.Path)
			fmt.Fprint(shown, printable(doc.Diff))
		default:
			fmt.Fprintf(shown, "unchanged    %s\n", doc.Path)
		}
	}
	for _, path := range plan.Kept {
		fmt.Fprintf(shown, "home only, kept %s\n", path)
	}
	for _, file := range plan.Ignored {
		fmt.Fprintf(shown, "not settings, not installed: %s\n", printable(file))
	}
	for _, warning := range plan.Warnings {
		fmt.Fprintln(env.Stderr, "warning "+warning)
	}
	writes := plan.Writes()
	if writes == 0 {
		fmt.Fprintf(shown, "nothing to install into %s\n", home)
		if asJSON {
			return 0, printJSON(env.Stdout, plan)
		}
		return 0, nil
	}
	if err := confirm(env, fmt.Sprintf("Type yes to install %d document(s) into %s:", writes, home), "install cancelled; nothing was written"); err != nil {
		return 0, err
	}
	result, err := client.Install(ctx, dir, &plan)
	// An install that wrote its backup can be undone, even one that stopped.
	if result.Stamp != "" {
		hint := env.Stdout
		if asJSON || err != nil {
			hint = env.Stderr
		}
		fmt.Fprintf(hint, "restore with: agister install --restore %s\n", result.Stamp)
	}
	if err != nil {
		return 0, err
	}
	if asJSON {
		return 0, printJSON(env.Stdout, result)
	}
	for _, doc := range result.Documents {
		switch doc.Action {
		case contract.InstallCreate:
			fmt.Fprintf(env.Stdout, "created  %s\n", doc.Path)
		case contract.InstallReplace:
			fmt.Fprintf(env.Stdout, "replaced %s\n", doc.Path)
		}
	}
	return 0, nil
}

// restoreSettings shows what undoing the install stamp would do, and does
// it only after the user types "yes".
func restoreSettings(ctx context.Context, client contract.Client, stamp, home string, env IO, asJSON bool) (int, error) {
	plan, err := client.Restore(ctx, stamp, nil)
	if err != nil {
		return 0, err
	}
	shown := env.Stdout
	if asJSON {
		shown = env.Stderr
	}
	for _, doc := range plan.Documents {
		switch doc.Action {
		case contract.RestorePutBack:
			fmt.Fprintf(shown, "will put back %s\n", doc.Path)
			fmt.Fprint(shown, printable(doc.Diff))
		case contract.RestoreRemove:
			fmt.Fprintf(shown, "will remove   %s (the install created it)\n", doc.Path)
		default:
			fmt.Fprintf(shown, "unchanged     %s\n", doc.Path)
		}
	}
	writes := plan.Writes()
	if writes == 0 {
		fmt.Fprintf(shown, "nothing to restore in %s\n", home)
		if asJSON {
			return 0, printJSON(env.Stdout, plan)
		}
		return 0, nil
	}
	if err := confirm(env, fmt.Sprintf("Type yes to restore %d document(s) in %s as they were before install %s:", writes, home, stamp), "restore cancelled; nothing was written"); err != nil {
		return 0, err
	}
	result, err := client.Restore(ctx, stamp, &plan)
	if err != nil {
		return 0, err
	}
	if asJSON {
		return 0, printJSON(env.Stdout, result)
	}
	for _, doc := range result.Documents {
		switch doc.Action {
		case contract.RestorePutBack:
			fmt.Fprintf(env.Stdout, "put back %s\n", doc.Path)
		case contract.RestoreRemove:
			fmt.Fprintf(env.Stdout, "removed  %s\n", doc.Path)
		}
	}
	return 0, nil
}

// printCheckAs prints a check report as JSON, as a tree or as a list.
func printCheckAs(env IO, report contract.CheckReport, opts options) (int, error) {
	code := 0
	if len(report.Problems) > 0 {
		code = ExitUsage
	}
	if opts.json {
		if report.Problems == nil {
			report.Problems = []contract.Problem{}
		}
		for _, list := range []*[]string{&report.Overrides, &report.Warnings} {
			if *list == nil {
				*list = []string{}
			}
		}
		if report.Definitions == nil {
			report.Definitions = []contract.Definition{}
		}
		if report.Reach == nil {
			report.Reach = []contract.ProblemReach{}
		}
		if report.Blocks == nil {
			report.Blocks = []contract.Block{}
		}
		if report.Bindings == nil {
			report.Bindings = []contract.Binding{}
		}
		return code, printJSON(env.Stdout, report)
	}
	if opts.tree {
		printTree(env.Stdout, report.Definitions)
		report.Overrides = nil // shown in the tree
	}
	return printCheck(env, report), nil
}

var kindNames = map[string]string{
	"service": "service", "agents": "agent", "processes": "process",
	"runtimes": "runtime", "schemas": "schema",
	"workflows": "workflow", "verifies": "verification", "prompts": "prompt",
	"skills": "skill", "briefs": "brief", "workspace": "workspace",
}

// printTree prints the service, each process and each workflow with what
// it uses, then the definitions none of them uses.
func printTree(w io.Writer, definitions []contract.Definition) {
	byRef := map[contract.DefinitionRef]contract.Definition{}
	for _, d := range definitions {
		byRef[contract.DefinitionRef{Kind: d.Kind, Name: d.Name}] = d
	}
	type line struct{ label, detail string }
	var lines []line
	// describe is a document's layer files, nearest first, a line each; a
	// layer other than the farthest is followed by the fields it gave, so
	// one not listed is the farthest layer's (ADR-028 rule 12).
	describe := func(ref contract.DefinitionRef) []string {
		d, ok := byRef[contract.DefinitionRef{Kind: ref.Kind, Name: ref.Name}]
		switch {
		case !ok && ref.Guidance:
			return []string{"MISSING (guidance)"}
		case !ok:
			return []string{"MISSING"}
		}
		layers := d.Layers
		if len(layers) == 0 {
			layers = []contract.DefinitionLayer{{Layer: d.Layer, Path: d.Path}}
		}
		var details []string
		for i, layer := range layers {
			text := fmt.Sprintf("%-10s %s", layer.Layer, layer.Path) + ofBase(ref.Name, layer)
			if layer.Replaced {
				text += " (replaced)"
			}
			if i == 0 && d.Invalid {
				text += " INVALID"
			}
			if i == 0 && ref.Guidance {
				text += " (guidance)"
			}
			details = append(details, text)
			if i < len(layers)-1 && layer.Fields != nil {
				details = append(details, strings.Repeat(" ", 13)+or(strings.Join(layer.Fields, ", "), "(none)"))
			}
		}
		return details
	}
	// described adds a document's lines: the first beside its label, the
	// rest below it, beside rest.
	described := func(label, rest string, details []string) {
		for i, detail := range details {
			if i > 0 {
				label = rest
			}
			lines = append(lines, line{label, detail})
		}
	}
	reached := map[contract.DefinitionRef]bool{}
	var walk func(ref contract.DefinitionRef, prefix, branch string)
	walk = func(use contract.DefinitionRef, prefix, branch string) {
		ref := contract.DefinitionRef{Kind: use.Kind, Name: use.Name}
		reached[ref] = true
		children := byRef[ref].Uses
		next := prefix
		switch branch {
		case "├─ ":
			next += "│  "
		case "└─ ":
			next += "   "
		}
		described(prefix+branch+kindNames[ref.Kind]+" "+ref.Name, next, describe(use))
		for i, child := range children {
			childBranch := "├─ "
			if i == len(children)-1 {
				childBranch = "└─ "
			}
			walk(child, next, childBranch)
		}
	}
	for _, d := range definitions {
		if d.Kind == "service" || d.Kind == "processes" || d.Kind == "workflows" {
			walk(contract.DefinitionRef{Kind: d.Kind, Name: d.Name}, "", "")
		}
	}
	// Unused is whatever no process reaches, even if an unused one uses it.
	var unused []contract.DefinitionRef
	for _, d := range definitions {
		if ref := (contract.DefinitionRef{Kind: d.Kind, Name: d.Name}); !reached[ref] {
			unused = append(unused, ref)
		}
	}
	if len(unused) > 0 {
		lines = append(lines, line{"unused (no process uses these)", ""})
		for _, ref := range unused {
			described("   "+kindNames[ref.Kind]+" "+ref.Name, "", describe(ref))
		}
	}
	width := 0
	for _, l := range lines {
		if l.detail != "" { // headings do not set the column
			width = max(width, utf8.RuneCountInString(l.label))
		}
	}
	for _, l := range lines {
		if l.detail == "" {
			fmt.Fprintln(w, l.label)
			continue
		}
		fmt.Fprintf(w, "%s%s  %s\n", l.label, strings.Repeat(" ", width-utf8.RuneCountInString(l.label)), l.detail)
	}
}

// printCheck prints a check report and returns its exit code. Overrides
// and blocks are listed either way: a problem or a refusal is often caused
// by one. Problems that name something this binary does not know may mean
// the settings were written for a newer one, and a line says so.
func printCheck(env IO, report contract.CheckReport) int {
	for _, override := range report.Overrides {
		fmt.Fprintln(env.Stdout, "override "+override)
	}
	for _, block := range report.Blocks {
		text := fmt.Sprintf("block %s %s: %s", kindNames[block.Ref.Kind], block.Ref.Name, block.Path)
		if block.Reason != "" {
			text += ": " + block.Reason
		}
		fmt.Fprintln(env.Stdout, text)
		fmt.Fprintln(env.Stdout, "  "+reaches(contract.ProblemReach{Processes: block.Processes, Workflows: block.Workflows}))
	}
	for _, warning := range report.Warnings {
		fmt.Fprintln(env.Stderr, "warning "+warning)
	}
	kinds := make([]string, 0, len(report.Checked))
	for kind, count := range report.Checked {
		kinds = append(kinds, fmt.Sprintf("%d %s", count, kind))
	}
	sort.Strings(kinds)
	if len(report.Problems) > 0 {
		unknown := 0
		for i, problem := range report.Problems {
			fmt.Fprintln(env.Stderr, problem.Message)
			if len(report.Reach) == len(report.Problems) {
				fmt.Fprintln(env.Stderr, "  "+reaches(report.Reach[i]))
			}
			if problem.Unknown {
				unknown++
			}
		}
		fmt.Fprintf(env.Stderr, "%d problem(s) in %s\n", len(report.Problems), strings.Join(kinds, ", "))
		newerHint(env, unknown)
		printWithheld(env.Stdout, report.Bindings)
		return ExitUsage
	}
	fmt.Fprintf(env.Stdout, "settings OK: %s\n", strings.Join(kinds, ", "))
	printWithheld(env.Stdout, report.Bindings)
	return 0
}

// printWithheld lists what each binding allows and does not require, and
// its plan withholds: not a problem, but shown (ADR-030 rule 8).
func printWithheld(w io.Writer, bindings []contract.Binding) {
	for _, binding := range bindings {
		if len(binding.Withheld) > 0 {
			fmt.Fprintf(w, "withheld workflow %s node %s: process %s, agent %s (runtime %s version %s): %s\n",
				binding.Workflow, binding.Node, binding.Process, binding.Agent, binding.Runtime, binding.Version, strings.Join(binding.Withheld, ", "))
		}
	}
}

// newerHint says, when unknown problems name something this binary does not
// know, that the settings may have been written for a newer one: on check,
// on a run refused for its settings and on an install refused for the
// settings it would leave (LAB-122).
func newerHint(env IO, unknown int) {
	if unknown > 0 {
		fmt.Fprintf(env.Stderr, "%d problem(s) name something this binary does not know; the settings may need one newer than agister %s.\n", unknown, version(env))
	}
}

// reaches says what one problem or block refuses (ADR-015, ADR-018).
func reaches(reach contract.ProblemReach) string {
	if reach.Stops {
		return "stops every command"
	}
	var refused []string
	for _, name := range reach.Processes {
		refused = append(refused, "process "+name)
	}
	for _, name := range reach.Workflows {
		refused = append(refused, "workflow "+name)
	}
	if len(refused) == 0 {
		return "refuses nothing"
	}
	return "refuses " + strings.Join(refused, ", ")
}

// messages are the report's problems as the log holds them.
func messages(report contract.CheckReport) []string {
	problems := make([]string, 0, len(report.Problems))
	for _, problem := range report.Problems {
		problems = append(problems, problem.Message)
	}
	return problems
}

// stopsEverything reports whether a problem of the report stops every
// command; one whose reach the report does not say does.
func stopsEverything(report contract.CheckReport) bool {
	if len(report.Reach) != len(report.Problems) {
		return true
	}
	for _, reach := range report.Reach {
		if reach.Stops {
			return true
		}
	}
	return false
}

// refused is a listing's note of a refusal; empty for none.
func refused(reason string) string {
	if reason == "" {
		return ""
	}
	return "\tREFUSED: " + reason
}

func limits(view contract.ProcessView) string {
	text := fmt.Sprintf("timeout %s, attempts %d", view.Timeout, view.MaxAttempts)
	if view.MaxCostUSD != nil {
		text += fmt.Sprintf(", cost $%g", *view.MaxCostUSD)
	}
	return text
}

// stale lists the staleness limits in effect; empty when there are none.
func stale(limits contract.Stale) string {
	var parts []string
	for _, limit := range []struct {
		name  string
		value time.Duration
	}{{"no event", limits.NoEvent}, {"no output", limits.NoOutput}, {"tool command", limits.ToolCommand}} {
		if limit.value > 0 {
			parts = append(parts, limit.name+" "+limit.value.String())
		}
	}
	if limits.RepeatedToolCalls > 0 {
		parts = append(parts, fmt.Sprintf("repeated tool calls %d", limits.RepeatedToolCalls))
	}
	if limits.MaxResumes > 0 {
		parts = append(parts, fmt.Sprintf("recovery resumes %d", limits.MaxResumes))
	}
	return strings.Join(parts, ", ")
}

func printJSON(w io.Writer, value any) error {
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

// version is the binary's version text, or unknown when none was given.
func version(env IO) string {
	return or(env.Version, "unknown")
}

func home(flagValue string, env IO) string {
	if flagValue != "" {
		return absolute(flagValue, env.Cwd)
	}
	if value := env.Getenv("AGISTER_HOME"); value != "" {
		return absolute(value, env.Cwd)
	}
	dir, err := os.UserHomeDir()
	if err != nil {
		return absolute(".agister", env.Cwd)
	}
	return filepath.Join(dir, ".agister")
}

func absolute(path, cwd string) string {
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}

func truncate(text string, max int) string {
	if len(text) <= max {
		return text
	}
	return text[:max] + "…"
}

func or(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
