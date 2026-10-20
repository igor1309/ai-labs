// Package claudecode is the claude-code wrapper (ADR-001): its contract and what it
// can do (ADR-003, rule 7), in its own types, and its turn: claude -p run
// through the supervisor (ADR-003, rule 6; ADR-012, rule 6), its
// stream-json read into a reply.
package claudecode

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"strings"
)

// Facts are the wrapper's contract and what it can do: check output
// against a schema, resume a session, take skills, take a model, the
// efforts it accepts, report tool calls and tool commands, take a
// budget, report a cost, and how it takes a call's inputs.
type Facts struct {
	Contract     string
	Schema       bool
	Session      bool
	Skills       bool
	Model        bool
	Efforts      []string
	ToolCalls    bool
	ToolCommands bool
	Budget       bool
	Cost         bool
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
// not given; the options, the tools the turn may use; the schema its
// output is checked against, nil where none is given; and the session it
// resumes, "" for none. SessionCostBefore is its earlier cost in US
// dollars, nil where unknown; Budget is the turn's budget, nil for none.
type Turn struct {
	Message           string
	Dir               string
	Env               []string
	Instruction       string
	Model             string
	Effort            string
	Options           []string
	Schema            []byte
	Session           string
	SessionCostBefore *float64
	Budget            *float64
}

// Report is a line a turn read: the tool call it made, where Tool is not
// nil; a tool's result, where Result is set; else another line.
type Report struct {
	Tool   *Tool
	Result bool
}

// Tool is a tool call a turn reports: the tool's name and all it was
// given, as JSON on one line.
type Tool struct {
	Name, Input string
}

// Result is how a turn's program ended; the session its stream named, read
// as it came, so that a turn a signal ended gives it too, "" for none; and
// its reply: none where a signal ended it.
type Result struct {
	Ended   Ended
	Session string
	Reply   *Reply
}

// Reply is what the runtime reported of a turn: its text, its structured
// output, nil for none, its session, its turn's own cost in US dollars,
// nil where unknown, its usage, and its session's cost after it, nil where
// unknown; whose price the cost is, "claude-code" where it is known; and
// its failure class and reason, empty where it reports none.
type Reply struct {
	Text        string
	Output      []byte
	Session     string
	Cost        *float64
	SessionCost *float64
	CostSource  string
	Usage       Usage
	Failure     Class
	Reason      string
}

// Usage is the tokens a turn used, each nil where not reported.
type Usage struct {
	Input, Output, CacheRead, CacheWrite *int64
}

// Class is the class of a turn's failure.
type Class string

const (
	BudgetExhausted Class = "budget_exhausted"
	Capacity        Class = "capacity"
	RateLimited     Class = "rate_limited"
	Auth            Class = "auth"
	ContextOverflow Class = "context_overflow"
	RuntimeError    Class = "runtime_error"
	InvalidOutput   Class = "invalid_output"
	NoResult        Class = "no_result"
)

// skill is the tool that uses the repository's skills; every turn gets it.
const skill = "Skill"

// Wrapper is the claude-code wrapper.
type Wrapper struct {
	supervisor Supervisor
}

// New gives the claude-code wrapper, which runs its turns through
// supervisor.
func New(supervisor Supervisor) (*Wrapper, error) {
	if supervisor == nil {
		return nil, errors.New("claude-code: no supervisor")
	}
	return &Wrapper{supervisor: supervisor}, nil
}

// Facts gives the wrapper's facts, a new value on each call.
func (*Wrapper) Facts() Facts {
	return Facts{
		Contract:     "claude-code/3",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"low", "medium", "high", "xhigh", "max"},
		ToolCalls:    true,
		ToolCommands: true,
		Budget:       true,
		Cost:         true,
		Inputs:       InMessage,
	}
}

// Run runs the turn as claude -p in its directory with its environment,
// the message on stdin, through the supervisor, and gives how the program
// ended and the reply its stream-json gives; each line is given to report
// as it is read: each tool_use block of it, or the line where it has none.
// The session is the one the first line naming one names, the reply's
// too. A turn given no report is an error before
// anything starts. A supervisor's error is the turn's, its error that the
// program could not start included.
func (w *Wrapper) Run(ctx context.Context, turn Turn, report func(Report)) (Result, error) {
	if report == nil {
		return Result{}, errors.New("claude-code: no report")
	}
	read := stream{report: report}
	ended, err := w.supervisor.Run(ctx, Program{
		Name: "claude", Args: arguments(turn), Dir: turn.Dir, Env: turn.Env, Stdin: turn.Message, Line: read.line,
	})
	if err != nil {
		return Result{}, err
	}
	if ended.Signal != "" {
		return Result{Ended: ended, Session: read.session}, nil
	}
	reply := read.reply(ended, len(turn.Schema) > 0)
	before := turn.SessionCostBefore
	if turn.Session == "" {
		before = new(float64)
	}
	reply.SessionCost, reply.Cost = reply.Cost, nil
	if before != nil && reply.SessionCost != nil && *reply.SessionCost >= *before {
		cost := *reply.SessionCost - *before
		reply.Cost, reply.CostSource = &cost, "claude-code"
	}
	return Result{Ended: ended, Session: read.session, Reply: reply}, nil
}

// arguments are claude's for turn, contract claude-code/3: the tools are
// the options and Skill, Skill once, given as both --tools and
// --allowedTools under --permission-mode dontAsk, so the repository's
// skills load as they would for a person there (ADR-003, rule 6); a
// session given is resumed, --resume.
func arguments(turn Turn) []string {
	tools := turn.Options
	if !slices.Contains(tools, skill) {
		tools = append(slices.Clip(tools), skill)
	}
	joined := strings.Join(tools, ",")
	args := []string{
		"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk",
		"--tools=" + joined, "--allowedTools=" + joined, "--strict-mcp-config",
	}
	if turn.Model != "" {
		args = append(args, "--model", turn.Model)
	}
	if turn.Effort != "" {
		args = append(args, "--effort", turn.Effort)
	}
	if turn.Budget != nil {
		args = append(args, "--max-budget-usd", strconv.FormatFloat(*turn.Budget, 'f', -1, 64))
	}
	if turn.Instruction != "" {
		args = append(args, "--append-system-prompt", turn.Instruction)
	}
	if len(turn.Schema) > 0 {
		args = append(args, "--json-schema", string(turn.Schema))
	}
	if turn.Session != "" {
		args = append(args, "--resume", turn.Session)
	}
	return args
}
