// Package codex is the codex wrapper (ADR-001): its contract and what it
// can do (ADR-003, rule 7), in its own types, and its turn: codex exec run
// through the supervisor (ADR-003, rule 6; ADR-012, rule 6), its JSON
// events read into a reply.
package codex

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Facts are the wrapper's contract and what it can do: check output
// against a schema, resume a session, take skills, take a model, the
// efforts it accepts, report tool calls and tool commands, and how it
// takes a call's inputs.
type Facts struct {
	Contract     string
	Schema       bool
	Session      bool
	Skills       bool
	Model        bool
	Efforts      []string
	ToolCalls    bool
	ToolCommands bool
	Inputs       Inputs
}

// Inputs is how a runtime takes a call's inputs.
type Inputs int

const (
	// InEnvironment is each input a variable of its program's environment.
	InEnvironment Inputs = iota + 1
	// InMessage is each input a section of its message.
	InMessage
)

// ErrNotStarted is what the supervisor's error wraps when the program could
// not start.
var ErrNotStarted = errors.New("the program could not start")

// Supervisor runs a program and gives how it ended and what it wrote, or
// an error wrapping ErrNotStarted when it could not start. Each line of
// stdout is given to the program's Line before Run returns.
type Supervisor interface {
	Run(ctx context.Context, program Program) (Ended, error)
}

// Program is a program the supervisor runs: its name, its arguments, its
// directory, its environment, as "KEY=value", the text written to its
// stdin, and the function given each line of its stdout.
type Program struct {
	Name  string
	Args  []string
	Dir   string
	Env   []string
	Stdin string
	Line  func(line string)
}

// Ended is how a program ended and what it wrote: the code it exited with,
// or the name of the signal that ended it.
type Ended struct {
	Code           int
	Signal         string
	Stdout, Stderr Stream
}

// Stream is what the supervisor kept of one of the program's streams: its
// head and tail, its size and the digest of the whole; Incomplete when it
// was not read to its end.
type Stream struct {
	Head, Tail string
	Size       int64
	Digest     string
	Incomplete bool
}

// Turn is a message, the directory it runs in and its environment, as
// "KEY=value"; the instruction, the model and the effort, each empty where
// not given; the options, of which a turn takes exactly one, the sandbox
// it runs in; the schema its output is checked against, nil where none
// is given; and the session it resumes, "" for none.
type Turn struct {
	Message     string
	Dir         string
	Env         []string
	Instruction string
	Model       string
	Effort      string
	Options     []string
	Schema      []byte
	Session     string
}

// Report is a line a turn read: the tool call it made, where Tool is not
// nil; else another line.
type Report struct {
	Tool *Tool
}

// Tool is a tool call a turn reports: the tool's name and all it was
// given.
type Tool struct {
	Name, Input string
}

// Result is how a turn's program ended, and its reply: none where a signal
// ended it.
type Result struct {
	Ended Ended
	Reply *Reply
}

// Reply is what the runtime reported of a turn: its text, its structured
// output, nil for none, its session and its usage, and its failure class
// and reason, empty where it reports none. Codex reports no cost.
type Reply struct {
	Text    string
	Output  []byte
	Session string
	Usage   Usage
	Failure Class
	Reason  string
}

// Usage is the tokens a turn used, each nil where not reported.
type Usage struct {
	Input, Output, CacheRead, Reasoning *int64
}

// Class is the class of a turn's failure.
type Class string

const (
	RateLimited     Class = "rate_limited"
	Auth            Class = "auth"
	ContextOverflow Class = "context_overflow"
	RuntimeError    Class = "runtime_error"
	InvalidOutput   Class = "invalid_output"
	NoResult        Class = "no_result"
)

// Wrapper is the codex wrapper.
type Wrapper struct {
	supervisor Supervisor
	folder     string
}

// New gives the codex wrapper, which runs its turns through supervisor and
// writes each turn's schema in a folder of its own under folder.
func New(supervisor Supervisor, folder string) (*Wrapper, error) {
	if supervisor == nil {
		return nil, errors.New("codex: no supervisor")
	}
	if folder == "" {
		return nil, errors.New("codex: no folder")
	}
	return &Wrapper{supervisor: supervisor, folder: folder}, nil
}

// Facts gives the wrapper's facts, a new value on each call.
func (*Wrapper) Facts() Facts {
	return Facts{
		Contract:     "codex/2",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"minimal", "low", "medium", "high", "xhigh"},
		ToolCalls:    true,
		ToolCommands: true,
		Inputs:       InMessage,
	}
}

// Run runs the turn as codex exec in its directory with its environment,
// the instruction and the message on stdin, through the supervisor, and
// gives how the program ended and the reply its JSON events give; each
// line is given to report as it is read: the tool call it makes, where it
// is one the wrapper recognizes, else the line. A turn given no report, or
// not exactly one option, is an error before anything starts. The
// schema's folder is removed once the turn has returned, best effort: one
// that cannot be is left, the turn's end unchanged, since the turn has
// already run and a folder under the system's temporary folder harms
// nothing. A supervisor's error is the turn's, its error that the program
// could not start included.
func (w *Wrapper) Run(ctx context.Context, turn Turn, report func(Report)) (Result, error) {
	if report == nil {
		return Result{}, errors.New("codex: no report")
	}
	if len(turn.Options) != 1 {
		return Result{}, fmt.Errorf("codex: a turn takes exactly one option, its sandbox, given %q", turn.Options)
	}
	dir, schema, err := w.write(turn.Schema)
	if dir != "" {
		defer func() { _ = os.RemoveAll(dir) }()
	}
	if err != nil {
		return Result{}, err
	}
	read := stream{report: report, searches: map[string]bool{}}
	ended, err := w.supervisor.Run(ctx, Program{
		Name: "codex", Args: arguments(turn, schema), Dir: turn.Dir, Env: turn.Env, Stdin: prompt(turn), Line: read.line,
	})
	if err != nil {
		return Result{}, err
	}
	if ended.Signal != "" {
		return Result{Ended: ended}, nil
	}
	return Result{Ended: ended, Reply: read.reply(ended, schema != "")}, nil
}

// write writes schema, where one is given, to a file in a folder of its
// own under the wrapper's folder, and gives the folder, made even where
// the file could not be written, and the file.
func (w *Wrapper) write(schema []byte) (dir, file string, err error) {
	if len(schema) == 0 {
		return "", "", nil
	}
	dir, err = os.MkdirTemp(w.folder, "codex-schema-")
	if err != nil {
		return "", "", fmt.Errorf("codex: the schema's folder: %w", err)
	}
	file = filepath.Join(dir, "schema.json")
	if err := os.WriteFile(file, schema, 0o600); err != nil {
		return dir, "", fmt.Errorf("codex: the schema's file: %w", err)
	}
	return dir, file, nil
}

// arguments are codex's for turn, its schema's file where one is given,
// contract codex/2: the option is the sandbox, approval is never asked,
// the user's config and rules are ignored, and the prompt is read from
// stdin, "-". A session given is resumed, exec resume, its id before the
// prompt; the sandbox is then a config, since exec resume takes no
// --sandbox.
func arguments(turn Turn, schema string) []string {
	args := []string{"exec", "--json", "--skip-git-repo-check", "--sandbox", turn.Options[0]}
	if turn.Session != "" {
		args = []string{"exec", "resume", "--json", "--skip-git-repo-check", "--config", fmt.Sprintf("sandbox_mode=%q", turn.Options[0])}
	}
	args = append(args, "--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules")
	if turn.Model != "" {
		args = append(args, "--model", turn.Model)
	}
	if turn.Effort != "" {
		args = append(args, "--config", fmt.Sprintf("model_reasoning_effort=%q", turn.Effort))
	}
	if schema != "" {
		args = append(args, "--output-schema", schema)
	}
	if turn.Session != "" {
		args = append(args, turn.Session)
	}
	return append(args, "-")
}

// prompt is the turn's stdin: codex has no flag for a system prompt, so
// the instruction comes first, in an <instructions> block, where given.
func prompt(turn Turn) string {
	if turn.Instruction == "" {
		return turn.Message
	}
	return "<instructions>\n" + turn.Instruction + "\n</instructions>\n\n" + turn.Message
}
