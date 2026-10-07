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
// A turn given skills (ADR-021) runs Codex with CODEX_HOME set to a home
// of its thread's: Codex takes no skill folder, loads skills from
// $CODEX_HOME/skills, and resumes a thread only with the CODEX_HOME it ran
// in. A fresh thread whose turn names skills gets a new home under Homes,
// holding links to the user's auth.json, AGENTS.md and AGENTS.override.md
// where they exist, and skills/: a link to each entry of the user's
// $CODEX_HOME/skills but .system, which Codex writes into the home itself,
// and the turn's skills, <home>/skills/<name>/SKILL.md from their bytes. A
// user's skill named as one of the turn's is linked as <name>.user, a
// folder name the naming rule of settings rejects, so no turn's skill can
// take it: both are given, each with its own front matter (ADR-021 rule
// 7). After the turn the home is named by the thread Codex reported, as
// Pi's sessions are, or removed when it reported none; a home that cannot
// be so named fails the turn, naming where it stays. A turn that resumes
// a thread whose home is under Homes runs with it, made ready as a fresh
// one is, whatever else Codex keeps there: the links to the user's files
// as the user's CODEX_HOME holds them now, and skills/ rebuilt; a skills/
// that is not a folder, a link among them, is removed, never followed; a
// home under the thread's name that is not a folder, a link among them,
// fails the turn before Codex starts. A
// thread with no home there ran in the user's CODEX_HOME, where a turn's
// skills cannot be given, so a turn naming skills is refused before Codex
// starts; Admit refuses it by the same rule before the call has any
// effect. Every other turn runs with the user's CODEX_HOME, its
// environment unchanged. argv is the same either way.
//
// Codex reports no cost. The thread's cost, every turn it had, is
// ccusage's: `ccusage codex session --json` prices each session from its
// rollout (observed with ccusage 20.0.26), read after the turn within
// what is left of the turn's timeout, with the CODEX_HOME the turn ran
// with. The lookup is supervised as the runtime process is: its group is
// on record, and ended on timeout or cancellation. A lookup that fails
// leaves the cost unknown, and nothing else about the turn.
//
// Tool calls are reported as they start and finish: item.started and
// item.completed of a command execution, file change, MCP call or web
// search, with the item's whole input. A command execution is the tool that
// runs commands; a file change writes the path of each of its changes.
// Codex's stream lists no tool call it refused for want of a permission, so
// none is reported.
//
// Only turn.completed and turn.failed decide a turn. Top-level `error`
// events and error items occur mid-turn (reconnects, transport fallback)
// and are recorded, not terminal.
//
// A turn Codex refuses before it starts ends with a non-zero exit and its
// reason on stderr only, as a prompt over the input limit does
// (input_too_large, observed with codex-cli 0.159.2); the error message
// quotes it (withoutTerminal).
package codex

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const Contract = "codex/2"

var sandboxModes = []string{"read-only", "workspace-write"}

// Transport is what the runner needs of a process supervisor: to run the
// runtime to its exit, passing each line of its stdout to onLine, and to
// read the runtime's version.
type Transport interface {
	Run(ctx context.Context, spec Spec, sink Sink, onLine func(string)) Evidence
	Version(ctx context.Context, command string) (string, error)
}

// Spec is the process a turn runs.
type Spec struct {
	Command string
	Args    []string
	Dir     string
	// Env is added to the environment the process inherits, as
	// "KEY=value"; it replaces an inherited variable of the same name.
	Env       []string
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
	KillGrace time.Duration
	// Homes is the directory the Codex homes of threads given skills are
	// kept under, one per thread, named by its ID; empty:
	// agister-codex-homes in the temporary directory.
	Homes string
	// UserHome tells the user's own CODEX_HOME, whose files and skills a
	// home of Agister's links to; nil: the user has none to link.
	UserHome func() (string, error)
	// Sessions lists Codex sessions with their costs, as
	// `ccusage codex session --json` does; nil: the cost is unknown.
	Sessions Sessions
	// Now tells the time the turn's timeout is measured by; nil: time.Now.
	Now func() time.Time
}

// Sessions returns the output of `ccusage codex session --json` with
// CODEX_HOME set to home (empty: the user's own, the environment
// unchanged), ending the lookup once timeout passes or ctx ends. It
// reports its process to sink as the runtime's is reported.
type Sessions func(ctx context.Context, timeout time.Duration, home string, sink LookupSink) ([]byte, error)

// LookupSink is what a lookup reports to: its events and its process, as
// the turn's sink takes them. A lookup has no raw output to report.
type LookupSink interface {
	Event(source, kind string, data map[string]any)
	ProcessStarted(ref string) error
}

func New(command string, transport Transport) *Runner {
	if command == "" {
		command = "codex"
	}
	return &Runner{Command: command, Transport: transport, Sessions: CCUsage(transport, "ccusage", 0)}
}

// Execution is what a ccusage lookup needs of a process supervisor: to run
// the lookup to its exit, passing each line of its stdout to onLine.
type Execution interface {
	Run(ctx context.Context, spec Spec, sink Sink, onLine func(string)) Evidence
}

// CCUsage runs `<command> codex session --json` through execution, in a
// process group of its own that is ended on timeout or cancellation;
// killGrace bounds the wait for it as it does a runtime's (zero: the
// supervisor's default). Anything but a clean exit is an error. Its output
// is the listing, not the turn's raw output.
func CCUsage(execution Execution, command string, killGrace time.Duration) Sessions {
	return func(ctx context.Context, timeout time.Duration, home string, sink LookupSink) ([]byte, error) {
		var listing bytes.Buffer
		evidence := execution.Run(ctx, Spec{
			Command:   command,
			Args:      []string{"codex", "session", "--json"},
			Env:       homeEnv(home),
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
			return nil, fmt.Errorf("%s exited without a listing: %s", command, reason(evidence))
		}
		return listing.Bytes(), nil
	}
}

// lookupSink gives the transport a lookup's sink: its output is the
// listing, not the runtime's raw output, so Raw drops it.
type lookupSink struct{ LookupSink }

func (lookupSink) Raw(string) {}

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

func (r *Runner) Identity(ctx context.Context) (RuntimeIdentity, error) {
	out, err := r.Transport.Version(ctx, r.Command)
	if err != nil {
		return RuntimeIdentity{}, err
	}
	version := versionPattern.FindString(out)
	if version == "" {
		return RuntimeIdentity{}, fmt.Errorf("unrecognized version output %q", out)
	}
	return RuntimeIdentity{Contract: Contract, Version: version, Resume: true, ToolCalls: true, Skills: true}, nil
}

// Arguments builds the command line for a turn.
func Arguments(request TurnRequest, schemaPath string) ([]string, error) {
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
func Prompt(request TurnRequest) string {
	if request.Instruction == "" {
		return request.Prompt
	}
	return "<instructions>\n" + request.Instruction + "\n</instructions>\n\n" + request.Prompt
}

func (r *Runner) RunTurn(ctx context.Context, request TurnRequest, sink EventSink) Turn {
	now := r.Now
	if now == nil {
		now = time.Now
	}
	deadline := now().Add(request.Timeout)
	var schemaPath string
	if len(request.OutputSchema) > 0 {
		dir, err := os.MkdirTemp("", "agister-codex-")
		if err != nil {
			return failedTurn(ClassInternal, err)
		}
		defer os.RemoveAll(dir)
		schemaPath = filepath.Join(dir, "output-schema.json")
		if err := os.WriteFile(schemaPath, request.OutputSchema, 0o600); err != nil {
			return failedTurn(ClassInternal, err)
		}
	}
	args, err := Arguments(request, schemaPath)
	if err != nil {
		return failedTurn(ClassInternal, err)
	}
	root := r.homes()
	home, fresh, fault := r.home(root, request)
	if fault != nil {
		return Turn{Status: StatusOf(fault.Class), Error: fault}
	}
	state := &Stream{ResumedThreadID: request.ResumeSessionID}
	evidence := r.Transport.Run(ctx, Spec{
		Command:   r.Command,
		Args:      args,
		Dir:       request.Cwd,
		Env:       homeEnv(home),
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
				sink.ToolFinished(*tool.Finished)
			}
		}
		// Permission denials would be reported here: Codex's stream has
		// none, in its events or at the turn's end.
	})
	turn := state.Reconcile(evidence, schemaPath != "")
	if fresh {
		kept, err := keep(root, home, state.ThreadID)
		if err != nil {
			message := fmt.Sprintf("thread %s's CODEX_HOME stays at %s, where no turn resumes it: %v", state.ThreadID, home, err)
			if turn.Error != nil {
				message += "; the turn: " + turn.Error.String()
			}
			turn.Status, turn.Error = Failed, Fault(ClassInternal, "%s", message)
			return turn
		}
		if home = kept; home == "" {
			// No thread is left to price.
			return turn
		}
	}
	r.cost(ctx, &turn, request.ResumeSessionID, home, deadline.Sub(now()), sink)
	return turn
}

// userFiles are the files of the user's CODEX_HOME a home of Agister's
// links to, where they exist.
func userFiles() []string { return []string{"auth.json", "AGENTS.md", "AGENTS.override.md"} }

// systemSkills is the folder of a home's skills Codex writes itself.
const systemSkills = ".system"

// homeEnv is the environment a process runs with in the CODEX_HOME home;
// none for the user's own (empty).
func homeEnv(home string) []string {
	if home == "" {
		return nil
	}
	return []string{"CODEX_HOME=" + home}
}

// home is the CODEX_HOME a turn runs with, made ready for it under root:
// empty for the user's own. A fresh thread given skills gets a new one,
// which fresh reports; a resumed thread keeps the one it ran in; either is
// made ready the same way (prepare). A fault ends the turn before Codex
// starts: a thread ID that cannot name a folder, a home that cannot be
// made, or skills for a thread that ran in the user's CODEX_HOME, which
// refuses the turn.
func (r *Runner) home(root string, request TurnRequest) (home string, fresh bool, fault *Error) {
	id := request.ResumeSessionID
	if id == "" {
		if len(request.Skills) == 0 {
			return "", false, nil
		}
		if err := os.MkdirAll(root, 0o700); err != nil {
			return "", false, Fault(ClassInternal, "%v", err)
		}
		dir, err := os.MkdirTemp(root, "new-")
		if err != nil {
			return "", false, Fault(ClassInternal, "%v", err)
		}
		if err := r.prepare(dir, request.Skills); err != nil {
			os.RemoveAll(dir)
			return "", false, Fault(ClassInternal, "%v", err)
		}
		return dir, true, nil
	}
	dir, fault := threadHome(root, id, request.Skills)
	if dir == "" || fault != nil {
		return "", false, fault
	}
	if err := r.prepare(dir, request.Skills); err != nil {
		return "", false, Fault(ClassInternal, "%v", err)
	}
	return dir, false, nil
}

// Admit tells, before a call has any effect, whether a turn that resumes
// thread request.ResumeSessionID with request.Skills can run: by the rule
// home applies (threadHome), under the same root. A fresh thread can.
func (r *Runner) Admit(request TurnRequest) *Error {
	if request.ResumeSessionID == "" {
		return nil
	}
	_, fault := threadHome(r.homes(), request.ResumeSessionID, request.Skills)
	return fault
}

// homes is the directory the homes of threads given skills are kept under.
func (r *Runner) homes() string {
	if r.Homes == "" {
		return filepath.Join(os.TempDir(), "agister-codex-homes")
	}
	return r.Homes
}

// threadHome is the home under root resumed thread id ran in; empty when
// it ran in the user's CODEX_HOME, which a turn with skills cannot resume:
// the turn is refused. A thread ID that cannot name a folder, or a home
// under its name that cannot be read or is not a folder, is a fault.
func threadHome(root, id string, skills []Skill) (string, *Error) {
	if !validID(id) {
		return "", Fault(ClassRuntimeError, "%s cannot resume thread %q: not a thread ID", Contract, id)
	}
	dir := filepath.Join(root, id)
	info, err := os.Lstat(dir)
	switch {
	case errors.Is(err, fs.ErrNotExist) && len(skills) == 0:
		return "", nil
	case errors.Is(err, fs.ErrNotExist):
		names := make([]string, len(skills))
		for i, skill := range skills {
			names[i] = skill.Name
		}
		return "", Fault(ClassRefused, "thread %s ran in the user's CODEX_HOME, where a call's skills cannot be given (ADR-021): %s; a fresh run gets them",
			id, strings.Join(names, ", "))
	case err != nil:
		return "", Fault(ClassInternal, "%v", err)
	case !info.IsDir():
		return "", Fault(ClassInternal, "%s cannot resume thread %s: %s is not its CODEX_HOME", Contract, id, dir)
	}
	return dir, nil
}

// userHome is the user's own CODEX_HOME, absolute; empty when the runner
// has none.
func (r *Runner) userHome() (string, error) {
	if r.UserHome == nil {
		return "", nil
	}
	home, err := r.UserHome()
	if err == nil && home == "" {
		err = errors.New("it is empty")
	}
	if err != nil {
		return "", fmt.Errorf("the user's CODEX_HOME is unknown: %w", err)
	}
	return filepath.Abs(home)
}

// prepare makes home, new or a resumed thread's, a Codex home of the
// user's and of a turn's skills, before every turn: its links to the
// user's files (linkUserFiles) and its skills/ (giveSkills).
func (r *Runner) prepare(home string, skills []Skill) error {
	user, err := r.userHome()
	if err != nil {
		return err
	}
	if err := linkUserFiles(home, user); err != nil {
		return err
	}
	return giveSkills(home, user, skills)
}

// linkUserFiles makes the links of home to the user's files (userFiles) as
// the user's CODEX_HOME holds them now: a link already at one of their
// names goes, and one is made to each that exists. Anything else at one of
// their names, a file Codex wrote itself, is left as it is. user empty:
// no link is made.
func linkUserFiles(home, user string) error {
	for _, name := range userFiles() {
		at := filepath.Join(home, name)
		info, err := os.Lstat(at)
		switch {
		case errors.Is(err, fs.ErrNotExist):
		case err != nil:
			return err
		case info.Mode()&fs.ModeSymlink == 0:
			continue
		default:
			if err := os.Remove(at); err != nil {
				return err
			}
		}
		if user == "" {
			continue
		}
		target := filepath.Join(user, name)
		if _, err := os.Stat(target); errors.Is(err, fs.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}
		if err := os.Symlink(target, at); err != nil {
			return err
		}
	}
	return nil
}

// giveSkills rebuilds the skills/ of home for a turn: a skills/ that is not
// a folder is removed, not followed, and a folder made; every entry but
// .system, Codex's own, goes; then each entry of the user's <user>/skills
// but .system is linked, under its own name or, when it is named as one of
// the turn's skills, under userName's; and each of the turn's is written,
// <name>/SKILL.md from its bytes. user empty: nothing of the user's is
// linked.
func giveSkills(home, user string, skills []Skill) error {
	given := map[string]bool{}
	for _, skill := range skills {
		if name := skill.Name; name != filepath.Base(name) || name == "." || name == ".." {
			return fmt.Errorf("%s cannot give skill %q: not a folder's name", Contract, name)
		}
		given[skill.Name] = true
	}
	dir := filepath.Join(home, "skills")
	if err := ownFolder(dir); err != nil {
		return err
	}
	held, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, entry := range held {
		if entry.Name() != systemSkills {
			if err := os.RemoveAll(filepath.Join(dir, entry.Name())); err != nil {
				return err
			}
		}
	}
	if user != "" {
		mine, err := os.ReadDir(filepath.Join(user, "skills"))
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		taken := map[string]bool{}
		for _, entry := range mine {
			taken[entry.Name()] = true
		}
		for _, entry := range mine {
			name := entry.Name()
			if name == systemSkills {
				continue
			}
			link := name
			if given[name] {
				link = userName(name, func(name string) bool { return taken[name] || given[name] })
			}
			if err := os.Symlink(filepath.Join(user, "skills", name), filepath.Join(dir, link)); err != nil {
				return err
			}
		}
	}
	for _, skill := range skills {
		if err := os.Mkdir(filepath.Join(dir, skill.Name), 0o700); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, skill.Name, "SKILL.md"), skill.Bytes, 0o600); err != nil {
			return err
		}
	}
	return nil
}

// ownFolder makes dir a folder the adapter owns: one that is there is
// kept; anything else at dir, a link to the user's skills among them, is
// removed itself, never what it links to, and a folder made in its place.
func ownFolder(dir string) error {
	info, err := os.Lstat(dir)
	switch {
	case errors.Is(err, fs.ErrNotExist):
	case err != nil:
		return err
	case info.IsDir():
		return nil
	default:
		if err := os.Remove(dir); err != nil {
			return err
		}
	}
	return os.Mkdir(dir, 0o700)
}

// userName is the folder name a user's skill named as one of a turn's is
// linked under: <name>.user, which the naming rule of settings rejects, so
// no turn's skill takes it; another .user is added while taken says the
// name is in use.
func userName(name string, taken func(string) bool) string {
	link := name + ".user"
	for taken(link) {
		link += ".user"
	}
	return link
}

// keep names a fresh thread's home after the thread Codex reported, for
// the turns that resume it, and returns where the home is; it removes the
// home, returning empty, when Codex reported no thread, or one that
// cannot name a folder. A home that cannot be named so stays where it is,
// its thread cannot be resumed with it, and the error says why.
func keep(root, home, id string) (string, error) {
	if !validID(id) {
		os.RemoveAll(home)
		return "", nil
	}
	named := filepath.Join(root, id)
	if err := os.Rename(home, named); err != nil {
		return home, err
	}
	return named, nil
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// validID reports whether id can name a folder under the homes root.
func validID(id string) bool { return idPattern.MatchString(id) }

// cost sets the thread's cost on a turn that reported the thread it ran
// on, looking it up with the CODEX_HOME home the turn ran with (empty:
// the user's own) within left, what remains of the turn's timeout; a
// failed, timed-out or cancelled lookup leaves it unknown, and none is
// started once the turn's time is up or its call is cancelled.
func (r *Runner) cost(ctx context.Context, turn *Turn, resumed, home string, left time.Duration, sink LookupSink) {
	thread := turn.ProviderSessionID
	if r.Sessions == nil || thread == "" || resumed != "" && thread != resumed || left <= 0 || ctx.Err() != nil {
		return
	}
	listing, err := r.Sessions(ctx, left, home, sink)
	if err != nil {
		return
	}
	cost := ThreadCost(listing, thread)
	if cost == nil {
		return
	}
	if turn.Session == nil {
		turn.Session = &SessionTotals{}
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

func (s *Stream) Reduce(line string) []Event {
	if strings.TrimSpace(line) == "" {
		return nil
	}
	var message map[string]any
	if err := json.Unmarshal([]byte(line), &message); err != nil {
		return []Event{{SourceAgister, "STREAM_PARSE_ERROR", map[string]any{"line": truncate(line, 200)}}}
	}
	switch message["type"] {
	case "thread.started":
		s.ThreadID, _ = message["thread_id"].(string)
		return []Event{{SourceProtocol, "PROVIDER_SESSION_BOUND", map[string]any{"provider_session_id": s.ThreadID}}}
	case "turn.started":
		return []Event{{SourceProtocol, "TURN_STARTED", nil}}
	case "item.started":
		item, _ := exactly(line)["item"].(map[string]any)
		if name := toolName(item); name != "" {
			id, _ := item["id"].(string)
			s.tools = append(s.tools, Tool{Started: &ToolCall{ID: id, Name: name, Input: wholeInput(item), Command: item["type"] == "command_execution", Writes: writes(item)}})
			return []Event{{SourceProtocol, "TOOL_REQUESTED", map[string]any{"tool_use_id": item["id"], "name": name, "input": toolInput(item)}}}
		}
	case "item.completed":
		item, _ := message["item"].(map[string]any)
		return s.itemCompleted(item)
	case "error":
		s.LastError = fmt.Sprint(message["message"])
		return []Event{{SourceProtocol, "PROVIDER_ERROR", map[string]any{"message": truncate(s.LastError, 300)}}}
	case "turn.completed":
		s.Completed = true
		s.Usage, _ = message["usage"].(map[string]any)
		return []Event{{SourceProtocol, "TURN_COMPLETED", map[string]any{"usage": s.Usage}}}
	case "turn.failed":
		failure, _ := message["error"].(map[string]any)
		s.Failed = fmt.Sprint(failure["message"])
		if s.Failed == "" || s.Failed == "<nil>" {
			s.Failed = "unknown error"
		}
		return []Event{{SourceProtocol, "TURN_FAILED", map[string]any{"error": s.Failed}}}
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

func (s *Stream) itemCompleted(item map[string]any) []Event {
	switch item["type"] {
	case "agent_message":
		text, _ := item["text"].(string)
		s.LastMessage = text
		return []Event{{SourceProtocol, "ASSISTANT_TEXT", map[string]any{"text": truncate(text, 500)}}}
	case "error":
		return []Event{{SourceProtocol, "PROVIDER_ERROR", map[string]any{"message": truncate(fmt.Sprint(item["message"]), 300)}}}
	case "command_execution", "file_change", "mcp_tool_call", "web_search":
		if id, _ := item["id"].(string); id != "" {
			// Only a command's item carries its output.
			output, reported := item["aggregated_output"].(string)
			s.tools = append(s.tools, Tool{Finished: finished(id, output, reported)})
		}
		failed := item["status"] == "failed"
		if code, ok := item["exit_code"].(float64); ok && code != 0 {
			failed = true
		}
		return []Event{{SourceProtocol, "TOOL_RESULT", map[string]any{"tool_use_id": item["id"], "is_error": failed}}}
	}
	return nil
}

// Reconcile decides the turn outcome from the stream and the transport.
func (s *Stream) Reconcile(evidence Evidence, schemaRequested bool) Turn {
	turn := baseTurn(evidence)
	if failed, ok := recordFailure(turn, evidence); ok {
		return failed
	}
	turn.ProviderSessionID = s.ThreadID
	if s.resumedElsewhere() {
		turn.Status, turn.Error = Failed, Fault(ClassRuntimeError, "resumed thread %s, but the runtime reported thread %q", s.ResumedThreadID, s.ThreadID)
		return turn
	}
	if !s.Completed && s.Failed == "" {
		return withoutTerminal(turn, evidence, s.LastError)
	}
	turn.Text = s.LastMessage
	if s.Failed != "" {
		turn.Status, turn.Error = Failed, classify(s.Failed)
		return turn
	}
	// The thread's usage, every turn it had; the turn's own is derived.
	if s.Usage != nil {
		turn.Session = &SessionTotals{Usage: &Usage{
			InputTokens:     count(s.Usage, "input_tokens"),
			OutputTokens:    count(s.Usage, "output_tokens"),
			CacheReadTokens: count(s.Usage, "cached_input_tokens"),
			ReasoningTokens: count(s.Usage, "reasoning_output_tokens"),
		}}
	}
	if schemaRequested {
		if s.LastMessage == "" {
			turn.Status, turn.Error = Failed, Fault(ClassInvalidOutput, "no structured output")
			return turn
		}
		if !json.Valid([]byte(s.LastMessage)) {
			turn.Status, turn.Error = Failed, Fault(ClassInvalidOutput, "structured output is not JSON")
			return turn
		}
		turn.Output = json.RawMessage(s.LastMessage)
	}
	turn.Status = Completed
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
func classify(message string) *Error {
	lower := strings.ToLower(message)
	class := ClassRuntimeError
	switch {
	case strings.Contains(lower, "rate limit") || strings.Contains(lower, "usage limit") || strings.Contains(lower, "429"):
		class = ClassRateLimited
	case strings.Contains(lower, "unauthorized") || strings.Contains(lower, "401") || strings.Contains(lower, "login"):
		class = ClassAuth
	case strings.Contains(lower, "context window") || strings.Contains(lower, "context length"):
		class = ClassContextOverflow
	}
	return Fault(class, "runtime reported turn.failed: %s", message)
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

// writes are the paths an item writes: for a file change, the path of each
// of its changes, in order, as Codex names it; none for any other item.
func writes(item map[string]any) []string {
	if item["type"] != "file_change" {
		return nil
	}
	changes, _ := item["changes"].([]any)
	var paths []string
	for _, change := range changes {
		fields, _ := change.(map[string]any)
		if path, _ := fields["path"].(string); path != "" {
			paths = append(paths, path)
		}
	}
	return paths
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
