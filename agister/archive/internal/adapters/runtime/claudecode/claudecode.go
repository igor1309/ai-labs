// Package claudecode drives Claude Code headless: one `claude -p` process
// per turn, reading its stream-json protocol.
//
// Contract claude-code/3: the prompt goes on stdin; granted primitives,
// and Skill on every turn, are tool names passed as both --tools and
// --allowedTools under --permission-mode dontAsk; --strict-mcp-config
// ignores MCP servers. Claude Code loads the working directory's
// instruction files, settings and skills as it would for a person there
// (ADR-006). Permission mappings for this contract describe what each tool
// grants under exactly these flags.
//
// A turn given skills (ADR-021) gets them as a plugin: before the turn,
// the adapter writes a plugin named agister into a folder of its own
// outside the working directory, holding only its manifest
// (.claude-plugin/plugin.json) and skills/<name>/SKILL.md for each skill,
// passes it as --plugin-dir, and removes it when the turn ends. Its skills
// are agister:<name>, so they never meet the repository's or the user's;
// Skill, granted on every turn, uses them. A turn given none writes and
// passes nothing.
//
// Agister never chooses the session ID; Claude Code reports it. A
// continuation resumes the reported session in place with --resume, and
// the turn must report that same session, or it fails. A cost limit is
// passed as --max-budget-usd; Claude Code checks it between model
// requests, so the reported cost may exceed it. The result's
// total_cost_usd is the session's cost, counting the turns it resumed; its
// usage is the turn's own.
//
// Tool calls are reported as they start and finish: a tool_use block with
// its whole input, and the tool_result that answers it. Bash is the tool
// that runs commands. Edit, Write and MultiEdit write the file their input
// names as file_path, NotebookEdit the one it names as notebook_path. The
// tool calls the result lists as permission_denials are reported one by
// one, each with its tool and its input.
//
// Turn status precedence: the runtime's `result` message, then Agister's
// timeout or cancellation, then the process exit.
//
// Claude Code reports a failed turn's reason in the result's errors and
// again on stderr (observed with 2.1.286 resuming an unknown session); a
// command line it refuses gets no result, only its reason on stderr, which
// the error message then quotes (withoutTerminal).
package claudecode

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const Contract = "claude-code/3"

// skill is the tool that uses the repository's skills; every turn gets it.
const skill = "Skill"

// commandTool is the tool that runs commands.
const commandTool = "Bash"

// Plugin is the name of the plugin a turn's skills are given in: each is
// Plugin:<name>.
const Plugin = "agister"

// Transport is what the runner needs of a process supervisor: to run the
// runtime to its exit, passing each line of its stdout to onLine, and to
// read the runtime's version.
type Transport interface {
	Run(ctx context.Context, spec Spec, sink Sink, onLine func(string)) Evidence
	Version(ctx context.Context, command string) (string, error)
}

// Spec is the process a turn runs.
type Spec struct {
	Command   string
	Args      []string
	Dir       string
	Stdin     string
	Timeout   time.Duration
	KillGrace time.Duration // zero: the transport's default
}

// Sink is what the transport reports to: the process's events, its
// reference as soon as it exists (an error means it is not on record, and
// the transport kills it), and each line of its stdout.
type Sink interface {
	Event(source, kind string, data map[string]any)
	ProcessStarted(ref string) error
	Raw(line string)
}

// Evidence is what the process left, the stream reconciles: its exit, how
// it ended, and the end of its stderr.
type Evidence struct {
	Exit          *Exit
	SpawnError    string
	TimedOut      bool
	Aborted       bool
	StderrTail    string
	StderrOmitted int64
	// RecordError is why the process could not be recorded; it was killed
	// at once, and the turn fails.
	RecordError string
}

type Runner struct {
	Command string
	// Transport runs the runtime; the composition root wires the
	// supervisor.
	Transport Transport
	KillGrace time.Duration // zero: the supervisor default
	// TempDir is the folder a turn's own temporary folder is made in;
	// empty: the system's temporary directory.
	TempDir string
}

func New(command string, transport Transport) *Runner {
	if command == "" {
		command = "claude"
	}
	return &Runner{Command: command, Transport: transport}
}

var versionPattern = regexp.MustCompile(`\d+\.\d+\.\d+`)

func (r *Runner) Identity(ctx context.Context) (RuntimeIdentity, error) {
	out, err := r.Transport.Version(ctx, r.Command)
	if err != nil {
		return RuntimeIdentity{}, err
	}
	version := versionPattern.FindString(out)
	if version == "" {
		return RuntimeIdentity{}, fmt.Errorf("unrecognized version output %q", out)
	}
	return RuntimeIdentity{Contract: Contract, Version: version, Resume: true, CostLimit: true, ToolCalls: true, Skills: true}, nil
}

// Arguments builds the command line for a turn whose skills are in the
// plugin folder plugin (unused when it has none).
func Arguments(request TurnRequest, plugin string) ([]string, error) {
	for _, tool := range request.Primitives {
		if tool == "" || strings.ContainsAny(tool, ", ") {
			return nil, fmt.Errorf("invalid tool primitive %q", tool)
		}
	}
	tools := request.Primitives
	if !slices.Contains(tools, skill) {
		tools = append(slices.Clip(tools), skill)
	}
	joined := strings.Join(tools, ",")
	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--verbose",
		"--permission-mode", "dontAsk",
		"--tools=" + joined,
		"--allowedTools=" + joined,
	}
	if request.ResumeSessionID != "" {
		args = append(args, "--resume", request.ResumeSessionID)
	}
	if request.MaxCostUSD != nil {
		args = append(args, "--max-budget-usd", strconv.FormatFloat(*request.MaxCostUSD, 'f', -1, 64))
	}
	args = append(args, "--strict-mcp-config")
	if len(request.Skills) > 0 {
		args = append(args, "--plugin-dir", plugin)
	}
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

func (r *Runner) RunTurn(ctx context.Context, request TurnRequest, sink EventSink) Turn {
	var plugin string
	if len(request.Skills) > 0 {
		dir, err := os.MkdirTemp(r.TempDir, "agister-claude-")
		if err != nil {
			return failedTurn(ClassInternal, err)
		}
		defer os.RemoveAll(dir)
		if err := WritePlugin(dir, request.Skills); err != nil {
			return failedTurn(ClassInternal, err)
		}
		plugin = dir
	}
	args, err := Arguments(request, plugin)
	if err != nil {
		return failedTurn(ClassInternal, err)
	}
	state := &Stream{ResumedSessionID: request.ResumeSessionID}
	evidence := r.Transport.Run(ctx, Spec{
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
				sink.ToolFinished(*tool.Finished)
			}
		}
		for _, denial := range state.TakeDenials() {
			sink.PermissionDenied(denial)
		}
	})
	return state.Reconcile(evidence, len(request.OutputSchema) > 0)
}

// WritePlugin writes, into the empty folder dir, the plugin a turn's skills
// are given in: its manifest naming it Plugin, and skills/<name>/SKILL.md
// for each skill, from its bytes.
func WritePlugin(dir string, skills []Skill) error {
	manifest := filepath.Join(dir, ".claude-plugin")
	if err := os.Mkdir(manifest, 0o700); err != nil {
		return err
	}
	data, _ := json.Marshal(map[string]string{"name": Plugin})
	if err := os.WriteFile(filepath.Join(manifest, "plugin.json"), append(data, '\n'), 0o600); err != nil {
		return err
	}
	folder := filepath.Join(dir, "skills")
	if err := os.Mkdir(folder, 0o700); err != nil {
		return err
	}
	for _, skill := range skills {
		if name := skill.Name; name != filepath.Base(name) || name == "." || name == ".." {
			return fmt.Errorf("%s cannot give skill %q: not a folder's name", Contract, name)
		}
		if err := os.Mkdir(filepath.Join(folder, skill.Name), 0o700); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(folder, skill.Name, "SKILL.md"), skill.Bytes, 0o600); err != nil {
			return err
		}
	}
	return nil
}

// Event is a normalized observation from the stream.
type Event struct {
	Source string
	Kind   string
	Data   map[string]any
}

// Stream reduces stream-json lines.
type Stream struct {
	// The session a resume turn resumes; the turn must report it.
	ResumedSessionID string
	// The first session a resume turn reported other than the resumed one.
	OtherSessionID    string
	ProviderSessionID string
	Model             string
	LastText          string
	Result            map[string]any
	RateLimit         string // set when the provider rejected a request
	// tools are the tool calls reduced and not yet taken (TakeTools).
	tools []Tool
	// denials are the permission denials reduced and not yet taken
	// (TakeDenials).
	denials []PermissionDenial
}

// Tool is a tool call the stream reported: its start, or the end of one,
// with its result.
type Tool struct {
	Started  *ToolCall
	Finished *ToolResult
}

// TakeTools returns the tool calls reduced since it was last called, in
// order.
func (s *Stream) TakeTools() []Tool {
	tools := s.tools
	s.tools = nil
	return tools
}

// TakeDenials returns the permission denials reduced since it was last
// called, in order.
func (s *Stream) TakeDenials() []PermissionDenial {
	denials := s.denials
	s.denials = nil
	return denials
}

func (s *Stream) Reduce(line string) []Event {
	if strings.TrimSpace(line) == "" {
		return nil
	}
	var message map[string]any
	if err := json.Unmarshal([]byte(line), &message); err != nil {
		return []Event{{SourceAgister, "STREAM_PARSE_ERROR", map[string]any{"line": truncate(line, 200)}}}
	}
	switch message["type"] {
	case "system":
		return s.system(message)
	case "assistant":
		return s.assistant(exactly(line))
	case "user":
		return s.user(message)
	case "result":
		s.denials = append(s.denials, denials(exactly(line))...)
		return s.result(message)
	case "rate_limit_event":
		info, _ := message["rate_limit_info"].(map[string]any)
		if status, _ := info["status"].(string); status != "" && status != "allowed" {
			if status == "rejected" {
				s.RateLimit = status
			}
			return []Event{{SourceProtocol, "RATE_LIMITED", map[string]any{"status": status, "resets_at": info["resetsAt"]}}}
		}
	}
	return nil
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

func (s *Stream) system(message map[string]any) []Event {
	switch message["subtype"] {
	case "init":
		sessionID, _ := message["session_id"].(string)
		s.ProviderSessionID = sessionID
		s.Model, _ = message["model"].(string)
		events := []Event{{SourceProtocol, "PROVIDER_SESSION_BOUND", map[string]any{
			"provider_session_id": sessionID, "model": message["model"], "tools": message["tools"], "permission_mode": message["permissionMode"],
		}}}
		return append(events, s.check(sessionID)...)
	case "api_retry":
		return []Event{{SourceProtocol, "PROVIDER_RETRY", pick(message, "attempt", "max_retries", "error_status", "error")}}
	}
	return nil
}

func (s *Stream) assistant(message map[string]any) []Event {
	var events []Event
	for _, block := range blocks(message) {
		switch block["type"] {
		case "tool_use":
			input, _ := json.Marshal(block["input"])
			id, _ := block["id"].(string)
			name, _ := block["name"].(string)
			s.tools = append(s.tools, Tool{Started: &ToolCall{ID: id, Name: name, Input: string(input), Command: name == commandTool, Writes: writes(name, block["input"])}})
			events = append(events, Event{SourceProtocol, "TOOL_REQUESTED", map[string]any{"tool_use_id": block["id"], "name": block["name"], "input": truncate(string(input), 300)}})
		case "text":
			if text, _ := block["text"].(string); strings.TrimSpace(text) != "" {
				s.LastText = text
				events = append(events, Event{SourceProtocol, "ASSISTANT_TEXT", map[string]any{"text": truncate(text, 500)}})
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
			if id, _ := block["tool_use_id"].(string); id != "" {
				text, reported := resultText(block["content"])
				s.tools = append(s.tools, Tool{Finished: finished(id, text, reported)})
			}
			events = append(events, Event{SourceProtocol, "TOOL_RESULT", map[string]any{"tool_use_id": block["tool_use_id"], "is_error": isError}})
		}
	}
	return events
}

func (s *Stream) result(message map[string]any) []Event {
	s.Result = message
	sessionID, _ := message["session_id"].(string)
	if s.ProviderSessionID == "" {
		s.ProviderSessionID = sessionID
	}
	mismatch := s.check(sessionID)
	kind := "TURN_COMPLETED"
	if !succeeded(message) {
		kind = "TURN_FAILED"
	}
	data := pick(message, "subtype", "is_error", "terminal_reason", "num_turns", "duration_ms", "total_cost_usd", "errors")
	if denials, ok := message["permission_denials"].([]any); ok {
		data["permission_denials"] = len(denials)
	}
	return append([]Event{{SourceProtocol, kind, data}}, mismatch...)
}

// writes are the paths a call of the tool name writes, from its input: the
// one a tool that writes a file names, as it names it; none for any other
// tool, or an input that names none.
func writes(name string, input any) []string {
	var key string
	switch name {
	case "Edit", "Write", "MultiEdit":
		key = "file_path"
	case "NotebookEdit":
		key = "notebook_path"
	default:
		return nil
	}
	fields, _ := input.(map[string]any)
	if path, _ := fields[key].(string); path != "" {
		return []string{path}
	}
	return nil
}

// denials are the tool calls a result lists as permission_denials, in
// order, one for each entry, so their number is the count the turn reports:
// the entry's tool_name and its tool_input, bounded as a tool call's input
// is in its event, each empty where the entry has none.
func denials(result map[string]any) []PermissionDenial {
	entries, _ := result["permission_denials"].([]any)
	var denied []PermissionDenial
	for _, entry := range entries {
		fields, _ := entry.(map[string]any)
		denial := PermissionDenial{}
		denial.Tool, _ = fields["tool_name"].(string)
		if input, ok := fields["tool_input"]; ok {
			data, _ := json.Marshal(input)
			denial.Input = truncate(string(data), 300)
		}
		denied = append(denied, denial)
	}
	return denied
}

// Reconcile decides the turn status from the stream and the transport.
func (s *Stream) Reconcile(evidence Evidence, schemaRequested bool) Turn {
	turn := baseTurn(evidence)
	if failed, ok := recordFailure(turn, evidence); ok {
		return failed
	}
	turn.ProviderSessionID = s.ProviderSessionID
	turn.Model = s.Model
	if s.resumedElsewhere() {
		reported := s.OtherSessionID
		if reported == "" {
			reported = s.ProviderSessionID
		}
		turn.Status, turn.Error = Failed, Fault(ClassRuntimeError, "resumed session %s, but the runtime reported session %q", s.ResumedSessionID, reported)
		return turn
	}
	result := s.Result
	if result == nil {
		return withoutTerminal(turn, evidence, s.rejection())
	}
	// The session's cost, every turn it had; the turn's own is derived.
	if cost, ok := result["total_cost_usd"].(float64); ok {
		turn.Session = &SessionTotals{CostUSD: &cost}
	}
	if duration, ok := result["duration_ms"].(float64); ok {
		ms := int64(duration)
		turn.RuntimeMS = &ms
	}
	if turns, ok := result["num_turns"].(float64); ok {
		n := int(turns)
		turn.NumTurns = &n
	}
	if usage, ok := result["usage"].(map[string]any); ok {
		turn.Usage = &Usage{
			InputTokens:      count(usage, "input_tokens"),
			OutputTokens:     count(usage, "output_tokens"),
			CacheReadTokens:  count(usage, "cache_read_input_tokens"),
			CacheWriteTokens: count(usage, "cache_creation_input_tokens"),
		}
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
		turn.Status, turn.Error = Failed, s.classify(result)
		return turn
	}
	if schemaRequested && len(turn.Output) == 0 {
		turn.Status, turn.Error = Failed, Fault(ClassInvalidOutput, "no structured output")
		return turn
	}
	turn.Status = Completed
	return turn
}

// classify maps a failed result to a failure class. Only the budget
// subtype and a session-limit HTTP 429 have been observed live; the rest
// follow the result's fields.
func (s *Stream) classify(result map[string]any) *Error {
	message := fmt.Sprintf("runtime reported %v", result["subtype"])
	if result["subtype"] == "success" && result["is_error"] == true {
		message = "runtime reported an error"
	}
	status, _ := result["api_error_status"].(float64)
	if status > 0 {
		message += fmt.Sprintf(" (%g)", status)
	}
	if errors, ok := result["errors"].([]any); ok && len(errors) > 0 {
		message += ": " + fmt.Sprint(errors...)
	} else if text, ok := result["result"].(string); ok && text != "" {
		message += ": " + truncate(text, 300)
	}
	lower := strings.ToLower(message)
	class := ClassRuntimeError
	switch {
	case result["subtype"] == "error_max_budget_usd":
		class = ClassBudgetExhausted
	case status == 429 || s.RateLimit != "":
		class = ClassRateLimited
	case status == 401 || status == 403:
		class = ClassAuth
	case status == 413 || strings.Contains(lower, "prompt is too long") || strings.Contains(lower, "context window"):
		class = ClassContextOverflow
	}
	return Fault(class, "%s", message)
}

// check keeps a session ID reported on a resume turn other than the
// resumed one; an empty one confirms nothing and breaks nothing yet.
func (s *Stream) check(sessionID string) []Event {
	if s.ResumedSessionID == "" || sessionID == "" || sessionID == s.ResumedSessionID {
		return nil
	}
	if s.OtherSessionID == "" {
		s.OtherSessionID = sessionID
	}
	return []Event{{SourceAgister, "SESSION_ID_MISMATCH", map[string]any{"resumed": s.ResumedSessionID, "reported": sessionID}}}
}

// resumedElsewhere reports a resume turn that reported another session
// anywhere in its stream, or none by its result, which breaks the contract
// of resuming in place.
func (s *Stream) resumedElsewhere() bool {
	reported := s.ProviderSessionID != "" || s.Result != nil
	return s.ResumedSessionID != "" && (s.OtherSessionID != "" || reported && s.ProviderSessionID != s.ResumedSessionID)
}

// rejection describes a rate-limit refusal seen before the stream ended.
func (s *Stream) rejection() string {
	if s.RateLimit == "" {
		return ""
	}
	return "rate limit " + s.RateLimit
}

func succeeded(result map[string]any) bool {
	isError, _ := result["is_error"].(bool)
	return result["subtype"] == "success" && !isError
}

func count(source map[string]any, key string) *int64 {
	value, ok := source[key].(float64)
	if !ok {
		return nil
	}
	n := int64(value)
	return &n
}

// resultText is the text of a tool_result block's content: the string it
// is, or its text blocks joined; reported is false when it has neither.
func resultText(content any) (text string, reported bool) {
	switch content := content.(type) {
	case string:
		return content, true
	case []any:
		var texts []string
		for _, item := range content {
			if block, ok := item.(map[string]any); ok && block["type"] == "text" {
				if text, ok := block["text"].(string); ok {
					texts = append(texts, text)
				}
			}
		}
		return strings.Join(texts, "\n"), len(texts) > 0
	}
	return "", false
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

// finished is the end of the call id, with the result's text the stream
// reported for it, if it reported one: bounded to ToolResultBytes, its head
// and tail kept, each cut on a rune boundary.
func finished(id, text string, reported bool) *ToolResult {
	result := &ToolResult{ID: id, Output: text, Reported: reported}
	if !reported {
		result.Output = ""
		return result
	}
	if len(text) <= ToolResultBytes {
		return result
	}
	head, tail := ToolResultBytes/2, len(text)-ToolResultBytes/2
	for head > 0 && !utf8.RuneStart(text[head]) {
		head--
	}
	for tail < len(text) && !utf8.RuneStart(text[tail]) {
		tail++
	}
	result.Output = text[:head] + "\n…\n" + text[tail:]
	return result
}
