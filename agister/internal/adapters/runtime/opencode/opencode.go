// Package opencode drives OpenCode (opencode on PATH): one
// `opencode run --format json` process per turn, reading its JSON event
// stream.
//
// Contract opencode/1: external plugins are off (--pure), so a user's
// OpenCode plugins never run inside a call. Every turn runs as an agent
// Agister generates for it and passes inline, in OPENCODE_CONFIG_CONTENT:
// a primary agent whose prompt is the instruction and the output schema,
// and whose permission denies everything ("*") and then allows each
// granted primitive. OpenCode has no flag for the system prompt or the
// tools; the agent is both. The prompt goes on stdin, which run reads as
// the message (a message argument with a space reaches the model quoted).
//
// How the config merges, checked with `opencode debug agent` on 1.18.33:
// OpenCode merges the inline config over the user's global and the
// checkout's own (opencode.json, .opencode), key by key, and an agent's
// permission becomes rules after the global ones (the config's permission,
// OPENCODE_PERMISSION), the last matching rule deciding. So nothing global
// widens the generated agent: its "*" deny comes after every global rule.
// An agent of the same name would: its permission keys merge with the
// generated ones and a key the generated agent does not set, placed after
// "*", allows. So the agent's name is the turn's own, agister-<random>,
// which no config can have defined. "*" must be the first key of the
// permission: rules keep the order of the keys. The tools option is not
// used: OpenCode turns it into permission keys placed before the
// permission's own. Only a managed config (an administrator's) is merged
// over the inline one. The checkout's config is loaded as OpenCode loads it
// for a person working there; what it adds besides tools (MCP servers it
// starts, say) is the repository's own, as its .agister is.
//
// Granted primitives are OpenCode permission names, one per built-in tool
// except edit, which is the one permission of the tools edit, write and
// apply_patch: they cannot be granted apart. With every other permission
// denied a call never asks for approval (--auto is not passed), and that
// includes external_directory, the guard on paths outside the working
// directory, and doom_loop. The denial of outside paths has not been
// checked live, and bash runs whatever the user can: OpenCode has no
// sandbox. task (subagents with permissions of their own), todowrite and
// question (there is no one to answer) are not primitives, so never
// allowed. The model goes as -m (provider/model) and the effort as
// --variant. OpenCode has no structured output: the final assistant text is
// the output, and must be JSON when a schema is given. OpenCode cannot
// limit cost.
//
// Instructions and skills (ADR-006): OpenCode loads AGENTS.md, or CLAUDE.md
// when there is none, from the working directory up to the worktree
// (docs/rules), and discovers skills in .opencode/skills, .claude/skills
// and .agents/skills on the same path, and in the user's own
// (`opencode debug skill` listed a checkout's .agents/skills on 1.18.33).
// A skill is listed in the skill tool's description and loaded by calling
// it; with the tool denied the list is left out (docs/skills). So a turn
// not granted skill is refused before OpenCode starts (SkillTools).
//
// Sessions are kept in OpenCode's own store. Agister takes the session ID
// from the stream's sessionID and never chooses it. A continuation resumes
// that session in place (-s <id>), and the turn must report that same
// session, or it fails. On 1.18.33 `run -s` reported the resumed ID from
// the directory the session ran in and from another one, and an unknown ID
// ended the process ("Session not found", exit 1). What a session resumed
// elsewhere works on has not been checked, so a session resumes only where
// it ran (RuntimeIdentity.ResumeWhereItRan).
//
// Tool calls are read from tool_use, which carries a call with its state:
// one event for a call that has ended, so its start and finish are read
// together. That is too late for the staleness limits on tool calls, so
// until timely starts are established the adapter does not report tool
// calls (reportsToolCalls) and calls under those limits are refused; the
// events still record each call. bash is the tool that runs commands. Usage and cost
// are the turn's own: the tokens and cost of each step_finish, summed; a
// figure some step does not report is unknown.
//
// A turn is completed only by a final step_finish whose reason is "stop".
// One with another reason that is not followed by a step (length, say) is
// a failure the runtime reported, as is any error event; a stream that ends
// after a "tool-calls" step, or without a step_finish, is decided by the
// transport, quoting stderr (supervisor.WithoutTerminal), and so is a
// non-zero exit, a timeout, a cancellation or a signal after a "stop".
// OpenCode runs its default agent, which
// allows everything, when it does not find the one named ("Falling back to
// default agent" on stderr): such a turn fails.
package opencode

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const Contract = "opencode/1"

// Tools are the primitives of contract opencode/1: the permissions of
// OpenCode's built-in tools a call can be granted. edit is the permission
// of the tools edit, write and apply_patch.
var Tools = []string{"read", "grep", "glob", "skill", "edit", "bash", "webfetch", "websearch"}

// Variants are what --variant is given, the efforts of contract
// opencode/1. Which of them a model has is its provider's matter.
var Variants = []string{"none", "minimal", "low", "medium", "high", "xhigh", "max"}

// commandTool is the tool that runs commands.
const commandTool = "bash"

// SkillTools are the tools OpenCode lists and loads a skill with; a turn
// needs one of them.
var SkillTools = []string{"skill"}

// ConfigVariable is the environment variable OpenCode reads inline config
// from.
const ConfigVariable = "OPENCODE_CONFIG_CONTENT"

// agentPrefix starts the name of every generated agent.
const agentPrefix = "agister-"

// Transport is what the runner needs of a process supervisor: to run the
// runtime to its exit, passing each line of its stdout to onLine, and to
// read the runtime's version.
type Transport interface {
	Run(ctx context.Context, spec supervisor.Spec, sink supervisor.Sink, onLine func(string)) supervisor.Evidence
	Version(ctx context.Context, command string) (string, error)
}

type Runner struct {
	Command string
	// Transport runs the runtime; the composition root wires the
	// supervisor.
	Transport Transport
	KillGrace time.Duration // zero: the supervisor default
}

func New(command string, transport Transport) *Runner {
	if command == "" {
		command = "opencode"
	}
	return &Runner{Command: command, Transport: transport}
}

var versionPattern = regexp.MustCompile(`\d+\.\d+\.\d+`)

// reportsToolCalls is whether the adapter reports tool calls as they start
// and finish (app.RuntimeIdentity.ToolCalls): not while the stream is seen
// to report a call only once it has ended.
const reportsToolCalls = false

func (r *Runner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	out, err := r.Transport.Version(ctx, r.Command)
	if err != nil {
		return app.RuntimeIdentity{}, err
	}
	version := versionPattern.FindString(out)
	if version == "" {
		return app.RuntimeIdentity{}, fmt.Errorf("unrecognized version output %q", out)
	}
	return app.RuntimeIdentity{Contract: Contract, Version: version, Resume: true, ResumeWhereItRan: true, ToolCalls: reportsToolCalls, SkillTools: slices.Clone(SkillTools)}, nil
}

// Arguments builds the command line for a turn that runs as the generated
// agent named agent.
func Arguments(request app.TurnRequest, agent string) ([]string, error) {
	if request.MaxCostUSD != nil {
		return nil, errors.New("opencode/1 cannot limit cost")
	}
	for _, tool := range request.Primitives {
		if !slices.Contains(Tools, tool) {
			return nil, fmt.Errorf("opencode/1 has no tool %q (tools: %s)", tool, strings.Join(Tools, ", "))
		}
	}
	if !slices.ContainsFunc(SkillTools, func(tool string) bool { return slices.Contains(request.Primitives, tool) }) {
		return nil, errors.New("opencode/1 needs skill to use the repository's skills (ADR-006)")
	}
	if request.Effort != "" && !slices.Contains(Variants, request.Effort) {
		return nil, fmt.Errorf("opencode/1 has no variant %q (variants: %s)", request.Effort, strings.Join(Variants, ", "))
	}
	args := []string{"run", "--format", "json", "--pure", "--agent", agent}
	if request.ResumeSessionID != "" {
		args = append(args, "-s", request.ResumeSessionID)
	}
	if request.Model != "" {
		args = append(args, "-m", request.Model)
	}
	if request.Effort != "" {
		args = append(args, "--variant", request.Effort)
	}
	return args, nil
}

// Config is the inline config of a turn: the generated agent named agent,
// and nothing else. Its permission denies everything, then allows each
// granted primitive; the order of the keys is the order of the rules.
func Config(request app.TurnRequest, agent string) string {
	var permission strings.Builder
	permission.WriteString(`{"*":"deny"`)
	for _, tool := range request.Primitives {
		name, _ := json.Marshal(tool)
		permission.WriteString(",")
		permission.Write(name)
		permission.WriteString(`:"allow"`)
	}
	permission.WriteString("}")
	type generated struct {
		Mode       string          `json:"mode"`
		Prompt     string          `json:"prompt,omitempty"`
		Permission json.RawMessage `json:"permission"`
	}
	config, _ := json.Marshal(map[string]any{"agent": map[string]any{
		agent: generated{Mode: "primary", Prompt: SystemPrompt(request), Permission: json.RawMessage(permission.String())},
	}})
	return string(config)
}

// SystemPrompt is the generated agent's prompt: the instruction, then the
// output schema the final answer must meet; empty when there is neither.
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

// agentName is a name no config can have defined an agent under.
func agentName() (string, error) {
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return agentPrefix + hex.EncodeToString(random), nil
}

func (r *Runner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	agent, err := agentName()
	if err != nil {
		return supervisor.Failed(run.ClassInternal, err)
	}
	args, err := Arguments(request, agent)
	if err != nil {
		return supervisor.Failed(run.ClassInternal, err)
	}
	state := &Stream{ResumedSessionID: request.ResumeSessionID}
	evidence := r.Transport.Run(ctx, supervisor.Spec{
		Command:   r.Command,
		Args:      args,
		Dir:       request.Cwd,
		Env:       []string{ConfigVariable + "=" + Config(request, agent)},
		Stdin:     request.Prompt,
		Timeout:   request.Timeout,
		KillGrace: r.KillGrace,
	}, sink, func(line string) {
		for _, event := range state.Reduce(line) {
			switch {
			case event.Started != nil:
				if reportsToolCalls {
					sink.ToolStarted(*event.Started)
				}
			case event.Finished != "":
				if reportsToolCalls {
					sink.ToolFinished(event.Finished)
				}
			default:
				sink.Event(event.Source, event.Kind, event.Data)
			}
		}
	})
	return state.Reconcile(evidence, len(request.OutputSchema) > 0)
}

// Event is what a line of the stream reduces to, in order: a normalized
// observation, a tool call that started (Started), or the ID of one that
// finished (Finished).
type Event struct {
	Source string
	Kind   string
	Data   map[string]any

	Started  *app.ToolCall
	Finished string
}

// Failure is an error the stream reported: its type's name, its message
// and, for an error a provider's API returned, the HTTP status, which
// OpenCode keeps apart from the message (error.data.statusCode on 1.18.33).
type Failure struct {
	Name       string
	Message    string
	StatusCode int
}

// Text is the error as reported: its name, status and message.
func (f Failure) Text() string {
	text := f.Name
	if f.StatusCode != 0 {
		text = strings.TrimSpace(fmt.Sprintf("%s %d", f.Name, f.StatusCode))
	}
	if text != "" && f.Message != "" {
		return text + ": " + f.Message
	}
	return text + f.Message
}

// Stream reduces OpenCode's JSON event lines.
type Stream struct {
	// The session a resume turn resumes; the turn must report it.
	ResumedSessionID string
	// SessionID is the session the stream's events name.
	SessionID string
	// Final is the text of the step that ended the turn, which a completed
	// turn returns; LastText the latest non-empty assistant text, which a
	// failed one does.
	Final    string
	LastText string
	// Errors are the errors the stream reported, in order.
	Errors []Failure
	// Reason is the reason of the latest step_finish. Ended is set by one
	// that is not "tool-calls", and cleared when another step starts: the
	// turn is decided only by its last step.
	Reason string
	Ended  bool
	// text is the text of the step under way.
	text  string
	usage tally
	// started and finished are the tool calls already reported so.
	started, finished map[string]bool
}

func (s *Stream) Reduce(line string) []Event {
	if strings.TrimSpace(line) == "" {
		return nil
	}
	var message map[string]any
	if err := json.Unmarshal([]byte(line), &message); err != nil {
		return []Event{{Source: run.SourceAgister, Kind: "STREAM_PARSE_ERROR", Data: map[string]any{"line": truncate(line, 200)}}}
	}
	var events []Event
	if id, _ := message["sessionID"].(string); id != "" && s.SessionID == "" {
		s.SessionID = id
		events = append(events, Event{Source: run.SourceProtocol, Kind: "PROVIDER_SESSION_BOUND", Data: map[string]any{"provider_session_id": id}})
	}
	part, _ := message["part"].(map[string]any)
	switch message["type"] {
	case "step_start":
		// Another step: the one before did not end the turn.
		s.Ended, s.text = false, ""
		events = append(events, Event{Source: run.SourceProtocol, Kind: "TURN_STARTED"})
	case "tool_use":
		exact, _ := exactly(line)["part"].(map[string]any)
		events = append(events, s.toolUse(exact)...)
	case "text":
		if text, _ := part["text"].(string); text != "" {
			s.text += text
			if strings.TrimSpace(text) != "" {
				s.LastText = text
				events = append(events, Event{Source: run.SourceProtocol, Kind: "ASSISTANT_TEXT", Data: map[string]any{"text": truncate(text, 500)}})
			}
		}
	case "step_finish":
		tokens, _ := part["tokens"].(map[string]any)
		s.usage.add(tokens, part["cost"])
		s.Reason, _ = part["reason"].(string)
		if s.Reason == "tool-calls" {
			break
		}
		s.Ended, s.Final = true, s.text
		kind := "TURN_COMPLETED"
		if s.Reason != "stop" {
			kind = "TURN_FAILED"
		}
		events = append(events, Event{Source: run.SourceProtocol, Kind: kind, Data: map[string]any{"stop_reason": s.Reason}})
	case "error":
		reported, _ := message["error"].(map[string]any)
		data, _ := reported["data"].(map[string]any)
		var failure Failure
		failure.Name, _ = reported["name"].(string)
		failure.Message, _ = data["message"].(string)
		status, _ := data["statusCode"].(float64)
		failure.StatusCode = int(status)
		s.Errors = append(s.Errors, failure)
		fields := map[string]any{"name": failure.Name, "message": truncate(failure.Text(), 300)}
		if failure.StatusCode != 0 {
			fields["status_code"] = failure.StatusCode
		}
		events = append(events, Event{Source: run.SourceProtocol, Kind: "PROVIDER_ERROR", Data: fields})
	}
	return events
}

// toolUse reports a tool call from its part: its start the first time the
// call is seen, and its finish once its state has ended.
func (s *Stream) toolUse(part map[string]any) []Event {
	id, _ := part["callID"].(string)
	name, _ := part["tool"].(string)
	state, _ := part["state"].(map[string]any)
	status, _ := state["status"].(string)
	var events []Event
	if !s.started[id] {
		input := wholeInput(state["input"])
		events = append(events,
			Event{Source: run.SourceProtocol, Kind: "TOOL_REQUESTED", Data: map[string]any{"tool_use_id": id, "name": name, "input": truncate(input, 300)}},
			Event{Started: &app.ToolCall{ID: id, Name: name, Input: input, Command: name == commandTool}})
		if s.started == nil {
			s.started = map[string]bool{}
		}
		s.started[id] = true
	}
	if (status == "completed" || status == "error") && !s.finished[id] {
		events = append(events, Event{Source: run.SourceProtocol, Kind: "TOOL_RESULT", Data: map[string]any{"tool_use_id": id, "is_error": status == "error"}})
		if id != "" {
			events = append(events, Event{Finished: id})
		}
		if s.finished == nil {
			s.finished = map[string]bool{}
		}
		s.finished[id] = true
	}
	return events
}

// fallback is what OpenCode prints when it does not find the agent named
// and runs its default one instead.
const fallback = "Falling back to default agent"

// Reconcile decides the turn outcome from the stream and the transport.
func (s *Stream) Reconcile(evidence supervisor.Evidence, schemaRequested bool) run.Turn {
	turn := supervisor.Base(evidence)
	if failed, ok := supervisor.RecordFailure(turn, evidence); ok {
		return failed
	}
	turn.ProviderSessionID = s.SessionID
	// What the turn's model work cost, however the turn ends, a resume that
	// reported another session included.
	turn.Usage, turn.CostUSD = s.usage.totals()
	if s.resumedElsewhere() {
		turn.Status, turn.Error = run.Failed, run.Fault(run.ClassRuntimeError, "resumed session %s, but the runtime reported session %q", s.ResumedSessionID, s.SessionID)
		return turn
	}
	turn.Text = s.LastText
	if strings.Contains(evidence.StderrTail, fallback) {
		turn.Status, turn.Error = run.Failed, run.Fault(run.ClassRuntimeError, "the runtime did not find the generated agent and ran its default agent, which the grants do not bound")
		return turn
	}
	if len(s.Errors) > 0 {
		// An error fails the turn whatever follows it; Agister's own
		// timeout or cancellation comes first.
		last := s.Errors[len(s.Errors)-1]
		if evidence.TimedOut || evidence.Aborted {
			return supervisor.WithoutTerminal(turn, evidence, last.Text())
		}
		turn.Status, turn.Error = run.Failed, classify("error", last)
		return turn
	}
	code := 0
	if evidence.Exit != nil && evidence.Exit.Code != nil {
		code = *evidence.Exit.Code
	}
	// A process Agister timed out, cancelled or that a signal ended did
	// not end cleanly, whatever its last step reported.
	interrupted := evidence.TimedOut || evidence.Aborted || (evidence.Exit != nil && evidence.Exit.Signal != "")
	if !s.Ended || (s.Reason == "stop" && (code != 0 || interrupted)) {
		return supervisor.WithoutTerminal(turn, evidence, "")
	}
	if s.Reason != "stop" {
		turn.Status, turn.Error = run.Failed, classify(s.Reason, Failure{})
		return turn
	}
	if schemaRequested {
		text := strings.TrimSpace(s.Final)
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
	turn.Text = s.Final
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

// classify maps a failure the stream reported, an error event or a final
// step that did not stop normally, to a failure class: by the error's
// status and name, then by its text. Only the error of an unknown model has
// been observed live.
func classify(reason string, failure Failure) *run.Error {
	text := "runtime reported " + reason
	if reason == "" {
		text = "runtime reported no stop reason"
	}
	message := failure.Text()
	if message != "" {
		text += ": " + truncate(message, 300)
	}
	lower := strings.ToLower(message)
	class := run.ClassRuntimeError
	switch {
	case failure.StatusCode == 429:
		class = run.ClassRateLimited
	case failure.StatusCode == 401 || failure.StatusCode == 403 || failure.Name == "ProviderAuthError":
		class = run.ClassAuth
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

// tally sums the usage of the steps a turn finished. A figure is known
// only if every step reported it.
type tally struct {
	input, output, reasoning, cacheRead, cacheWrite, cost sum
	steps                                                 int
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

func (t *tally) add(tokens map[string]any, cost any) {
	t.steps++
	t.input.add(tokens["input"])
	t.output.add(tokens["output"])
	t.reasoning.add(tokens["reasoning"])
	cache, _ := tokens["cache"].(map[string]any)
	t.cacheRead.add(cache["read"])
	t.cacheWrite.add(cache["write"])
	t.cost.add(cost)
}

// totals is the turn's usage and cost; nil when no step finished.
func (t *tally) totals() (*run.Usage, *float64) {
	if t.steps == 0 {
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
		ReasoningTokens:  count(t.reasoning),
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

// wholeInput is a tool's input: the same text for the same input.
func wholeInput(input any) string {
	if text, ok := input.(string); ok {
		return text
	}
	data, _ := json.Marshal(input)
	return string(data)
}

func truncate(text string, max int) string {
	if len(text) <= max {
		return text
	}
	return text[:max] + "…"
}
