// Package codex drives Codex: one `codex exec --json` process per turn,
// reading its JSONL thread events.
//
// Contract codex/2: exactly one primitive, the sandbox mode (read-only or
// workspace-write); approval_policy="never"; --ignore-user-config and
// --ignore-rules; the prompt on stdin with the instruction prepended in an
// <instructions> block; structured output constrained by an
// --output-schema file and returned as the final agent message.
//
// Agister never chooses the thread ID; Codex reports it in thread.started.
// A continuation runs `codex exec resume <thread_id>` with the same
// settings, the sandbox mode as -c sandbox_mode (resume has no --sandbox),
// and the turn must report that same thread, or it fails. Codex cannot
// limit cost. The usage turn.completed reports is the thread's, counting
// the turns it resumed (observed live with codex-cli 0.159.2).
//
// Codex reports no cost. The thread's cost, every turn it had, is
// ccusage's: `ccusage codex session --json` prices each session from its
// rollout (observed with ccusage 20.0.26), read after the turn within
// what is left of the turn's timeout. The lookup is supervised as the
// runtime process is: its group is on record, and ended on timeout or
// cancellation. A lookup that fails leaves the cost unknown, and nothing
// else about the turn.
//
// Tool calls are reported as they start and finish: item.started and
// item.completed of a command execution, file change, MCP call or web
// search, with the item's whole input. A command execution is the tool that
// runs commands.
//
// Only turn.completed and turn.failed decide a turn. Top-level `error`
// events and error items occur mid-turn (reconnects, transport fallback)
// and are recorded, not terminal.
//
// A turn Codex refuses before it starts ends with a non-zero exit and its
// reason on stderr only, as a prompt over the input limit does
// (input_too_large, observed with codex-cli 0.159.2); the error message
// quotes it (supervisor.WithoutTerminal).
package codex

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const Contract = "codex/2"

var sandboxModes = []string{"read-only", "workspace-write"}

type Runner struct {
	Command   string
	KillGrace time.Duration
	// Sessions lists Codex sessions with their costs, as
	// `ccusage codex session --json` does; nil: the cost is unknown.
	Sessions Sessions
	// Now tells the time the turn's timeout is measured by; nil: time.Now.
	Now func() time.Time
}

// Sessions returns the output of `ccusage codex session --json`, ending
// the lookup once timeout passes or ctx ends. It reports its process to
// sink as the runtime's is reported.
type Sessions func(ctx context.Context, timeout time.Duration, sink LookupSink) ([]byte, error)

// LookupSink is what a lookup reports to: its events and its process, as
// the turn's sink takes them. A lookup has no raw output to report.
type LookupSink interface {
	Event(source, kind string, data map[string]any)
	ProcessStarted(ref string) error
}

func New(command string) *Runner {
	if command == "" {
		command = "codex"
	}
	return &Runner{Command: command, Sessions: CCUsage("ccusage", 0)}
}

// CCUsage runs `<command> codex session --json` under the supervisor, in a
// process group of its own that is ended on timeout or cancellation;
// killGrace bounds the wait for it as it does a runtime's (zero: the
// supervisor's default). Anything but a clean exit is an error. Its output
// is the listing, not the turn's raw output.
func CCUsage(command string, killGrace time.Duration) Sessions {
	return func(ctx context.Context, timeout time.Duration, sink LookupSink) ([]byte, error) {
		var listing bytes.Buffer
		evidence := supervisor.Run(ctx, supervisor.Spec{
			Command:   command,
			Args:      []string{"codex", "session", "--json"},
			Timeout:   timeout,
			KillGrace: killGrace,
		}, lookupSink{sink}, func(line string) {
			listing.WriteString(line)
			listing.WriteByte('\n')
		})
		switch exit := evidence.Exit; {
		case evidence.SpawnError != "":
			return nil, errors.New(evidence.SpawnError)
		case evidence.RecordError != "":
			return nil, fmt.Errorf("recording the lookup failed: %s", evidence.RecordError)
		case evidence.TimedOut:
			return nil, fmt.Errorf("timed out after %s", timeout)
		case evidence.Aborted:
			return nil, errors.New("cancelled")
		case exit == nil || exit.Code == nil || *exit.Code != 0:
			return nil, fmt.Errorf("%s exited without a listing: %s", command, supervisor.Reason(evidence))
		}
		return listing.Bytes(), nil
	}
}

// lookupSink gives the supervisor a lookup's sink: its output is the
// listing, not the runtime's raw output, so Raw drops it.
type lookupSink struct{ LookupSink }

func (lookupSink) Raw(string) {}

// A lookup calls no tools.
func (lookupSink) ToolStarted(app.ToolCall) {}

func (lookupSink) ToolFinished(string) {}

// ThreadCost is a thread's cost, every turn it had, from a sessions
// listing: the costUSD of the one session whose sessionId, a rollout path,
// ends in the thread ID. Unknown when there is no such session, or more
// than one, or its cost is not above zero.
func ThreadCost(listing []byte, threadID string) *float64 {
	var sessions struct {
		Sessions []struct {
			SessionID string   `json:"sessionId"`
			CostUSD   *float64 `json:"costUSD"`
		} `json:"sessions"`
	}
	if threadID == "" || json.Unmarshal(listing, &sessions) != nil {
		return nil
	}
	var cost *float64
	for _, session := range sessions.Sessions {
		if !strings.HasSuffix(session.SessionID, "-"+threadID) {
			continue
		}
		if cost != nil {
			return nil
		}
		cost = session.CostUSD
		if cost == nil || *cost <= 0 {
			return nil
		}
	}
	return cost
}

var versionPattern = regexp.MustCompile(`\d+\.\d+\.\d+`)

func (r *Runner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	out, err := supervisor.Version(ctx, r.Command)
	if err != nil {
		return app.RuntimeIdentity{}, err
	}
	version := versionPattern.FindString(out)
	if version == "" {
		return app.RuntimeIdentity{}, fmt.Errorf("unrecognized version output %q", out)
	}
	return app.RuntimeIdentity{Contract: Contract, Version: version, Resume: true, ToolCalls: true}, nil
}

// Arguments builds the command line for a turn.
func Arguments(request app.TurnRequest, schemaPath string) ([]string, error) {
	if len(request.Primitives) != 1 || !contains(sandboxModes, request.Primitives[0]) {
		return nil, fmt.Errorf("codex needs exactly one sandbox mode primitive (%s), got %v", strings.Join(sandboxModes, ", "), request.Primitives)
	}
	if request.MaxCostUSD != nil {
		return nil, fmt.Errorf("codex/2 cannot limit cost")
	}
	args := []string{"exec", "--json", "--skip-git-repo-check", "--sandbox", request.Primitives[0]}
	if request.ResumeSessionID != "" {
		args = []string{
			"exec", "resume", request.ResumeSessionID, "--json", "--skip-git-repo-check",
			"--config", fmt.Sprintf("sandbox_mode=%q", request.Primitives[0]),
		}
	}
	args = append(args,
		"--config", `approval_policy="never"`,
		"--ignore-user-config", "--ignore-rules",
	)
	if request.Model != "" {
		args = append(args, "--model", request.Model)
	}
	if request.Effort != "" {
		args = append(args, "--config", fmt.Sprintf("model_reasoning_effort=%q", request.Effort))
	}
	if schemaPath != "" {
		args = append(args, "--output-schema", schemaPath)
	}
	return append(args, "-"), nil
}

// Prompt prepends the instruction; Codex has no system-prompt flag.
func Prompt(request app.TurnRequest) string {
	if request.Instruction == "" {
		return request.Prompt
	}
	return "<instructions>\n" + request.Instruction + "\n</instructions>\n\n" + request.Prompt
}

func (r *Runner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	now := r.Now
	if now == nil {
		now = time.Now
	}
	deadline := now().Add(request.Timeout)
	var schemaPath string
	if len(request.OutputSchema) > 0 {
		dir, err := os.MkdirTemp("", "agister-codex-")
		if err != nil {
			return supervisor.Failed(run.ClassInternal, err)
		}
		defer os.RemoveAll(dir)
		schemaPath = filepath.Join(dir, "output-schema.json")
		if err := os.WriteFile(schemaPath, request.OutputSchema, 0o600); err != nil {
			return supervisor.Failed(run.ClassInternal, err)
		}
	}
	args, err := Arguments(request, schemaPath)
	if err != nil {
		return supervisor.Failed(run.ClassInternal, err)
	}
	state := &Stream{ResumedThreadID: request.ResumeSessionID}
	evidence := supervisor.Run(ctx, supervisor.Spec{
		Command:   r.Command,
		Args:      args,
		Dir:       request.Cwd,
		Stdin:     Prompt(request),
		Timeout:   request.Timeout,
		KillGrace: r.KillGrace,
	}, sink, func(line string) {
		for _, event := range state.Reduce(line) {
			sink.Event(event.Source, event.Kind, event.Data)
		}
		for _, tool := range state.TakeTools() {
			if tool.Started != nil {
				sink.ToolStarted(*tool.Started)
			} else {
				sink.ToolFinished(tool.Finished)
			}
		}
	})
	turn := state.Reconcile(evidence, schemaPath != "")
	r.cost(ctx, &turn, request.ResumeSessionID, deadline.Sub(now()), sink)
	return turn
}

// cost sets the thread's cost on a turn that reported the thread it ran
// on, looking it up within left, what remains of the turn's timeout; a
// failed, timed-out or cancelled lookup leaves it unknown, and none is
// started once the turn's time is up or its call is cancelled.
func (r *Runner) cost(ctx context.Context, turn *run.Turn, resumed string, left time.Duration, sink LookupSink) {
	thread := turn.ProviderSessionID
	if r.Sessions == nil || thread == "" || resumed != "" && thread != resumed || left <= 0 || ctx.Err() != nil {
		return
	}
	listing, err := r.Sessions(ctx, left, sink)
	if err != nil {
		return
	}
	cost := ThreadCost(listing, thread)
	if cost == nil {
		return
	}
	if turn.Session == nil {
		turn.Session = &run.SessionTotals{}
	}
	turn.Session.CostUSD = cost
}

type Event struct {
	Source string
	Kind   string
	Data   map[string]any
}

// Stream reduces Codex JSONL events.
type Stream struct {
	// The thread a resume turn resumes; the turn must report it.
	ResumedThreadID string
	ThreadID        string
	LastMessage     string
	LastError       string
	Completed       bool
	Failed          string
	Usage           map[string]any
	// tools are the tool calls reduced and not yet taken (TakeTools).
	tools []Tool
}

// Tool is a tool call the stream reported: its start, or the ID of the one
// that finished.
type Tool struct {
	Started  *app.ToolCall
	Finished string
}

// TakeTools returns the tool calls reduced since it was last called, in
// order.
func (s *Stream) TakeTools() []Tool {
	tools := s.tools
	s.tools = nil
	return tools
}

func (s *Stream) Reduce(line string) []Event {
	if strings.TrimSpace(line) == "" {
		return nil
	}
	var message map[string]any
	if err := json.Unmarshal([]byte(line), &message); err != nil {
		return []Event{{run.SourceAgister, "STREAM_PARSE_ERROR", map[string]any{"line": truncate(line, 200)}}}
	}
	switch message["type"] {
	case "thread.started":
		s.ThreadID, _ = message["thread_id"].(string)
		return []Event{{run.SourceProtocol, "PROVIDER_SESSION_BOUND", map[string]any{"provider_session_id": s.ThreadID}}}
	case "turn.started":
		return []Event{{run.SourceProtocol, "TURN_STARTED", nil}}
	case "item.started":
		item, _ := message["item"].(map[string]any)
		if name := toolName(item); name != "" {
			id, _ := item["id"].(string)
			s.tools = append(s.tools, Tool{Started: &app.ToolCall{ID: id, Name: name, Input: wholeInput(item), Command: item["type"] == "command_execution"}})
			return []Event{{run.SourceProtocol, "TOOL_REQUESTED", map[string]any{"tool_use_id": item["id"], "name": name, "input": toolInput(item)}}}
		}
	case "item.completed":
		item, _ := message["item"].(map[string]any)
		return s.itemCompleted(item)
	case "error":
		s.LastError = fmt.Sprint(message["message"])
		return []Event{{run.SourceProtocol, "PROVIDER_ERROR", map[string]any{"message": truncate(s.LastError, 300)}}}
	case "turn.completed":
		s.Completed = true
		s.Usage, _ = message["usage"].(map[string]any)
		return []Event{{run.SourceProtocol, "TURN_COMPLETED", map[string]any{"usage": s.Usage}}}
	case "turn.failed":
		failure, _ := message["error"].(map[string]any)
		s.Failed = fmt.Sprint(failure["message"])
		if s.Failed == "" || s.Failed == "<nil>" {
			s.Failed = "unknown error"
		}
		return []Event{{run.SourceProtocol, "TURN_FAILED", map[string]any{"error": s.Failed}}}
	}
	return nil
}

func (s *Stream) itemCompleted(item map[string]any) []Event {
	switch item["type"] {
	case "agent_message":
		text, _ := item["text"].(string)
		s.LastMessage = text
		return []Event{{run.SourceProtocol, "ASSISTANT_TEXT", map[string]any{"text": truncate(text, 500)}}}
	case "error":
		return []Event{{run.SourceProtocol, "PROVIDER_ERROR", map[string]any{"message": truncate(fmt.Sprint(item["message"]), 300)}}}
	case "command_execution", "file_change", "mcp_tool_call", "web_search":
		if id, _ := item["id"].(string); id != "" {
			s.tools = append(s.tools, Tool{Finished: id})
		}
		failed := item["status"] == "failed"
		if code, ok := item["exit_code"].(float64); ok && code != 0 {
			failed = true
		}
		return []Event{{run.SourceProtocol, "TOOL_RESULT", map[string]any{"tool_use_id": item["id"], "is_error": failed}}}
	}
	return nil
}

// Reconcile decides the turn outcome from the stream and the transport.
func (s *Stream) Reconcile(evidence supervisor.Evidence, schemaRequested bool) run.Turn {
	turn := supervisor.Base(evidence)
	if failed, ok := supervisor.RecordFailure(turn, evidence); ok {
		return failed
	}
	turn.ProviderSessionID = s.ThreadID
	if s.resumedElsewhere() {
		turn.Status, turn.Error = run.Failed, run.Fault(run.ClassRuntimeError, "resumed thread %s, but the runtime reported thread %q", s.ResumedThreadID, s.ThreadID)
		return turn
	}
	if !s.Completed && s.Failed == "" {
		return supervisor.WithoutTerminal(turn, evidence, s.LastError)
	}
	turn.Text = s.LastMessage
	if s.Failed != "" {
		turn.Status, turn.Error = run.Failed, classify(s.Failed)
		return turn
	}
	// The thread's usage, every turn it had; the turn's own is derived.
	if s.Usage != nil {
		turn.Session = &run.SessionTotals{Usage: &run.Usage{
			InputTokens:     count(s.Usage, "input_tokens"),
			OutputTokens:    count(s.Usage, "output_tokens"),
			CacheReadTokens: count(s.Usage, "cached_input_tokens"),
			ReasoningTokens: count(s.Usage, "reasoning_output_tokens"),
		}}
	}
	if schemaRequested {
		if s.LastMessage == "" {
			turn.Status, turn.Error = run.Failed, run.Fault(run.ClassInvalidOutput, "no structured output")
			return turn
		}
		if !json.Valid([]byte(s.LastMessage)) {
			turn.Status, turn.Error = run.Failed, run.Fault(run.ClassInvalidOutput, "structured output is not JSON")
			return turn
		}
		turn.Output = json.RawMessage(s.LastMessage)
	}
	turn.Status = run.Completed
	return turn
}

// resumedElsewhere reports a resume turn that started another thread, or
// ended without reporting one, which breaks the contract of resuming in
// place.
func (s *Stream) resumedElsewhere() bool {
	reported := s.ThreadID != "" || s.Completed || s.Failed != ""
	return s.ResumedThreadID != "" && reported && s.ThreadID != s.ResumedThreadID
}

// classify maps a turn.failed message to a failure class. Codex reports
// failures as text only; none of these has been observed live.
func classify(message string) *run.Error {
	lower := strings.ToLower(message)
	class := run.ClassRuntimeError
	switch {
	case strings.Contains(lower, "rate limit") || strings.Contains(lower, "usage limit") || strings.Contains(lower, "429"):
		class = run.ClassRateLimited
	case strings.Contains(lower, "unauthorized") || strings.Contains(lower, "401") || strings.Contains(lower, "login"):
		class = run.ClassAuth
	case strings.Contains(lower, "context window") || strings.Contains(lower, "context length"):
		class = run.ClassContextOverflow
	}
	return run.Fault(class, "runtime reported turn.failed: %s", message)
}

func count(source map[string]any, key string) *int64 {
	value, ok := source[key].(float64)
	if !ok {
		return nil
	}
	n := int64(value)
	return &n
}

func toolName(item map[string]any) string {
	switch item["type"] {
	case "command_execution":
		return "command"
	case "file_change":
		return "file_change"
	case "mcp_tool_call":
		return fmt.Sprintf("mcp:%v/%v", item["server"], item["tool"])
	case "web_search":
		return "web_search"
	}
	return ""
}

// toolInput is the item's input, bounded, as an event quotes it.
func toolInput(item map[string]any) string {
	return truncate(wholeInput(item), 300)
}

// wholeInput is the item's input: the same text for the same input.
func wholeInput(item map[string]any) string {
	for _, key := range []string{"command", "query", "changes", "arguments"} {
		if value, ok := item[key]; ok {
			if text, ok := value.(string); ok {
				return text
			}
			data, _ := json.Marshal(value)
			return string(data)
		}
	}
	return ""
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func truncate(text string, max int) string {
	if len(text) <= max {
		return text
	}
	return text[:max] + "…"
}
