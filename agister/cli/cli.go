// Package cli is the command line (ADR-001): it turns "agister check",
// "agister inspect", "agister run" and "agister runs" into requests on the
// ports it declares, and prints what the ports give. It is given its
// arguments, its working directory and its output streams (ADR-009, rule
// 2); a write that fails is its error. The composition answers its ports, over home's
// folder, which is the composition's.
package cli

import (
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"slices"
	"strings"
)

// Kind is a kind of document.
type Kind string

const (
	KindWorkflow Kind = "workflow"
	KindProcess  Kind = "process"
	KindAgent    Kind = "agent"
	KindRuntime  Kind = "runtime"
	KindBrief    Kind = "brief"
	KindPrompt   Kind = "prompt"
	KindSchema   Kind = "schema"
	KindSkill    Kind = "skill"
)

// Layer is a layer of the settings (ADR-002, rule 2).
type Layer string

const (
	LayerHome       Layer = "home"
	LayerRepository Layer = "repository"
	LayerProject    Layer = "project"
)

// Settings is the port: what the command line asks of the settings read
// at a command's launch directory. Check gives every fault and every name;
// List the names of the process, workflow or agent kind; Show one process,
// workflow or agent.
type Settings interface {
	Check(launch string) (Report, error)
	List(launch string, kind Kind) ([]Listed, error)
	Show(launch string, document Document) (Shown, error)
}

// Document is a document, by kind and name.
type Document struct {
	Kind Kind
	Name string
}

// Source is where a value comes from: a file, its line there, 0 for none,
// and the layer of the file, "" for none.
type Source struct {
	File  string
	Line  int
	Layer Layer
}

// Problem is a problem or a warning: the source and the place of what it
// is about, none for no document, and what is wrong.
type Problem struct {
	Source  Source
	Place   string
	Message string
}

// Block is the block that refuses a document: its reason and where the
// blocks give it.
type Block struct {
	Reason string
	Source Source
}

// Report is what check gives: the problems of no document, each refusing
// every request; each document at fault, with what it refuses; each
// warning, with every name it came with; and every name, resolving or
// refused.
type Report struct {
	Problems []Problem
	Findings []Finding
	Warnings []Warning
	Names    []Status
}

// Finding is a document at fault, with its problems or the block that
// refuses it, and every name it refuses.
type Finding struct {
	Document Document
	Problems []Problem
	Block    *Block
	Refuses  []Document
}

// Warning is a warning and every name that resolves with it.
type Warning struct {
	Problem Problem
	With    []Document
}

// Status is a name and whether it resolves.
type Status struct {
	Document Document
	Resolves bool
}

// Listed is a name of a listing, the layers that hold it, and whether it
// resolves.
type Listed struct {
	Name     string
	Layers   []Layer
	Resolves bool
}

// Shown is a document shown: whether a layer holds it; its fields; and
// every document it reached, the plan of each step and its warnings, or
// the faults that refuse it.
type Shown struct {
	Held     bool
	Fields   []Field
	Reached  []Document
	Plans    []Plan
	Warnings []Problem
	Faults   []Fault
}

// Field is one field of a document: its place, its value as text, and its
// source.
type Field struct {
	Place  string
	Value  string
	Source Source
}

// Plan is a step's plan: the step, by its workflow's name and its place
// there; its process, agent and runtime; the options it takes; and the
// permissions required, allowed, granted, granted beyond the allowed, and
// allowed but withheld.
type Plan struct {
	Workflow string
	Place    string
	Process  string
	Agent    string
	Runtime  string
	Options  []string
	Required []string
	Allowed  []string
	Granted  []string
	Extra    []string
	Withheld []string
}

// Fault is one fault that refuses a document: the chain that reached the
// document at fault, the last link, with its problems or the block that
// refuses it; or, with no chain, problems of no document.
type Fault struct {
	Chain    []Link
	Problems []Problem
	Block    *Block
}

// Link is a document of a chain, and where the document before it names
// it; none for the first.
type Link struct {
	Document Document
	Source   Source
	Place    string
}

// Exit codes: a fault reported, a document no layer holds, or a failure;
// a bad command.
const (
	exitFault = 1
	exitUsage = 2
)

const usage = `usage:
  agister check [--dir <directory>]
  agister inspect processes|workflows|agents [--dir <directory>]
  agister inspect process|workflow|agent <name> [--dir <directory>]
  agister run <workflow> [--param <name>=<value>]... [--continue <run id> | --reuse <run id>] [--dir <directory>]
  agister run --process <name> --agent <name> [--param <name>=<value>]... [--continue <run id> | --reuse <run id>] [--dir <directory>]
  agister status [<run-id>|--last] [--json]
  agister runs list [--json]
  agister runs export <run id> --to <directory>
`

// CLI runs commands against its settings, its runner and its runs,
// printing to its streams.
type CLI struct {
	settings Settings
	runner   Runner
	runs     Runs
	states   RunStates
	stdout   io.Writer
	stderr   io.Writer
}

// New gives a command line asking settings, runner, runs and states, printing what
// they give to stdout, and a bad command's usage and a failure to stderr.
func New(settings Settings, runner Runner, runs Runs, states RunStates, stdout, stderr io.Writer) (*CLI, error) {
	if settings == nil {
		return nil, errors.New("cli: no settings")
	}
	if runner == nil {
		return nil, errors.New("cli: no runner")
	}
	if runs == nil {
		return nil, errors.New("cli: no runs")
	}
	if states == nil {
		return nil, errors.New("cli: no run states")
	}
	if stdout == nil {
		return nil, errors.New("cli: no stdout")
	}
	if stderr == nil {
		return nil, errors.New("cli: no stderr")
	}
	return &CLI{settings: settings, runner: runner, runs: runs, states: states, stdout: stdout, stderr: stderr}, nil
}

// Run runs the command args, the program's name left out, in the working
// directory dir, and gives its exit code. The launch directory is --dir,
// relative to dir, or dir. A write to stdout that fails ends the command's
// output, and is its error.
func (c *CLI) Run(args []string, dir string) int {
	cmd, err := parse(args)
	if err != nil {
		fmt.Fprintf(c.stderr, "agister: %v\n%s", err, usage)
		return exitUsage
	}
	launch := dir
	if cmd.dir != "" {
		launch = cmd.dir
		if !filepath.IsAbs(cmd.dir) {
			launch = filepath.Join(dir, cmd.dir)
		}
	}
	out := &output{w: c.stdout}
	code, err := cmd.run(c, out, launch)
	if err == nil {
		err = out.err
	}
	if err != nil {
		fmt.Fprintf(c.stderr, "agister: %v\n", err)
		return exitFault
	}
	return code
}

// output is stdout as one command writes it: the first write that fails
// is kept, and nothing is written after it, so the command's output is
// whole or reported lost.
type output struct {
	w   io.Writer
	err error
}

func (o *output) Write(p []byte) (int, error) {
	if o.err != nil {
		return 0, o.err
	}
	n, err := o.w.Write(p)
	if err == nil && n < len(p) {
		err = io.ErrShortWrite
	}
	o.err = err
	return n, err
}

// command is a command parsed: what it runs, and the launch directory
// --dir gives, "" for none.
type command struct {
	run func(c *CLI, out io.Writer, launch string) (int, error)
	dir string
}

// inspected is the kind inspect lists, by the word that lists it, or
// shows, by the word that shows one; "" for a word of neither.
func inspected(word string) (list, show Kind) {
	switch word {
	case "processes":
		return KindProcess, ""
	case "workflows":
		return KindWorkflow, ""
	case "agents":
		return KindAgent, ""
	case "process":
		return "", KindProcess
	case "workflow":
		return "", KindWorkflow
	case "agent":
		return "", KindAgent
	}
	return "", ""
}

// flags are the flags of a command: --dir; run's --process, --agent,
// --continue, --reuse and each --param, in the order given; runs' --to;
// and each flag by its name, as it was given, in order.
type flags struct {
	dir, process, agent, continued, reused, to string
	params                                     []string
	given                                      []givenFlag
	last, json                                 bool
}

// givenFlag is a flag by its name, and as it was given.
type givenFlag struct {
	name, arg string
}

// only is the error of the first flag given that is not one of names, nil
// where there is none.
func (f flags) only(names ...string) error {
	for _, g := range f.given {
		if !slices.Contains(names, g.name) {
			return fmt.Errorf("unknown flag %s", g.arg)
		}
	}
	return nil
}

// needs is what flag takes as its value, "" for a flag no command takes.
func needs(flag string) string {
	switch flag {
	case "dir":
		return "a directory"
	case "process":
		return "a process"
	case "agent":
		return "an agent"
	case "param":
		return "a param"
	case "continue", "reuse":
		return "a run id"
	case "to":
		return "a directory"
	}
	return ""
}

// parse parses args: the words of a command, and its flags anywhere among
// them, a flag given again replacing its value, but --param, which adds
// one.
func parse(args []string) (command, error) {
	if len(args) == 1 && (args[0] == "--help" || args[0] == "-h") {
		return command{run: func(_ *CLI, out io.Writer, _ string) (int, error) {
			_, err := io.WriteString(out, usage)
			return 0, err
		}}, nil
	}
	var f flags
	var words []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if !strings.HasPrefix(arg, "-") {
			words = append(words, arg)
			continue
		}
		flag, value, given := strings.Cut(strings.TrimPrefix(strings.TrimPrefix(arg, "-"), "-"), "=")
		if flag == "last" || flag == "json" {
			if given {
				return command{}, fmt.Errorf("%s takes no value", arg)
			}
			f.given = append(f.given, givenFlag{name: flag, arg: arg})
			if flag == "last" {
				f.last = true
			} else {
				f.json = true
			}
			continue
		}
		need := needs(flag)
		if need == "" {
			return command{}, fmt.Errorf("unknown flag %s", arg)
		}
		if !given {
			if i+1 == len(args) {
				return command{}, fmt.Errorf("%s needs %s", arg, need)
			}
			i++
			value = args[i]
		}
		if value == "" {
			return command{}, fmt.Errorf("%s needs %s", arg, need)
		}
		f.given = append(f.given, givenFlag{name: flag, arg: arg})
		switch flag {
		case "dir":
			f.dir = value
		case "process":
			f.process = value
		case "agent":
			f.agent = value
		case "param":
			f.params = append(f.params, value)
		case "continue":
			f.continued = value
		case "reuse":
			f.reused = value
		case "to":
			f.to = value
		}
	}
	if len(words) == 0 {
		return command{}, errors.New("no command")
	}
	verb, rest := words[0], words[1:]
	cmd := command{dir: f.dir}
	switch verb {
	case "run":
		if err := f.only("dir", "process", "agent", "param", "continue", "reuse"); err != nil {
			return command{}, err
		}
		request, err := parseRun(rest, f)
		if err != nil {
			return command{}, err
		}
		cmd.run = func(c *CLI, out io.Writer, launch string) (int, error) { return c.runRequest(out, launch, request) }
		return cmd, nil
	case "status":
		return parseStatus(rest, f)
	case "runs":
		return parseRuns(rest, f)
	}
	if err := f.only("dir"); err != nil {
		return command{}, err
	}
	var list, show Kind
	if verb == "inspect" && len(rest) > 0 {
		list, show = inspected(rest[0])
	}
	switch {
	case verb == "check" && len(rest) == 0:
		cmd.run = (*CLI).check
	case list != "" && len(rest) == 1:
		cmd.run = func(c *CLI, out io.Writer, launch string) (int, error) { return c.list(out, launch, list) }
	case show != "" && len(rest) == 2:
		document := Document{Kind: show, Name: rest[1]}
		cmd.run = func(c *CLI, out io.Writer, launch string) (int, error) { return c.show(out, launch, document) }
	default:
		return command{}, fmt.Errorf("bad command %q", strings.Join(words, " "))
	}
	return cmd, nil
}
