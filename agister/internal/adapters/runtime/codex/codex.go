// Package codex drives Codex: one `codex exec --json` process per turn,
// reading its JSONL thread events.
//
// Contract codex/1: exactly one primitive, the sandbox mode (read-only or
// workspace-write); approval_policy="never"; --ignore-user-config and
// --ignore-rules; the prompt on stdin with the instruction prepended in an
// <instructions> block; structured output constrained by an
// --output-schema file and returned as the final agent message.
//
// Only turn.completed and turn.failed decide a turn. Top-level `error`
// events and error items occur mid-turn (reconnects, transport fallback)
// and are recorded, not terminal.
package codex

import (
	"context"
	"encoding/json"
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

const Contract = "codex/1"

var sandboxModes = []string{"read-only", "workspace-write"}

type Runner struct {
	Command   string
	KillGrace time.Duration
}

func New(command string) *Runner {
	if command == "" {
		command = "codex"
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
	return app.RuntimeIdentity{Contract: Contract, Version: version}, nil
}

func (r *Runner) ResumeHint(sessionID string) string { return "codex resume " + sessionID }

// Arguments builds the command line for a turn.
func Arguments(request app.TurnRequest, schemaPath string) ([]string, error) {
	if len(request.Primitives) != 1 || !contains(sandboxModes, request.Primitives[0]) {
		return nil, fmt.Errorf("codex needs exactly one sandbox mode primitive (%s), got %v", strings.Join(sandboxModes, ", "), request.Primitives)
	}
	if request.SessionID != "" {
		return nil, fmt.Errorf("codex cannot preset a session ID")
	}
	args := []string{
		"exec", "--json", "--skip-git-repo-check",
		"--sandbox", request.Primitives[0],
		"--config", `approval_policy="never"`,
		"--ignore-user-config", "--ignore-rules",
	}
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
	var schemaPath string
	if len(request.OutputSchema) > 0 {
		dir, err := os.MkdirTemp("", "agister-codex-")
		if err != nil {
			return run.Turn{Outcome: run.TurnFailed, Reason: err.Error()}
		}
		defer os.RemoveAll(dir)
		schemaPath = filepath.Join(dir, "output-schema.json")
		if err := os.WriteFile(schemaPath, request.OutputSchema, 0o600); err != nil {
			return run.Turn{Outcome: run.TurnFailed, Reason: err.Error()}
		}
	}
	args, err := Arguments(request, schemaPath)
	if err != nil {
		return run.Turn{Outcome: run.TurnFailed, Reason: err.Error()}
	}
	state := &Stream{}
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
	})
	return state.Reconcile(evidence, schemaPath != "")
}

type Event struct {
	Source string
	Kind   string
	Data   map[string]any
}

// Stream reduces Codex JSONL events.
type Stream struct {
	ThreadID    string
	LastMessage string
	LastError   string
	Completed   bool
	Failed      string
	Usage       map[string]any
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
	turn.ProviderSessionID = s.ThreadID
	if !s.Completed && s.Failed == "" {
		return supervisor.WithoutTerminal(turn, evidence, s.LastError)
	}
	turn.Text = s.LastMessage
	if s.Failed != "" {
		turn.Outcome, turn.Reason = run.TurnFailed, "runtime reported turn.failed: "+s.Failed
		return turn
	}
	turn.Usage = s.Usage
	if schemaRequested {
		if s.LastMessage == "" {
			turn.Outcome, turn.Reason = run.TurnFailed, "no structured output"
			return turn
		}
		if !json.Valid([]byte(s.LastMessage)) {
			turn.Outcome, turn.Reason = run.TurnFailed, "structured output is not JSON"
			return turn
		}
		turn.Output = json.RawMessage(s.LastMessage)
	}
	turn.Outcome = run.TurnCompleted
	return turn
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

func toolInput(item map[string]any) string {
	for _, key := range []string{"command", "query", "changes", "arguments"} {
		if value, ok := item[key]; ok {
			if text, ok := value.(string); ok {
				return truncate(text, 300)
			}
			data, _ := json.Marshal(value)
			return truncate(string(data), 300)
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
