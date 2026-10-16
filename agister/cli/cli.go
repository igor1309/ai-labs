// Package cli is the command line (ADR-001): it turns "agister check" and
// "agister inspect" into requests on the port it declares, and prints what
// the port gives. It is given its arguments, its working directory, the
// user's home directory and its output streams (ADR-009, rule 2); the
// composition answers its port.
package cli

import (
	"errors"
	"fmt"
	"io"
	"path/filepath"
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

// Where is where a command reads the settings: its launch directory and
// home's folder.
type Where struct {
	Launch string
	Home   string
}

// Settings is the port: what the command line asks of the settings at
// where. Check gives every fault and every name; List the names of the
// process, workflow or agent kind; Show one process, workflow or agent.
type Settings interface {
	Check(where Where) (Report, error)
	List(where Where, kind Kind) ([]Listed, error)
	Show(where Where, document Document) (Shown, error)
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

// Exit codes: a fault reported, or a document no layer holds; a bad
// command.
const (
	exitFault = 1
	exitUsage = 2
)

const usage = `usage:
  agister check [--dir <directory>]
  agister inspect processes|workflows|agents [--dir <directory>]
  agister inspect process|workflow|agent <name> [--dir <directory>]
`

// CLI runs commands against its settings, printing to its streams.
type CLI struct {
	settings Settings
	stdout   io.Writer
	stderr   io.Writer
}

// New gives a command line asking settings, printing what it gives to
// stdout, and a bad command's usage and a failure to stderr.
func New(settings Settings, stdout, stderr io.Writer) (*CLI, error) {
	if settings == nil {
		return nil, errors.New("cli: no settings")
	}
	if stdout == nil {
		return nil, errors.New("cli: no stdout")
	}
	if stderr == nil {
		return nil, errors.New("cli: no stderr")
	}
	return &CLI{settings: settings, stdout: stdout, stderr: stderr}, nil
}

// Run runs the command args, the program's name left out, in the working
// directory dir, for the user whose home directory is userHome, and gives
// its exit code. The launch directory is --dir, relative to dir, or dir;
// home's folder is userHome's ".agister" (ADR-002, rule 2).
func (c *CLI) Run(args []string, dir, userHome string) int {
	cmd, err := parse(args)
	if err != nil {
		fmt.Fprintf(c.stderr, "agister: %v\n%s", err, usage)
		return exitUsage
	}
	where := Where{Launch: dir, Home: filepath.Join(userHome, ".agister")}
	if cmd.dir != "" {
		where.Launch = cmd.dir
		if !filepath.IsAbs(cmd.dir) {
			where.Launch = filepath.Join(dir, cmd.dir)
		}
	}
	code, err := cmd.run(c, where)
	if err != nil {
		fmt.Fprintf(c.stderr, "agister: %v\n", err)
		return exitFault
	}
	return code
}

// command is a command parsed: what it runs, and the launch directory
// --dir gives, "" for none.
type command struct {
	run func(c *CLI, where Where) (int, error)
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

// parse parses args: the words of a command, and --dir anywhere among
// them.
func parse(args []string) (command, error) {
	var cmd command
	var words []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if !strings.HasPrefix(arg, "-") {
			words = append(words, arg)
			continue
		}
		flag, value, given := strings.Cut(strings.TrimPrefix(strings.TrimPrefix(arg, "-"), "-"), "=")
		if flag != "dir" {
			return command{}, fmt.Errorf("unknown flag %s", arg)
		}
		if !given {
			if i+1 == len(args) {
				return command{}, fmt.Errorf("%s needs a directory", arg)
			}
			i++
			value = args[i]
		}
		if value == "" {
			return command{}, fmt.Errorf("%s needs a directory", arg)
		}
		cmd.dir = value
	}
	if len(words) == 0 {
		return command{}, errors.New("no command")
	}
	verb, rest := words[0], words[1:]
	var list, show Kind
	if verb == "inspect" && len(rest) > 0 {
		list, show = inspected(rest[0])
	}
	switch {
	case verb == "check" && len(rest) == 0:
		cmd.run = (*CLI).check
	case list != "" && len(rest) == 1:
		cmd.run = func(c *CLI, where Where) (int, error) { return c.list(where, list) }
	case show != "" && len(rest) == 2:
		document := Document{Kind: show, Name: rest[1]}
		cmd.run = func(c *CLI, where Where) (int, error) { return c.show(where, document) }
	default:
		return command{}, fmt.Errorf("bad command %q", strings.Join(words, " "))
	}
	return cmd, nil
}
