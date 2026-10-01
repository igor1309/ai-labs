// Package pi drives Pi (@earendil-works/pi-coding-agent): one
// `pi -p --mode json` process per turn, reading its JSON event stream
// (docs/json.md of the installed package).
//
// Contract pi/1: extensions, prompt templates and themes are off
// (--no-extensions, --no-prompt-templates, --no-themes), so a user's Pi
// packages, a tracing extension among them, never run inside a call.
// Context files and skills discovery stay on: Pi loads the working
// directory's AGENTS.md and CLAUDE.md whatever the project trust, but
// project .agents/skills and .pi resources only in a trusted project, and
// a non-interactive run without a saved trust decision ignores them
// (docs/security.md, docs/settings.md). So every turn passes --approve:
// the checkout's skills reach the call as they would for a person who
// trusts the repository (ADR-006). That also trusts the checkout's
// .pi/settings.json; its extensions still do not load, and Pi starts
// offline (--offline, as PI_OFFLINE=1): at startup Pi installs a package
// that file lists and is missing (npm install into .pi/npm), extensions
// off or not, unless it is offline. Context files and skills load offline
// as they do online. A skill is used by reading it, and Pi reads with read
// or bash only; with no tool, Pi leaves skills out. So a turn granted
// neither is refused before Pi starts (SkillTools), and --no-tools is
// never passed.
//
// Granted primitives are Pi tool names (read, bash, edit, write, grep,
// find, ls), passed as the --tools allowlist.
// Pi has no sandbox: its file tools are not confined to the working
// directory, and bash reaches whatever the user can. The model goes as
// --model (provider/id) and the effort as --thinking. The instruction, and
// the output schema when one is given, are appended to the system prompt
// from a file (--append-system-prompt reads a path that exists as the
// file's text); the prompt goes on stdin, which print mode reads as the
// message (docs/usage.md). Pi has no structured output: the final
// assistant text is the output, and must be JSON when a schema is given;
// a completed turn's text is the final message's, never earlier
// commentary.
// Pi cannot limit cost.
//
// Sessions are kept in a directory Agister chooses (--session-dir), never
// in ~/.pi: under Sessions, a fresh turn's in a new directory, renamed
// after the turn to the session ID Pi reported in the stream's session
// header. Agister never chooses the ID. A continuation resumes that
// session in place (--session <id>, with the same --session-dir), and the
// turn must report that same session, or it fails. Pi finds a session by
// ID only among those of its working directory; from another one it asks
// on stdin whether to fork it. So a session resumes only where it ran
// (RuntimeIdentity.ResumeWhereItRan): a call's later turns resume it, and
// so does a continuation from the same directory; the core refuses any
// other continuation before it makes a workspace, and a resume turn
// elsewhere still fails before Pi starts.
//
// Tool calls are reported as they start and finish: tool_execution_start
// with the tool's whole arguments, and tool_execution_end. bash is the
// tool that runs commands. Usage and cost are the turn's own: the token
// counts and cost.total of each message it ended (message_end), summed,
// and of each automatic compaction's summary (compaction_end's
// result.usage, docs/rpc.md); a figure some assistant message or
// compaction does not report is unknown.
//
// Only agent_end decides a turn, unless Pi will retry it (willRetry) or
// goes on after it: one agent_end ends one agent run, and Pi may still
// compact the context and continue the turn (docs/rpc.md), which
// compaction_end's willRetry and the next agent_start say. Pi reports a
// failed turn in its final assistant message, whose stopReason is not
// "stop", and exits 0 all the same; a turn that ends without agent_end is
// decided by the transport, quoting stderr (supervisor.WithoutTerminal).
package pi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const Contract = "pi/1"

// Tools are Pi's built-in tools, the primitives of contract pi/1.
var Tools = []string{"read", "bash", "edit", "write", "grep", "find", "ls"}

// ThinkingLevels are what --thinking takes, the efforts of contract pi/1.
var ThinkingLevels = []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"}

// commandTool is the tool that runs commands.
const commandTool = "bash"

// SkillTools are the tools Pi reads a skill with; a turn needs one of them.
var SkillTools = []string{"read", commandTool}

type Runner struct {
	Command   string
	KillGrace time.Duration // zero: the supervisor default
	// Sessions is the directory Pi's sessions are kept under, one
	// directory per session, named by its ID; empty: agister-pi-sessions
	// in the temporary directory.
	Sessions string
}

func New(command, sessions string) *Runner {
	if command == "" {
		command = "pi"
	}
	return &Runner{Command: command, Sessions: sessions}
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
	return app.RuntimeIdentity{Contract: Contract, Version: version, Resume: true, ResumeWhereItRan: true, ToolCalls: true, SkillTools: slices.Clone(SkillTools)}, nil
}

// Arguments builds the command line for a turn whose sessions are kept in
// sessionDir and whose system prompt addition is the file systemPrompt
// (none when empty).
func Arguments(request app.TurnRequest, sessionDir, systemPrompt string) ([]string, error) {
	if request.MaxCostUSD != nil {
		return nil, errors.New("pi/1 cannot limit cost")
	}
	for _, tool := range request.Primitives {
		if !slices.Contains(Tools, tool) {
			return nil, fmt.Errorf("pi/1 has no tool %q (tools: %s)", tool, strings.Join(Tools, ", "))
		}
	}
	if !slices.ContainsFunc(SkillTools, func(tool string) bool { return slices.Contains(request.Primitives, tool) }) {
		return nil, errors.New("pi/1 needs read or bash to use the repository's skills (ADR-006)")
	}
	if request.Effort != "" && !slices.Contains(ThinkingLevels, request.Effort) {
		return nil, fmt.Errorf("pi/1 has no thinking level %q (levels: %s)", request.Effort, strings.Join(ThinkingLevels, ", "))
	}
	args := []string{
		"-p", "--mode", "json",
		"--no-extensions", "--no-prompt-templates", "--no-themes",
		"--approve", "--offline",
		"--session-dir", sessionDir,
	}
	if request.ResumeSessionID != "" {
		args = append(args, "--session", request.ResumeSessionID)
	}
	if request.Model != "" {
		args = append(args, "--model", request.Model)
	}
	if request.Effort != "" {
		args = append(args, "--thinking", request.Effort)
	}
	args = append(args, "--tools", strings.Join(request.Primitives, ","))
	if systemPrompt != "" {
		args = append(args, "--append-system-prompt", systemPrompt)
	}
	return args, nil
}

// SystemPrompt is what a turn appends to Pi's system prompt: the
// instruction, then the output schema the final answer must meet; empty
// when there is neither.
func SystemPrompt(request app.TurnRequest) string {
	var parts []string
	if request.Instruction != "" {
		parts = append(parts, request.Instruction)
	}
	if len(request.OutputSchema) > 0 {
		parts = append(parts, "Your final answer is your output: reply with only one JSON value that this JSON Schema accepts, "+
			"with no other text and no Markdown fence.\n<output-schema>\n"+string(request.OutputSchema)+"\n</output-schema>")
	}
	return strings.Join(parts, "\n\n")
}

func (r *Runner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	root := r.Sessions
	if root == "" {
		root = filepath.Join(os.TempDir(), "agister-pi-sessions")
	}
	sessionDir, err := r.sessionDir(root, request)
	if err != nil {
		return supervisor.Failed(run.ClassRuntimeError, err)
	}
	var systemPrompt string
	if text := SystemPrompt(request); text != "" {
		dir, err := os.MkdirTemp("", "agister-pi-")
		if err != nil {
			return supervisor.Failed(run.ClassInternal, err)
		}
		defer os.RemoveAll(dir)
		systemPrompt = filepath.Join(dir, "system-prompt.md")
		if err := os.WriteFile(systemPrompt, []byte(text), 0o600); err != nil {
			return supervisor.Failed(run.ClassInternal, err)
		}
	}
	args, err := Arguments(request, sessionDir, systemPrompt)
	if err != nil {
		if request.ResumeSessionID == "" {
			os.RemoveAll(sessionDir)
		}
		return supervisor.Failed(run.ClassInternal, err)
	}
	state := &Stream{ResumedSessionID: request.ResumeSessionID}
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
		for _, tool := range state.TakeTools() {
			if tool.Started != nil {
				sink.ToolStarted(*tool.Started)
			} else {
				sink.ToolFinished(tool.Finished)
			}
		}
	})
	if request.ResumeSessionID == "" {
		keep(root, sessionDir, state.SessionID)
	}
	return state.Reconcile(evidence, len(request.OutputSchema) > 0)
}

// sessionDir is the directory a turn's session is kept in: a new one
// under root for a fresh session, the session's own for a resumed one,
// which must hold that session, started in the turn's working directory.
func (r *Runner) sessionDir(root string, request app.TurnRequest) (string, error) {
	if request.ResumeSessionID == "" {
		if err := os.MkdirAll(root, 0o700); err != nil {
			return "", err
		}
		return os.MkdirTemp(root, "new-")
	}
	id := request.ResumeSessionID
	if !validID(id) {
		return "", fmt.Errorf("pi/1 cannot resume session %q: not a session ID", id)
	}
	dir := filepath.Join(root, id)
	cwd, found := sessionCwd(dir, id)
	if !found {
		return "", fmt.Errorf("pi/1 cannot resume session %s: it is not under %s", id, root)
	}
	here := request.Cwd
	if here == "" {
		here, _ = os.Getwd()
	}
	if canonical(cwd) != canonical(here) {
		return "", fmt.Errorf("pi/1 resumes session %s only in the directory it ran in, %s, not %s", id, cwd, here)
	}
	return dir, nil
}

// keep names a fresh turn's session directory after the session Pi
// reported, for the turns that resume it, or removes it when Pi reported
// none. A session whose directory cannot be named so cannot be resumed;
// nothing else about the turn changes.
func keep(root, dir, id string) {
	if !validID(id) {
		os.RemoveAll(dir)
		return
	}
	_ = os.Rename(dir, filepath.Join(root, id))
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// validID reports whether id can name a directory under the sessions root.
func validID(id string) bool { return idPattern.MatchString(id) }

// sessionCwd is the working directory of session id, as the header of its
// file in dir records it. dir is a literal path, whatever it holds.
func sessionCwd(dir, id string) (string, bool) {
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".jsonl" {
			continue
		}
		file, err := os.Open(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(file)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		var header struct{ Type, ID, Cwd string }
		if scanner.Scan() {
			_ = json.Unmarshal(scanner.Bytes(), &header)
		}
		file.Close()
		if header.Type == "session" && header.ID == id {
			return header.Cwd, true
		}
	}
	return "", false
}

// canonical is path with its symbolic links resolved, as a process sees
// its working directory.
func canonical(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return filepath.Clean(path)
}

// Event is a normalized observation from the stream.
type Event struct {
	Source string
	Kind   string
	Data   map[string]any
}

// Stream reduces Pi's JSON event lines.
type Stream struct {
	// The session a resume turn resumes; the turn must report it.
	ResumedSessionID string
	// SessionID is the session the stream's header reported.
	SessionID string
	// Model is the provider/id of the latest assistant message.
	Model string
	// Final is the latest assistant message, whose text a completed turn
	// returns; LastText the latest non-empty assistant text, which a
	// failed one does.
	Final    *Message
	LastText string
	// LastError is the latest error the stream reported.
	LastError string
	// Ended is set by an agent_end Pi will not retry, and cleared when Pi
	// goes on after it: the turn is decided only by the agent_end of its
	// last agent run.
	Ended bool
	usage tally
	// tools are the tool calls reduced and not yet taken (TakeTools).
	tools []Tool
}

// Message is an assistant message as it ended.
type Message struct {
	Text         string
	StopReason   string
	ErrorMessage string
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
	case "session":
		s.SessionID, _ = message["id"].(string)
		return []Event{{run.SourceProtocol, "PROVIDER_SESSION_BOUND", map[string]any{"provider_session_id": s.SessionID, "cwd": message["cwd"]}}}
	case "agent_start":
		// Another agent run: the one before did not end the turn.
		s.Ended = false
		return []Event{{run.SourceProtocol, "TURN_STARTED", nil}}
	case "message_end":
		inner, _ := message["message"].(map[string]any)
		return s.messageEnd(inner)
	case "tool_execution_start":
		exact := exactly(line)
		id, _ := exact["toolCallId"].(string)
		name, _ := exact["toolName"].(string)
		input := wholeInput(exact["args"])
		s.tools = append(s.tools, Tool{Started: &app.ToolCall{ID: id, Name: name, Input: input, Command: name == commandTool}})
		return []Event{{run.SourceProtocol, "TOOL_REQUESTED", map[string]any{"tool_use_id": id, "name": name, "input": truncate(input, 300)}}}
	case "tool_execution_end":
		id, _ := message["toolCallId"].(string)
		if id != "" {
			s.tools = append(s.tools, Tool{Finished: id})
		}
		isError, _ := message["isError"].(bool)
		return []Event{{run.SourceProtocol, "TOOL_RESULT", map[string]any{"tool_use_id": id, "is_error": isError}}}
	case "auto_retry_start":
		s.LastError, _ = message["errorMessage"].(string)
		return []Event{{run.SourceProtocol, "PROVIDER_RETRY", pick(message, "attempt", "maxAttempts", "delayMs", "errorMessage")}}
	case "agent_end":
		if retry, _ := message["willRetry"].(bool); retry {
			return nil
		}
		s.Ended = true
		kind := "TURN_COMPLETED"
		data := map[string]any{}
		if s.Final != nil {
			data["stop_reason"] = s.Final.StopReason
			if s.Final.ErrorMessage != "" {
				data["error"] = truncate(s.Final.ErrorMessage, 300)
			}
		}
		if s.Final == nil || s.Final.StopReason != "stop" {
			kind = "TURN_FAILED"
		}
		return []Event{{run.SourceProtocol, kind, data}}
	case "compaction_end":
		s.compactionEnd(message)
	}
	return nil
}

// compactionEnd counts what a compaction's summary cost and, when Pi will
// retry the turn after it (overflow recovery), takes back the agent_end
// that came before: the turn has not ended.
func (s *Stream) compactionEnd(message map[string]any) {
	if result, compacted := message["result"].(map[string]any); compacted {
		// The summary is model work whoever made it: one that reports no
		// usage leaves the turn's figures unknown.
		usage, _ := result["usage"].(map[string]any)
		s.usage.add(usage)
	}
	if retry, _ := message["willRetry"].(bool); retry {
		s.Ended = false
	}
}

func (s *Stream) messageEnd(message map[string]any) []Event {
	usage, hasUsage := message["usage"].(map[string]any)
	switch message["role"] {
	case "assistant":
		s.usage.add(usage)
		provider, _ := message["provider"].(string)
		model, _ := message["model"].(string)
		if provider != "" && model != "" {
			s.Model = provider + "/" + model
		}
		final := &Message{}
		final.StopReason, _ = message["stopReason"].(string)
		final.ErrorMessage, _ = message["errorMessage"].(string)
		var texts []string
		content, _ := message["content"].([]any)
		for _, item := range content {
			if block, ok := item.(map[string]any); ok && block["type"] == "text" {
				if text, _ := block["text"].(string); text != "" {
					texts = append(texts, text)
				}
			}
		}
		final.Text = strings.Join(texts, "")
		s.Final = final
		var events []Event
		if strings.TrimSpace(final.Text) != "" {
			s.LastText = final.Text
			events = append(events, Event{run.SourceProtocol, "ASSISTANT_TEXT", map[string]any{"text": truncate(final.Text, 500)}})
		}
		if final.StopReason == "error" || final.ErrorMessage != "" {
			s.LastError = final.ErrorMessage
			events = append(events, Event{run.SourceProtocol, "PROVIDER_ERROR", map[string]any{"stop_reason": final.StopReason, "message": truncate(final.ErrorMessage, 300)}})
		}
		return events
	case "toolResult":
		// A tool's own model work, when it did any.
		if hasUsage {
			s.usage.add(usage)
		}
	}
	return nil
}

// Reconcile decides the turn outcome from the stream and the transport.
func (s *Stream) Reconcile(evidence supervisor.Evidence, schemaRequested bool) run.Turn {
	turn := supervisor.Base(evidence)
	if failed, ok := supervisor.RecordFailure(turn, evidence); ok {
		return failed
	}
	turn.ProviderSessionID = s.SessionID
	turn.Model = s.Model
	if s.resumedElsewhere() {
		turn.Status, turn.Error = run.Failed, run.Fault(run.ClassRuntimeError, "resumed session %s, but the runtime reported session %q", s.ResumedSessionID, s.SessionID)
		return turn
	}
	// What the turn's model work cost, however the turn ends.
	turn.Usage, turn.CostUSD = s.usage.totals()
	if !s.Ended {
		return supervisor.WithoutTerminal(turn, evidence, s.LastError)
	}
	turn.Text = s.LastText
	if s.Final == nil {
		turn.Status, turn.Error = run.Failed, run.Fault(run.ClassRuntimeError, "runtime reported agent_end without an assistant message")
		return turn
	}
	if s.Final.StopReason != "stop" {
		turn.Status, turn.Error = run.Failed, classify(s.Final.StopReason, s.Final.ErrorMessage)
		return turn
	}
	if schemaRequested {
		text := strings.TrimSpace(s.Final.Text)
		if text == "" {
			turn.Status, turn.Error = run.Failed, run.Fault(run.ClassInvalidOutput, "no structured output")
			return turn
		}
		if !json.Valid([]byte(text)) {
			turn.Status, turn.Error = run.Failed, run.Fault(run.ClassInvalidOutput, "structured output is not JSON")
			return turn
		}
		turn.Output = json.RawMessage(text)
	}
	turn.Text = s.Final.Text
	turn.Status = run.Completed
	return turn
}

// resumedElsewhere reports a resume turn that reported another session, or
// ended without reporting one, which breaks the contract of resuming in
// place.
func (s *Stream) resumedElsewhere() bool {
	reported := s.SessionID != "" || s.Ended
	return s.ResumedSessionID != "" && reported && s.SessionID != s.ResumedSessionID
}

// classify maps a final assistant message that did not stop normally to a
// failure class, by its stop reason and error message. None of these has
// been observed live.
func classify(stopReason, message string) *run.Error {
	text := "runtime reported " + stopReason
	if stopReason == "" {
		text = "runtime reported no stop reason"
	}
	if message != "" {
		text += ": " + truncate(message, 300)
	}
	lower := strings.ToLower(message)
	class := run.ClassRuntimeError
	switch {
	case strings.Contains(lower, "rate limit") || strings.Contains(lower, "usage limit") || strings.Contains(lower, "quota") || strings.Contains(lower, "429"):
		class = run.ClassRateLimited
	case strings.Contains(lower, "unauthorized") || strings.Contains(lower, "401") || strings.Contains(lower, "403") ||
		strings.Contains(lower, "api key") || strings.Contains(lower, "authentication"):
		class = run.ClassAuth
	case strings.Contains(lower, "context window") || strings.Contains(lower, "context length") || strings.Contains(lower, "prompt is too long"):
		class = run.ClassContextOverflow
	}
	return run.Fault(class, "%s", text)
}

// tally sums the usage of the messages a turn ended and of its
// compactions. A figure is known only if every one counted reported it.
type tally struct {
	input, output, cacheRead, cacheWrite, cost sum
	messages                                   int
}

type sum struct {
	value   float64
	missing bool
}

func (s *sum) add(value any) {
	if number, ok := value.(float64); ok {
		s.value += number
	} else {
		s.missing = true
	}
}

func (t *tally) add(usage map[string]any) {
	t.messages++
	t.input.add(usage["input"])
	t.output.add(usage["output"])
	t.cacheRead.add(usage["cacheRead"])
	t.cacheWrite.add(usage["cacheWrite"])
	cost, _ := usage["cost"].(map[string]any)
	t.cost.add(cost["total"])
}

// totals is the turn's usage and cost; nil when nothing was counted.
func (t *tally) totals() (*run.Usage, *float64) {
	if t.messages == 0 {
		return nil, nil
	}
	count := func(s sum) *int64 {
		if s.missing {
			return nil
		}
		n := int64(s.value)
		return &n
	}
	usage := &run.Usage{
		InputTokens:      count(t.input),
		OutputTokens:     count(t.output),
		CacheReadTokens:  count(t.cacheRead),
		CacheWriteTokens: count(t.cacheWrite),
	}
	if *usage == (run.Usage{}) {
		usage = nil
	}
	var cost *float64
	if !t.cost.missing {
		total := t.cost.value
		cost = &total
	}
	return usage, cost
}

// exactly decodes a line Reduce has decoded, keeping its numbers as
// written: a tool's input is the same text only for the same input, so a
// large integer must not round into another.
func exactly(line string) map[string]any {
	decoder := json.NewDecoder(strings.NewReader(line))
	decoder.UseNumber()
	var message map[string]any
	_ = decoder.Decode(&message)
	return message
}

// wholeInput is a tool's arguments: the same text for the same input.
func wholeInput(args any) string {
	if text, ok := args.(string); ok {
		return text
	}
	data, _ := json.Marshal(args)
	return string(data)
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
