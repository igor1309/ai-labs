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
	"os"
	"path/filepath"
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

const usage = `agister — run agent calls defined in settings

Usage:
  agister init [--force]             install the example settings in <home>: shows each file it would
                                     create (and with --force replace), writes only after you type yes
  agister check [--probe] [--tree] [--json]
                                     verify the composed settings (--probe: also ask each runtime its
                                     version; --tree: what defines what, and in which file; --json: the
                                     whole report); every other command except init runs check first
                                     and stops on any problem
  agister agent create <name> --runtime <runtime> [--model <m>] [--model-family <f>] [--effort <e>]
                         [--session fresh-only|resumable] [--command <path>] [--force]
                                     write an agent to <home>; refused if the settings would stop
                                     passing check; --force replaces an existing one after you type yes
  agister agent list
  agister process list
  agister process show <process> [--agent <name>]
  agister run <process> [--param <name>=<value>]... [--agent <name>] [--timeout <d>] [--max-cost <usd>]
                         [--continue <run-id>] [--json]   (--json: print the node result)
  agister runs [list]
  agister runs show <run-id>
  agister runs watch <run-id> [--after <seq>]

Options:
  --home <dir>   Agister's state and global settings (default: $AGISTER_HOME, else ~/.agister);
                 <repository>/.agister takes priority over them, document by document
  --quiet        No progress on stderr
  --debug        Diagnostics on stderr (always kept in <home>/logs/agister.jsonl), including why
                 no project settings apply
  -h, --help     This help; needs no settings

Scripts answer the yes prompts with: echo yes | agister ...

Exit codes: 0 completed, 1 failed, 2 interrupted, 3 refused, 4 lost, 64 usage or invalid settings,
70 internal error, 130 stopped watching.`

// IO is the process environment the CLI works in.
type IO struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
	Cwd    string
	Getenv func(string) string
}

// Config is what the composition root needs to build a client.
type Config struct {
	Home  string
	Cwd   string    // where the project's own settings are looked for
	Debug io.Writer // non-nil when diagnostics go to the terminal too
}

// Build constructs the client; supplied by the composition root.
type Build func(Config) (contract.Client, error)

type usageError struct{ message string }

func (e usageError) Error() string { return e.message }

// Run executes one command line and returns the exit code.
func Run(ctx context.Context, args []string, env IO, build Build) int {
	code, err := dispatch(ctx, args, env, build)
	if err == nil {
		return code
	}
	var settingsErr *contract.SettingsError
	if errors.As(err, &settingsErr) {
		printCheck(env, settingsErr.Report)
	}
	fmt.Fprintf(env.Stderr, "agister: %v\n", err)
	var usageErr usageError
	var inputErr *contract.InputError
	switch {
	case settingsErr != nil:
		return ExitUsage
	case errors.As(err, &usageErr):
		fmt.Fprintf(env.Stderr, "\n%s\n", usage)
		return ExitUsage
	case errors.As(err, &inputErr), errors.Is(err, contract.ErrNotFound):
		return ExitUsage
	default:
		return ExitInternal
	}
}

type options struct {
	home, runtime, model, modelFamily, effort, session, command string
	agent, timeout, maxCost, continueRun                        string
	force, quiet, debug, json, help, probe, tree                bool
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

func parse(args []string) (options, []string, error) {
	opts := options{params: paramFlag{}}
	set := flags(&opts)
	// Flags may appear anywhere among positionals.
	var positionals []string
	for {
		if err := set.Parse(args); err != nil {
			return opts, nil, usageError{err.Error()}
		}
		if set.NArg() == 0 {
			break
		}
		positionals = append(positionals, set.Arg(0))
		args = set.Args()[1:]
	}
	return opts, positionals, nil
}

// flags declares every option; usage must describe each one.
func flags(opts *options) *flag.FlagSet {
	set := flag.NewFlagSet("agister", flag.ContinueOnError)
	set.SetOutput(io.Discard)
	set.StringVar(&opts.home, "home", "", "")
	set.StringVar(&opts.runtime, "runtime", "", "")
	set.StringVar(&opts.model, "model", "", "")
	set.StringVar(&opts.modelFamily, "model-family", "", "")
	set.StringVar(&opts.effort, "effort", "", "")
	set.StringVar(&opts.command, "command", "", "")
	set.StringVar(&opts.agent, "agent", "", "")
	set.StringVar(&opts.timeout, "timeout", "", "")
	set.StringVar(&opts.session, "session", "", "")
	set.StringVar(&opts.maxCost, "max-cost", "", "")
	set.StringVar(&opts.continueRun, "continue", "", "")
	set.BoolVar(&opts.force, "force", false, "")
	set.BoolVar(&opts.quiet, "quiet", false, "")
	set.BoolVar(&opts.debug, "debug", false, "")
	set.BoolVar(&opts.json, "json", false, "")
	set.BoolVar(&opts.probe, "probe", false, "")
	set.BoolVar(&opts.tree, "tree", false, "")
	set.BoolVar(&opts.help, "help", false, "")
	set.BoolVar(&opts.help, "h", false, "")
	set.IntVar(&opts.after, "after", 0, "")
	set.Var(opts.params, "param", "")
	return set
}

func dispatch(ctx context.Context, args []string, env IO, build Build) (int, error) {
	opts, positionals, err := parse(args)
	if err != nil {
		return 0, err
	}
	if opts.help {
		fmt.Fprintln(env.Stdout, usage)
		return 0, nil
	}
	config := Config{Home: home(opts.home, env), Cwd: env.Cwd}
	if opts.debug {
		config.Debug = env.Stderr
	}
	client, err := build(config)
	if err != nil {
		return 0, err
	}
	var command string
	var rest []string
	if len(positionals) > 0 {
		command, rest = positionals[0], positionals[1:]
	}
	// The client refuses everything but init and check while the settings
	// have problems; check prints its own report, and a bare agister checks
	// before it shows the usage.
	if command == "check" {
		report, err := client.Check(ctx, opts.probe)
		if err != nil {
			return 0, err
		}
		return printCheckAs(env, report, opts)
	}
	if command == "" {
		report, err := client.Check(ctx, false)
		if err != nil {
			return 0, err
		}
		if len(report.Problems) > 0 {
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

	switch command {
	case "init":
		return initSettings(ctx, client, opts.force, config.Home, env)

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
				fmt.Fprintf(env.Stdout, "%s\t%s\t%s\t%s\t%s\n", agent.Name, agent.Runtime, or(agent.Model, "(default model)"), or(agent.Effort, "-"), or(agent.ModelFamily, "-"))
			}
			return 0, nil
		}
		return 0, usageError{"unknown agent command: " + sub}

	case "process":
		sub, _ := arg(0, "a subcommand")
		switch sub {
		case "list", "":
			processes, err := client.ListProcesses(ctx)
			if err != nil {
				return 0, err
			}
			for _, process := range processes {
				if process.Problem != "" {
					fmt.Fprintf(env.Stdout, "%s\t%s\n", process.Name, process.Problem)
					continue
				}
				fmt.Fprintf(env.Stdout, "%s\tagent:%s\t%s\t%s\n", process.Name, process.Agent, or(process.Policy, "-"), process.Output)
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
		return 0, usageError{"unknown process command: " + sub}

	case "run":
		name, err := arg(0, "a process name")
		if err != nil {
			return 0, err
		}
		request := contract.CallRequest{Process: name, Params: opts.params, Agent: opts.agent, Timeout: opts.timeout, Continue: opts.continueRun, Cwd: env.Cwd}
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
		}
		return 0, usageError{"unknown runs command: " + sub}
	}
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
		_ = printJSON(env.Stdout, run.Result)
	} else if result := run.Result; result != nil && len(result.Output) > 0 {
		var pretty any
		_ = json.Unmarshal(result.Output, &pretty)
		_ = printJSON(env.Stdout, pretty)
	} else if result != nil && result.Status == "completed" && result.Text != "" {
		fmt.Fprintln(env.Stdout, result.Text)
	}
	summarize(env.Stderr, run)
	return exitCode(run), nil
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
	case "REPAIR_STARTED":
		return fmt.Sprintf("· repair turn for attempt %v in session %v", data["attempt"], data["session"])
	case "PROVIDER_ERROR", "PROVIDER_RETRY", "RATE_LIMITED", "TIMEOUT", "ABORT_REQUESTED", "SPAWN_FAILED",
		"STREAM_PARSE_ERROR", "SESSION_ID_MISMATCH", "TURN_FAILED", "WORKSPACE_RELEASE_FAILED", "ARTIFACT_FAILED",
		"LEFTOVER_PROCESSES_KILLED", "STDOUT_HELD_OPEN", "VERIFY_CHANGED_CONTENT", "VERIFY_STOPPED":
		encoded, _ := json.Marshal(data)
		return fmt.Sprintf("! %s %s", event.Kind, encoded)
	}
	return ""
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
	lines := [][2]string{
		{"process", view.Name},
		{"agent", view.Agent + " (runtime " + view.Runtime + ")"},
		{"policy", or(view.Policy, "(none)")},
		{"params", or(strings.Join(params, ", "), "(none)")},
		{"inputs", or(strings.Join(view.Inputs, ", "), "(none)")},
		{"output", view.Output},
		{"permissions", or(strings.Join(view.Permissions, ", "), "(none)")},
		{"  allowed", or(strings.Join(view.Allowed, ", "), "(none)")},
		{"  denied", or(strings.Join(view.Denied, ", "), "(none)")},
		{"workspace", view.Access + ", scope " + view.Scope},
		{"limits", limits(view)},
	}
	if verify := view.Verify; verify != nil {
		lines = append(lines,
			[2]string{"verify", verify.Command},
			[2]string{"  limits", fmt.Sprintf("timeout %s, attempts %d", verify.Timeout, verify.MaxAttempts)},
			[2]string{"  on failure", verify.Instruction},
		)
	}
	if view.Refusal != "" {
		lines = append(lines, [2]string{"plan", "REFUSED: " + view.Refusal})
	} else {
		lines = append(lines, [2]string{"plan", strings.Join(view.Primitives, ", ")}, [2]string{"  withheld", or(strings.Join(view.Withheld, ", "), "(none)")})
	}
	for i, source := range view.Sources {
		label := ""
		if i == 0 {
			label = "sources"
		}
		text := fmt.Sprintf("%s %s: %s %s", kindNames[source.Kind], source.Name, source.Layer, source.Path)
		if source.Overrides != "" {
			text += " (overrides " + source.Overrides + ")"
		}
		lines = append(lines, [2]string{label, text})
	}
	for _, warning := range view.Warnings {
		lines = append(lines, [2]string{"WARNING", warning})
	}
	for _, line := range lines {
		fmt.Fprintf(w, "%-12s %s\n", line[0], line[1])
	}
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
		return &contract.InputError{Message: cancelled}
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

// printCheckAs prints a check report as JSON, as a tree or as a list.
func printCheckAs(env IO, report contract.CheckReport, opts options) (int, error) {
	code := 0
	if len(report.Problems) > 0 {
		code = ExitUsage
	}
	if opts.json {
		for _, list := range []*[]string{&report.Problems, &report.Overrides, &report.Warnings} {
			if *list == nil {
				*list = []string{}
			}
		}
		if report.Definitions == nil {
			report.Definitions = []contract.Definition{}
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
	"policies": "policy", "runtimes": "runtime", "schemas": "schema",
}

// printTree prints the service and each process with what it uses, then
// the definitions no process uses.
func printTree(w io.Writer, definitions []contract.Definition) {
	byRef := map[contract.DefinitionRef]contract.Definition{}
	for _, d := range definitions {
		byRef[contract.DefinitionRef{Kind: d.Kind, Name: d.Name}] = d
	}
	type line struct{ label, detail string }
	var lines []line
	describe := func(ref contract.DefinitionRef) string {
		d, ok := byRef[ref]
		if !ok {
			return "MISSING"
		}
		text := fmt.Sprintf("%-7s %s", d.Layer, d.Path)
		if d.Overrides != "" {
			text += " (overrides " + d.Overrides + ")"
		}
		if d.Invalid {
			text += " INVALID"
		}
		return text
	}
	reached := map[contract.DefinitionRef]bool{}
	var walk func(ref contract.DefinitionRef, prefix, branch string)
	walk = func(ref contract.DefinitionRef, prefix, branch string) {
		reached[ref] = true
		lines = append(lines, line{prefix + branch + kindNames[ref.Kind] + " " + ref.Name, describe(ref)})
		children := byRef[ref].Uses
		next := prefix
		switch branch {
		case "├─ ":
			next += "│  "
		case "└─ ":
			next += "   "
		}
		for i, child := range children {
			childBranch := "├─ "
			if i == len(children)-1 {
				childBranch = "└─ "
			}
			walk(child, next, childBranch)
		}
	}
	for _, d := range definitions {
		if d.Kind == "service" || d.Kind == "processes" {
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
			lines = append(lines, line{"   " + kindNames[ref.Kind] + " " + ref.Name, describe(ref)})
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
// are listed either way: a problem is often caused by one.
func printCheck(env IO, report contract.CheckReport) int {
	for _, override := range report.Overrides {
		fmt.Fprintln(env.Stdout, "override "+override)
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
		for _, problem := range report.Problems {
			fmt.Fprintln(env.Stderr, problem)
		}
		fmt.Fprintf(env.Stderr, "%d problem(s) in %s\n", len(report.Problems), strings.Join(kinds, ", "))
		return ExitUsage
	}
	fmt.Fprintf(env.Stdout, "settings OK: %s\n", strings.Join(kinds, ", "))
	return 0
}

func limits(view contract.ProcessView) string {
	text := fmt.Sprintf("timeout %s, attempts %d", view.Timeout, view.MaxAttempts)
	if view.MaxCostUSD != nil {
		text += fmt.Sprintf(", cost $%g", *view.MaxCostUSD)
	}
	return text
}

func printJSON(w io.Writer, value any) error {
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
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
