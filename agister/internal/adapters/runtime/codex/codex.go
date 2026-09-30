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
// the turns it resumed (observed live with codex-cli 0.159.2): it counts on
// from the last token_count event of the thread's rollout, which the turn
// records as the thread's usage before it (ThreadUsage).
//
// Only turn.completed and turn.failed decide a turn. Top-level `error`
// events and error items occur mid-turn (reconnects, transport fallback)
// and are recorded, not terminal.
package codex

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	// Home is Codex's home directory, which holds the thread rollouts;
	// empty: $CODEX_HOME, else ~/.codex, as Codex itself finds it.
	Home string
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
	return app.RuntimeIdentity{Contract: Contract, Version: version, Resume: true}, nil
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
	// Read before the turn appends to the rollout.
	var before *run.SessionTotals
	if request.ResumeSessionID != "" {
		if usage := ThreadUsage(r.home(), request.ResumeSessionID); usage != nil {
			before = &run.SessionTotals{Usage: usage}
		}
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
	})
	turn := state.Reconcile(evidence, schemaPath != "")
	turn.SessionBefore = before
	return turn
}

func (r *Runner) home() string {
	if r.Home != "" {
		return r.Home
	}
	if dir := os.Getenv("CODEX_HOME"); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".codex")
}

// ThreadUsage is the usage Codex has on record for a thread: the
// total_token_usage of the last token_count event in its rollout,
// sessions/*/*/*/rollout-*-<thread>.jsonl under home, which a resume counts
// on from. Unset when there is no one such rollout, or no such event in
// it.
func ThreadUsage(home, threadID string) *run.Usage {
	if home == "" || threadID == "" || strings.ContainsAny(threadID, `/\*?[`) {
		return nil
	}
	paths, err := filepath.Glob(filepath.Join(home, "sessions", "*", "*", "*", "rollout-*-"+threadID+".jsonl"))
	if err != nil || len(paths) != 1 {
		return nil
	}
	file, err := os.Open(paths[0])
	if err != nil {
		return nil
	}
	defer file.Close()
	var total *run.Usage
	reader := bufio.NewReader(file)
	for {
		line, err := reader.ReadBytes('\n')
		if bytes.Contains(line, []byte(`"token_count"`)) {
			var entry struct {
				Type    string `json:"type"`
				Payload struct {
					Type string `json:"type"`
					Info *struct {
						Total map[string]any `json:"total_token_usage"`
					} `json:"info"`
				} `json:"payload"`
			}
			if json.Unmarshal(line, &entry) == nil && entry.Type == "event_msg" && entry.Payload.Type == "token_count" &&
				entry.Payload.Info != nil && entry.Payload.Info.Total != nil {
				total = usage(entry.Payload.Info.Total)
			}
		}
		if err == io.EOF {
			return total
		}
		if err != nil {
			return nil
		}
	}
}

// usage normalizes Codex's token usage.
func usage(source map[string]any) *run.Usage {
	return &run.Usage{
		InputTokens:     count(source, "input_tokens"),
		OutputTokens:    count(source, "output_tokens"),
		CacheReadTokens: count(source, "cached_input_tokens"),
		ReasoningTokens: count(source, "reasoning_output_tokens"),
	}
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
		turn.Session = &run.SessionTotals{Usage: usage(s.Usage)}
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
