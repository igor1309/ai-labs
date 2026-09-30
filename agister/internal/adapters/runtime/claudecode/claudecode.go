// Package claudecode drives Claude Code headless: one `claude -p` process
// per turn, reading its stream-json protocol.
//
// Contract claude-code/2: the prompt goes on stdin; granted primitives are
// tool names passed as both --tools and --allowedTools under
// --permission-mode dontAsk; --restricted and --strict-mcp-config ignore
// user/project settings and MCP servers and confine file tools to the
// working directory. Permission mappings for this contract describe what
// each tool grants under exactly these flags.
//
// --restricted also drops the repository's instruction files, so Agister
// gives them itself (ADR-006, ADR-007): each AGENTS.md and CLAUDE.md from
// the repository root (the working directory's git top level) down to the
// working directory, root first, as the request's InstructionCommit has
// them, go in the appended system prompt before the process's instruction,
// each introduced by its path relative to the root. Every turn of a call
// carries the same commit, so what the agent commits or edits meanwhile
// changes nothing; symbolic links are followed within that commit. A file
// the commit lacks is absent; a working directory in no repository gets
// none. Any other git failure, or a file that cannot be read, refuses the
// turn before it starts, naming the cause. An empty or relative working
// directory resolves as the process's does. Once the process has started,
// an INSTRUCTION_FILES event records the commit and each file's path and
// sha256.
//
// Agister never chooses the session ID; Claude Code reports it. A
// continuation resumes the reported session in place with --resume, and
// the turn must report that same session, or it fails. A cost limit is
// passed as --max-budget-usd; Claude Code checks it between model
// requests, so the reported cost may exceed it. The result's
// total_cost_usd is the session's cost, counting the turns it resumed; its
// usage is the turn's own.
//
// Turn status precedence: the runtime's `result` message, then Agister's
// timeout or cancellation, then the process exit.
package claudecode

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const Contract = "claude-code/2"

type Runner struct {
	Command   string
	KillGrace time.Duration // zero: the supervisor default
	// Git runs git to read the instruction files; nil: RunGit.
	Git Git
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
	return app.RuntimeIdentity{Contract: Contract, Version: version, Resume: true, CostLimit: true}, nil
}

// InstructionFile is a repository instruction file given to a turn.
type InstructionFile struct {
	Path    string // relative to the repository root, slash-separated
	Content []byte
}

// Instructions are the instruction files given to a turn and the commit
// they were read from; empty outside any repository.
type Instructions struct {
	Commit string
	Files  []InstructionFile
}

// Git runs git in dir with args, stdin on its standard input, and returns
// its standard output.
type Git func(ctx context.Context, dir string, stdin []byte, args ...string) ([]byte, error)

// GitError is git having failed to run or run and failed.
type GitError struct {
	Args   []string
	Stderr string
	Err    error
}

func (e *GitError) Error() string {
	message := strings.TrimSpace(e.Stderr)
	if message == "" {
		message = e.Err.Error()
	}
	return "git " + strings.Join(e.Args, " ") + ": " + message
}

func (e *GitError) Unwrap() error { return e.Err }

// RunGit runs the git on PATH, in the C locale so that its messages can be
// recognized; a failure is a *GitError.
func RunGit(ctx context.Context, dir string, stdin []byte, args ...string) ([]byte, error) {
	command := exec.CommandContext(ctx, "git", args...)
	command.Dir = dir
	command.Env = append(os.Environ(), "LC_ALL=C")
	if stdin != nil {
		command.Stdin = bytes.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		return nil, &GitError{Args: args, Stderr: stderr.String(), Err: err}
	}
	return stdout.Bytes(), nil
}

// notRepository reports git saying that no directory from where it ran up
// is a repository. A repository whose git directory is broken is not that.
func notRepository(err error) bool {
	var failed *GitError
	return errors.As(err, &failed) && strings.Contains(failed.Stderr, "not a git repository (or any")
}

// instructionNames are the files read from each directory, in order.
var instructionNames = []string{"AGENTS.md", "CLAUDE.md"}

// ReadInstructions reads the instruction files Claude Code would load for
// cwd, as commit has them: each AGENTS.md and CLAUDE.md from the
// repository root down to cwd, root first. cwd resolves as the process's
// working directory does: empty is that directory, relative is below it.
// Outside any repository there are none, and commit must be empty; in one,
// commit is required. A file the commit lacks is absent; any other failure,
// of git or of a file, fails, naming the cause.
func ReadInstructions(ctx context.Context, cwd, commit string, git Git) (Instructions, error) {
	if git == nil {
		git = RunGit
	}
	dir, err := filepath.Abs(cwd)
	if err != nil {
		return Instructions{}, err
	}
	out, err := git(ctx, dir, nil, "rev-parse", "--show-prefix")
	if notRepository(err) {
		if commit != "" {
			return Instructions{}, fmt.Errorf("instruction files: commit %s was given, but %s is in no repository", commit, dir)
		}
		return Instructions{}, nil
	}
	if err != nil {
		return Instructions{}, fmt.Errorf("instruction files: locating the repository of %s: %w", dir, err)
	}
	if commit == "" {
		return Instructions{}, fmt.Errorf("instruction files: no commit to read them from was given for %s", dir)
	}
	prefix := strings.TrimSuffix(strings.TrimRight(string(out), "\n"), "/")
	resolved, err := git(ctx, dir, nil, "rev-parse", "--verify", "--end-of-options", commit+"^{commit}")
	if err != nil {
		return Instructions{}, fmt.Errorf("instruction files: resolving commit %s: %w", commit, err)
	}
	instructions := Instructions{Commit: strings.TrimSpace(string(resolved))}
	var below []string
	if prefix != "" {
		below = strings.Split(prefix, "/")
	}
	var paths []string
	for depth := 0; depth <= len(below); depth++ {
		for _, name := range instructionNames {
			paths = append(paths, strings.Join(append(below[:depth:depth], name), "/"))
		}
	}
	var stdin bytes.Buffer
	for _, path := range paths {
		if strings.Contains(path, "\n") {
			return Instructions{}, fmt.Errorf("instruction files: path %q has a line break", path)
		}
		fmt.Fprintf(&stdin, "%s:%s\n", instructions.Commit, path)
	}
	// Paths after the colon are relative to the root; symbolic links are
	// followed within the commit.
	out, err = git(ctx, dir, stdin.Bytes(), "cat-file", "--batch", "--follow-symlinks")
	if err != nil {
		return Instructions{}, fmt.Errorf("instruction files: reading them from commit %s: %w", instructions.Commit, err)
	}
	reader := bufio.NewReader(bytes.NewReader(out))
	for _, path := range paths {
		content, found, err := batchEntry(reader)
		if err != nil {
			return Instructions{}, fmt.Errorf("instruction file %s at commit %s: %w", path, instructions.Commit, err)
		}
		if found {
			instructions.Files = append(instructions.Files, InstructionFile{Path: path, Content: content})
		}
	}
	return instructions, nil
}

// batchEntry reads the next entry of `git cat-file --batch
// --follow-symlinks`: a file's content, or found false when the commit
// lacks it or its link leads nowhere in the commit.
func batchEntry(reader *bufio.Reader) (content []byte, found bool, err error) {
	header, err := reader.ReadString('\n')
	if err != nil {
		return nil, false, fmt.Errorf("git cat-file ended early")
	}
	header = strings.TrimSuffix(header, "\n")
	if strings.HasSuffix(header, " missing") {
		return nil, false, nil
	}
	if strings.HasSuffix(header, " ambiguous") {
		return nil, false, fmt.Errorf("ambiguous")
	}
	fields := strings.Fields(header)
	var kind, size string
	switch len(fields) {
	case 2: // symlink, dangling, loop or notdir, and its size
		kind, size = fields[0], fields[1]
	case 3: // object, type, size
		kind, size = fields[1], fields[2]
	default:
		return nil, false, fmt.Errorf("unrecognized git cat-file output %q", header)
	}
	n, err := strconv.Atoi(size)
	if err != nil || n < 0 {
		return nil, false, fmt.Errorf("unrecognized git cat-file output %q", header)
	}
	body := make([]byte, n+1)
	if _, err := io.ReadFull(reader, body); err != nil {
		return nil, false, fmt.Errorf("git cat-file ended early")
	}
	body = body[:n]
	switch kind {
	case "blob":
		return body, true, nil
	case "dangling":
		return nil, false, nil
	case "symlink":
		return nil, false, fmt.Errorf("a symbolic link out of the repository, to %s", body)
	case "loop":
		return nil, false, fmt.Errorf("a loop of symbolic links")
	case "notdir":
		return nil, false, fmt.Errorf("a symbolic link through a file")
	}
	return nil, false, fmt.Errorf("a %s, not a file", kind)
}

// SystemPrompt is what a turn appends to the system prompt: the
// instruction files, each introduced by its path, then the instruction.
func SystemPrompt(files []InstructionFile, instruction string) string {
	var parts []string
	for _, file := range files {
		parts = append(parts, "Contents of "+file.Path+" (the repository's instructions; the path is relative to the repository root):\n\n"+string(bytes.TrimRight(file.Content, "\n")))
	}
	if instruction != "" {
		parts = append(parts, instruction)
	}
	return strings.Join(parts, "\n\n")
}

// Arguments builds the command line for a turn given files.
func Arguments(request app.TurnRequest, files []InstructionFile) ([]string, error) {
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
	if request.ResumeSessionID != "" {
		args = append(args, "--resume", request.ResumeSessionID)
	}
	if request.MaxCostUSD != nil {
		args = append(args, "--max-budget-usd", strconv.FormatFloat(*request.MaxCostUSD, 'f', -1, 64))
	}
	args = append(args, "--restricted", "--strict-mcp-config")
	if request.Model != "" {
		args = append(args, "--model", request.Model)
	}
	if request.Effort != "" {
		args = append(args, "--effort", request.Effort)
	}
	if prompt := SystemPrompt(files, request.Instruction); prompt != "" {
		args = append(args, "--append-system-prompt", prompt)
	}
	if len(request.OutputSchema) > 0 {
		args = append(args, "--json-schema", string(request.OutputSchema))
	}
	return args, nil
}

func (r *Runner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	instructions, err := ReadInstructions(ctx, request.Cwd, request.InstructionCommit, r.Git)
	if err != nil {
		return supervisor.Failed(run.ClassRefused, err)
	}
	args, err := Arguments(request, instructions.Files)
	if err != nil {
		return supervisor.Failed(run.ClassInternal, err)
	}
	state := &Stream{ResumedSessionID: request.ResumeSessionID}
	sink = given{EventSink: sink, instructions: instructions}
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

// given records the instruction files a turn was given, and their commit,
// once its process has started, so the process's start stays the turn's
// first event.
type given struct {
	app.EventSink
	instructions Instructions
}

func (g given) Event(source, kind string, data map[string]any) {
	g.EventSink.Event(source, kind, data)
	if kind != "PROCESS_STARTED" {
		return
	}
	files := make([]any, len(g.instructions.Files))
	for i, file := range g.instructions.Files {
		digest := sha256.Sum256(file.Content)
		files[i] = map[string]any{"path": file.Path, "sha256": hex.EncodeToString(digest[:])}
	}
	recorded := map[string]any{"files": files}
	if g.instructions.Commit != "" {
		recorded["commit"] = g.instructions.Commit
	}
	g.EventSink.Event(run.SourceAgister, "INSTRUCTION_FILES", recorded)
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
			if status == "rejected" {
				s.RateLimit = status
			}
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
		return append(events, s.check(sessionID)...)
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
	return append([]Event{{run.SourceProtocol, kind, data}}, mismatch...)
}

// Reconcile decides the turn status from the stream and the transport.
func (s *Stream) Reconcile(evidence supervisor.Evidence, schemaRequested bool) run.Turn {
	turn := supervisor.Base(evidence)
	if failed, ok := supervisor.RecordFailure(turn, evidence); ok {
		return failed
	}
	turn.ProviderSessionID = s.ProviderSessionID
	turn.Model = s.Model
	if s.resumedElsewhere() {
		reported := s.OtherSessionID
		if reported == "" {
			reported = s.ProviderSessionID
		}
		turn.Status, turn.Error = run.Failed, run.Fault(run.ClassRuntimeError, "resumed session %s, but the runtime reported session %q", s.ResumedSessionID, reported)
		return turn
	}
	result := s.Result
	if result == nil {
		return supervisor.WithoutTerminal(turn, evidence, s.rejection())
	}
	// The session's cost, every turn it had; the turn's own is derived.
	if cost, ok := result["total_cost_usd"].(float64); ok {
		turn.Session = &run.SessionTotals{CostUSD: &cost}
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
		turn.Usage = &run.Usage{
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
		turn.Status, turn.Error = run.Failed, s.classify(result)
		return turn
	}
	if schemaRequested && len(turn.Output) == 0 {
		turn.Status, turn.Error = run.Failed, run.Fault(run.ClassInvalidOutput, "no structured output")
		return turn
	}
	turn.Status = run.Completed
	return turn
}

// classify maps a failed result to a failure class. Only the budget
// subtype has been observed live; the rest follow the result's fields.
func (s *Stream) classify(result map[string]any) *run.Error {
	message := fmt.Sprintf("runtime reported %v", result["subtype"])
	if errors, ok := result["errors"].([]any); ok && len(errors) > 0 {
		message += ": " + fmt.Sprint(errors...)
	} else if text, ok := result["result"].(string); ok && text != "" {
		message += ": " + truncate(text, 300)
	}
	status, _ := result["api_error_status"].(float64)
	lower := strings.ToLower(message)
	class := run.ClassRuntimeError
	switch {
	case result["subtype"] == "error_max_budget_usd":
		class = run.ClassBudgetExhausted
	case status == 429 || s.RateLimit != "":
		class = run.ClassRateLimited
	case status == 401 || status == 403:
		class = run.ClassAuth
	case status == 413 || strings.Contains(lower, "prompt is too long") || strings.Contains(lower, "context window"):
		class = run.ClassContextOverflow
	}
	return run.Fault(class, "%s", message)
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
	return []Event{{run.SourceAgister, "SESSION_ID_MISMATCH", map[string]any{"resumed": s.ResumedSessionID, "reported": sessionID}}}
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
