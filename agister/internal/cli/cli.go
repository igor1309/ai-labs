// Package cli is Agister's command-line client. It depends only on the
// client contract: it parses arguments, calls the contract and presents
// results. It knows no settings, records, runtimes or kinds of work.
package cli

import (
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
  agister init [--force]
  agister check [--probe]            validate all settings (--probe: ask each runtime its version)
  agister agent create <name> --runtime <runtime> [--model <m>] [--model-family <f>] [--effort <e>] [--session fresh-only|resumable] [--command <path>] [--force]
  agister agent list
  agister process list
  agister process show <process> [--agent <name>]
  agister run <process> [--param <name>=<value>]... [--agent <name>] [--timeout <d>] [--max-cost <usd>]
                         [--continue <run-id>] [--json]   (--json: print the node result)
  agister runs [list]
  agister runs show <run-id>
  agister runs watch <run-id> [--after <seq>]

Options:
  --home <dir>   Agister's state and settings (default: $AGISTER_HOME, else ~/.agister)
  --quiet        No progress on stderr
  --debug        Diagnostics on stderr (always kept in <home>/logs/agister.jsonl)

Exit codes: 0 completed, 1 failed, 2 interrupted, 3 refused, 4 lost, 64 usage, 130 stopped watching.`

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
	fmt.Fprintf(env.Stderr, "agister: %v\n", err)
	var usageErr usageError
	var inputErr *contract.InputError
	switch {
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
	force, quiet, debug, json, help, probe                      bool
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
	set.BoolVar(&opts.help, "help", false, "")
	set.BoolVar(&opts.help, "h", false, "")
	set.IntVar(&opts.after, "after", 0, "")
	set.Var(opts.params, "param", "")
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

func dispatch(ctx context.Context, args []string, env IO, build Build) (int, error) {
	opts, positionals, err := parse(args)
	if err != nil {
		return 0, err
	}
	if opts.help || len(positionals) == 0 {
		fmt.Fprintln(env.Stdout, usage)
		if opts.help {
			return 0, nil
		}
		return ExitUsage, nil
	}
	config := Config{Home: home(opts.home, env)}
	if opts.debug {
		config.Debug = env.Stderr
	}
	client, err := build(config)
	if err != nil {
		return 0, err
	}
	command, rest := positionals[0], positionals[1:]
	arg := func(i int, what string) (string, error) {
		if len(rest) <= i {
			return "", usageError{command + " needs " + what}
		}
		return rest[i], nil
	}

	switch command {
	case "init":
		result, err := client.Init(ctx, opts.force)
		if err != nil {
			return 0, err
		}
		for _, path := range result.Created {
			fmt.Fprintf(env.Stdout, "created %s\n", path)
		}
		for _, path := range result.Kept {
			fmt.Fprintf(env.Stdout, "kept    %s (exists; --force replaces it)\n", path)
		}
		return 0, nil

	case "check":
		report, err := client.Check(ctx, opts.probe)
		if err != nil {
			return 0, err
		}
		for _, problem := range report.Problems {
			fmt.Fprintln(env.Stderr, problem)
		}
		kinds := make([]string, 0, len(report.Checked))
		for kind, count := range report.Checked {
			kinds = append(kinds, fmt.Sprintf("%d %s", count, kind))
		}
		sort.Strings(kinds)
		if len(report.Problems) > 0 {
			fmt.Fprintf(env.Stderr, "%d problem(s) in %s\n", len(report.Problems), strings.Join(kinds, ", "))
			return ExitUsage, nil
		}
		fmt.Fprintf(env.Stdout, "settings OK: %s\n", strings.Join(kinds, ", "))
		return 0, nil

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
			path, err := client.CreateAgent(ctx, contract.Agent{Name: name, Runtime: opts.runtime, Model: opts.model, ModelFamily: opts.modelFamily, Effort: opts.effort, Session: opts.session, Command: opts.command}, opts.force)
			if err != nil {
				return 0, err
			}
			fmt.Fprintf(env.Stdout, "created agent %s: %s\n", name, path)
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
				fmt.Fprintln(env.Stderr, line)
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
		parts = append(parts, "("+result.Error.Message+")")
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
		fmt.Fprintf(w, "  stderr: %s\n", truncate(run.StderrTail, 500))
	}
	for _, artifact := range result.Artifacts {
		fmt.Fprintf(w, "  artifact: %s (%d bytes, %s)\n", artifact.Path, artifact.Bytes, artifact.Digest)
	}
	if result.Session != nil {
		fmt.Fprintf(w, "  provider session: %s", result.Session.ProviderSessionID)
		if result.Session.Continues != "" {
			fmt.Fprintf(w, " (continues run %s)", result.Session.Continues)
		}
		fmt.Fprintln(w)
	}
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
	case "CONSTRAINT_CHECKED":
		mark := "·"
		if satisfied, _ := data["satisfied"].(bool); !satisfied {
			mark = "!"
		}
		return fmt.Sprintf("%s constraint %v: %v", mark, data["subject"], data["basis"])
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
	case "PROVIDER_ERROR", "PROVIDER_RETRY", "RATE_LIMITED", "TIMEOUT", "ABORT_REQUESTED", "SPAWN_FAILED",
		"STREAM_PARSE_ERROR", "SESSION_ID_MISMATCH", "TURN_FAILED", "WORKSPACE_RELEASE_FAILED", "ARTIFACT_FAILED":
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
		{"constraints", or(strings.Join(view.Constraints, "; "), "(none)")},
	}
	if view.Refusal != "" {
		lines = append(lines, [2]string{"plan", "REFUSED: " + view.Refusal})
	} else {
		lines = append(lines, [2]string{"plan", strings.Join(view.Primitives, ", ")}, [2]string{"  withheld", or(strings.Join(view.Withheld, ", "), "(none)")})
	}
	for _, line := range lines {
		fmt.Fprintf(w, "%-12s %s\n", line[0], line[1])
	}
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
