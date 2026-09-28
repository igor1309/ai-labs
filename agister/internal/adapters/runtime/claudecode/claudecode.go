// Package claudecode drives Claude Code headless: one `claude -p` process
// per turn, reading its stream-json protocol.
//
// Contract claude-code/1: the prompt goes on stdin; granted primitives are
// tool names passed as both --tools and --allowedTools under
// --permission-mode dontAsk; --restricted and --strict-mcp-config ignore
// user/project settings and MCP servers and confine file tools to the
// working directory. Permission mappings for this contract describe what
// each tool grants under exactly these flags.
//
// Turn outcome precedence: the runtime's `result` message, then Agister's
// timeout or cancellation, then the process exit.
package claudecode

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const Contract = "claude-code/1"

type Runner struct {
	Command   string
	KillGrace time.Duration // zero: the supervisor default
}

func New(command string) *Runner {
	if command == "" {
		command = "claude"
	}
	return &Runner{Command: command}
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
	return app.RuntimeIdentity{Contract: Contract, Version: version, PresetSessionID: true}, nil
}

func (r *Runner) ResumeHint(sessionID string) string { return "claude --resume " + sessionID }

// Arguments builds the command line for a turn.
func Arguments(request app.TurnRequest) ([]string, error) {
	for _, tool := range request.Primitives {
		if tool == "" || strings.ContainsAny(tool, ", ") {
			return nil, fmt.Errorf("invalid tool primitive %q", tool)
		}
	}
	tools := strings.Join(request.Primitives, ",")
	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--verbose",
		"--permission-mode", "dontAsk",
		"--tools=" + tools,
	}
	if tools != "" {
		args = append(args, "--allowedTools="+tools)
	}
	if request.SessionID != "" {
		args = append(args, "--session-id", request.SessionID)
	}
	args = append(args, "--restricted", "--strict-mcp-config")
	if request.Model != "" {
		args = append(args, "--model", request.Model)
	}
	if request.Effort != "" {
		args = append(args, "--effort", request.Effort)
	}
	if request.Instruction != "" {
		args = append(args, "--append-system-prompt", request.Instruction)
	}
	if len(request.OutputSchema) > 0 {
		args = append(args, "--json-schema", string(request.OutputSchema))
	}
	return args, nil
}

func (r *Runner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	args, err := Arguments(request)
	if err != nil {
		return run.Turn{Outcome: run.TurnFailed, Reason: err.Error()}
	}
	state := &Stream{RequestedSessionID: request.SessionID}
	evidence := supervisor.Run(ctx, supervisor.Spec{
		Command:   r.Command,
		Args:      args,
		Dir:       request.Cwd,
		Stdin:     request.Prompt,
		Timeout:   request.Timeout,
		KillGrace: r.KillGrace,
	}, sink, func(line string) {
		for _, event := range state.Reduce(line) {
			sink.Event(event.Source, event.Kind, event.Data)
		}
	})
	return state.Reconcile(evidence, len(request.OutputSchema) > 0)
}

// Event is a normalized observation from the stream.
type Event struct {
	Source string
	Kind   string
	Data   map[string]any
}

// Stream reduces stream-json lines.
type Stream struct {
	RequestedSessionID string
	ProviderSessionID  string
	Model              string
	LastText           string
	Result             map[string]any
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
	case "system":
		return s.system(message)
	case "assistant":
		return s.assistant(message)
	case "user":
		return s.user(message)
	case "result":
		return s.result(message)
	case "rate_limit_event":
		info, _ := message["rate_limit_info"].(map[string]any)
		if status, _ := info["status"].(string); status != "" && status != "allowed" {
			return []Event{{run.SourceProtocol, "RATE_LIMITED", map[string]any{"status": status, "resets_at": info["resetsAt"]}}}
		}
	}
	return nil
}

func (s *Stream) system(message map[string]any) []Event {
	switch message["subtype"] {
	case "init":
		sessionID, _ := message["session_id"].(string)
		s.ProviderSessionID = sessionID
		s.Model, _ = message["model"].(string)
		events := []Event{{run.SourceProtocol, "PROVIDER_SESSION_BOUND", map[string]any{
			"provider_session_id": sessionID, "model": message["model"], "tools": message["tools"], "permission_mode": message["permissionMode"],
		}}}
		if s.RequestedSessionID != "" && sessionID != s.RequestedSessionID {
			events = append(events, Event{run.SourceAgister, "SESSION_ID_MISMATCH", map[string]any{"requested": s.RequestedSessionID, "reported": sessionID}})
		}
		return events
	case "api_retry":
		return []Event{{run.SourceProtocol, "PROVIDER_RETRY", pick(message, "attempt", "max_retries", "error_status", "error")}}
	}
	return nil
}

func (s *Stream) assistant(message map[string]any) []Event {
	var events []Event
	for _, block := range blocks(message) {
		switch block["type"] {
		case "tool_use":
			input, _ := json.Marshal(block["input"])
			events = append(events, Event{run.SourceProtocol, "TOOL_REQUESTED", map[string]any{"tool_use_id": block["id"], "name": block["name"], "input": truncate(string(input), 300)}})
		case "text":
			if text, _ := block["text"].(string); strings.TrimSpace(text) != "" {
				s.LastText = text
				events = append(events, Event{run.SourceProtocol, "ASSISTANT_TEXT", map[string]any{"text": truncate(text, 500)}})
			}
		}
	}
	return events
}

func (s *Stream) user(message map[string]any) []Event {
	var events []Event
	for _, block := range blocks(message) {
		if block["type"] == "tool_result" {
			isError, _ := block["is_error"].(bool)
			events = append(events, Event{run.SourceProtocol, "TOOL_RESULT", map[string]any{"tool_use_id": block["tool_use_id"], "is_error": isError}})
		}
	}
	return events
}

func (s *Stream) result(message map[string]any) []Event {
	s.Result = message
	if s.ProviderSessionID == "" {
		s.ProviderSessionID, _ = message["session_id"].(string)
	}
	kind := "TURN_COMPLETED"
	if !succeeded(message) {
		kind = "TURN_FAILED"
	}
	data := pick(message, "subtype", "is_error", "terminal_reason", "num_turns", "duration_ms", "total_cost_usd", "errors")
	if denials, ok := message["permission_denials"].([]any); ok {
		data["permission_denials"] = len(denials)
	}
	return []Event{{run.SourceProtocol, kind, data}}
}

// Reconcile decides the turn outcome from the stream and the transport.
func (s *Stream) Reconcile(evidence supervisor.Evidence, schemaRequested bool) run.Turn {
	turn := supervisor.Base(evidence)
	turn.ProviderSessionID = s.ProviderSessionID
	turn.Model = s.Model
	result := s.Result
	if result == nil {
		return supervisor.WithoutTerminal(turn, evidence, "")
	}
	if cost, ok := result["total_cost_usd"].(float64); ok {
		turn.CostUSD = &cost
	}
	if duration, ok := result["duration_ms"].(float64); ok {
		ms := int64(duration)
		turn.DurationMS = &ms
	}
	if turns, ok := result["num_turns"].(float64); ok {
		n := int(turns)
		turn.NumTurns = &n
	}
	if usage, ok := result["usage"].(map[string]any); ok {
		turn.Usage = usage
	}
	if denials, ok := result["permission_denials"].([]any); ok {
		turn.PermissionDenials = len(denials)
	}
	turn.Text = s.LastText
	if text, ok := result["result"].(string); ok && text != "" {
		turn.Text = text
	}
	if output, ok := result["structured_output"]; ok && output != nil {
		turn.Output, _ = json.Marshal(output)
	}
	if !succeeded(result) {
		reason := fmt.Sprintf("runtime reported %v", result["subtype"])
		if errors, ok := result["errors"].([]any); ok && len(errors) > 0 {
			reason += ": " + fmt.Sprint(errors...)
		}
		turn.Outcome, turn.Reason = run.TurnFailed, reason
		return turn
	}
	if schemaRequested && len(turn.Output) == 0 {
		turn.Outcome, turn.Reason = run.TurnFailed, "no structured output"
		return turn
	}
	turn.Outcome = run.TurnCompleted
	return turn
}

func succeeded(result map[string]any) bool {
	isError, _ := result["is_error"].(bool)
	return result["subtype"] == "success" && !isError
}

func blocks(message map[string]any) []map[string]any {
	inner, _ := message["message"].(map[string]any)
	content, _ := inner["content"].([]any)
	var out []map[string]any
	for _, item := range content {
		if block, ok := item.(map[string]any); ok {
			out = append(out, block)
		}
	}
	return out
}

func pick(source map[string]any, keys ...string) map[string]any {
	out := map[string]any{}
	for _, key := range keys {
		if value, ok := source[key]; ok {
			out[key] = value
		}
	}
	return out
}

func truncate(text string, max int) string {
	if len(text) <= max {
		return text
	}
	return text[:max] + "…"
}
