package claudecode_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const session = "5145d89d-470e-4b56-a78c-da035d5de49b"

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"Read", "Grep"},
		Model:        "sonnet",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

func TestConformance(t *testing.T) {
	repo, head := repository(t, map[string]string{"AGENTS.md": "root agents"})
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return &claudecode.Runner{Command: command, KillGrace: 200 * time.Millisecond}
		},
		Fake:     runtimetest.Binary(t, "fakeclaude"),
		Contract: claudecode.Contract,
		Request: func(prompt string) app.TurnRequest {
			r := request(prompt)
			r.Cwd, r.InstructionCommit = repo, head
			return r
		},
	})
}

func TestArgumentsCarryPrimitivesAndContractFlags(t *testing.T) {
	args, err := claudecode.Arguments(request("hello"), nil)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk",
		"--tools=Read,Grep", "--allowedTools=Read,Grep",
		"--restricted", "--strict-mcp-config", "--model", "sonnet", "--effort", "high",
		"--append-system-prompt", "Do the thing.", "--json-schema", `{"type":"object"}`,
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
	for _, arg := range args {
		if arg == "hello" {
			t.Fatal("prompt must go on stdin, not argv")
		}
	}
}

func TestNoPrimitivesExposesNoTools(t *testing.T) {
	r := request("x")
	r.Primitives = nil
	args, _ := claudecode.Arguments(r, nil)
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--tools= ") || strings.Contains(joined, "--allowedTools") {
		t.Fatalf("args = %v", args)
	}
	r.Primitives = []string{"Bash(git diff:*)"}
	if _, err := claudecode.Arguments(r, nil); err == nil {
		t.Fatal("a primitive with spaces must be rejected")
	}
}

func TestStreamReduction(t *testing.T) {
	stream := &claudecode.Stream{ResumedSessionID: session}
	lines := []map[string]any{
		{"type": "system", "subtype": "init", "session_id": session, "model": "claude-haiku-4-5", "tools": []string{"Read"}},
		{"type": "stream_event", "event": map[string]any{"type": "message_start"}},
		{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "thinking"}, map[string]any{"type": "tool_use", "id": "t1", "name": "Read", "input": map[string]any{"file_path": "/etc/hostname"}}}}},
		{"type": "user", "message": map[string]any{"content": []any{map[string]any{"type": "tool_result", "tool_use_id": "t1", "is_error": false}}}},
		{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "text", "text": "The hostname is vm."}}}},
		{"type": "rate_limit_event", "rate_limit_info": map[string]any{"status": "allowed"}},
		{"type": "result", "subtype": "success", "is_error": false, "session_id": session, "total_cost_usd": 0.06, "structured_output": map[string]any{"answer": "vm"}},
	}
	var kinds []string
	for _, line := range lines {
		data, _ := json.Marshal(line)
		for _, event := range stream.Reduce(string(data)) {
			kinds = append(kinds, event.Kind)
		}
	}
	want := []string{"PROVIDER_SESSION_BOUND", "TOOL_REQUESTED", "TOOL_RESULT", "ASSISTANT_TEXT", "TURN_COMPLETED"}
	if !reflect.DeepEqual(kinds, want) {
		t.Fatalf("kinds = %v", kinds)
	}
	code := 0
	turn := stream.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, true)
	if turn.Status != run.Completed || string(turn.Output) != `{"answer":"vm"}` || turn.Text != "The hostname is vm." ||
		// The session's cost; the turn's own is the call's to derive.
		turn.CostUSD != nil || *turn.Session.CostUSD != 0.06 || turn.Session.Usage != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A resume turn must report the session it resumed: another one breaks
// the contract of resuming in place, whatever the result says.
func TestResumeReportingAnotherSessionFails(t *testing.T) {
	stream := &claudecode.Stream{ResumedSessionID: session}
	events := stream.Reduce(`{"type":"system","subtype":"init","session_id":"other"}`)
	if len(events) != 2 || events[1].Kind != "SESSION_ID_MISMATCH" {
		t.Fatalf("events = %+v", events)
	}
	stream.Reduce(`{"type":"result","subtype":"success","is_error":false,"session_id":"other"}`)
	code := 0
	turn := stream.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, false)
	if turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || turn.ProviderSessionID != "other" || !strings.Contains(turn.Error.Message, session) {
		t.Fatalf("turn = %+v", turn)
	}
	// A terminal result naming another session breaks it too, after an
	// init that named the resumed one.
	late := &claudecode.Stream{ResumedSessionID: session}
	late.Reduce(`{"type":"system","subtype":"init","session_id":"` + session + `"}`)
	if events := late.Reduce(`{"type":"result","subtype":"success","is_error":false,"session_id":"other"}`); len(events) != 2 || events[1].Kind != "SESSION_ID_MISMATCH" {
		t.Fatalf("events = %+v", events)
	}
	if turn := late.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.Contains(turn.Error.Message, `"other"`) {
		t.Fatalf("turn = %+v", turn)
	}
	// A result that names no session does not confirm the resumed one.
	silent := &claudecode.Stream{ResumedSessionID: session}
	silent.Reduce(`{"type":"result","subtype":"success","is_error":false}`)
	if turn := silent.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestGarbageIsRecorded(t *testing.T) {
	stream := &claudecode.Stream{}
	if events := stream.Reduce("{broken"); len(events) != 1 || events[0].Kind != "STREAM_PARSE_ERROR" {
		t.Fatalf("events = %+v", events)
	}
	if events := stream.Reduce("null"); len(events) != 0 {
		t.Fatalf("events = %+v", events)
	}
}

func TestResultPrecedence(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	with := func(result string) *claudecode.Stream {
		stream := &claudecode.Stream{}
		stream.Reduce(result)
		return stream
	}
	if turn := with(`{"type":"result","subtype":"success","is_error":true}`).Reconcile(clean, false); turn.Status != run.Failed {
		t.Fatalf("success with is_error must fail: %+v", turn)
	}
	if turn := with(`{"type":"result","subtype":"success","is_error":false}`).Reconcile(clean, true); turn.Status != run.Failed || turn.Error.Class != run.ClassInvalidOutput {
		t.Fatalf("missing structured output must fail: %+v", turn)
	}
	timedOut := supervisor.Evidence{TimedOut: true, Exit: &run.Exit{Signal: "terminated"}}
	if turn := with(`{"type":"result","subtype":"success","is_error":false}`).Reconcile(timedOut, false); turn.Status != run.Completed {
		t.Fatalf("a result before the timeout decides the turn: %+v", turn)
	}
}

// Agister chooses no session ID: a fresh turn names none, and a
// continuation resumes the reported one in place, without forking.
func TestContinuationResumesInPlaceAndCostLimitIsPassed(t *testing.T) {
	fresh, err := claudecode.Arguments(request("x"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if joined := strings.Join(fresh, " "); strings.Contains(joined, "--session-id") || strings.Contains(joined, "--resume") {
		t.Fatalf("fresh args = %v", fresh)
	}
	r := request("x")
	r.ResumeSessionID = "earlier"
	limit := 0.5
	r.MaxCostUSD = &limit
	args, err := claudecode.Arguments(r, nil)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--resume earlier --max-budget-usd 0.5") || strings.Contains(joined, "--fork-session") || strings.Contains(joined, "--session-id") {
		t.Fatalf("args = %v", args)
	}
}

func TestUsageIsNormalized(t *testing.T) {
	stream := &claudecode.Stream{}
	stream.Reduce(`{"type":"result","subtype":"success","is_error":false,"duration_ms":1200,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":30,"cache_creation_input_tokens":40}}`)
	code := 0
	turn := stream.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, false)
	u := turn.Usage
	if u == nil || *u.InputTokens != 10 || *u.OutputTokens != 20 || *u.CacheReadTokens != 30 || *u.CacheWriteTokens != 40 || u.ReasoningTokens != nil || *turn.RuntimeMS != 1200 {
		t.Fatalf("usage %+v, turn %+v", u, turn)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	for _, c := range []struct {
		name  string
		lines []string
		class run.Class
	}{
		{"budget (observed live)", []string{`{"type":"result","subtype":"error_max_budget_usd","is_error":true,"errors":["Reached maximum budget ($0.0001)"]}`}, run.ClassBudgetExhausted},
		{"http 429", []string{`{"type":"result","subtype":"success","is_error":true,"api_error_status":429}`}, run.ClassRateLimited},
		{"rejected by the rate limiter", []string{`{"type":"rate_limit_event","rate_limit_info":{"status":"rejected"}}`, `{"type":"result","subtype":"success","is_error":true}`}, run.ClassRateLimited},
		{"http 401", []string{`{"type":"result","subtype":"success","is_error":true,"api_error_status":401}`}, run.ClassAuth},
		{"prompt too long", []string{`{"type":"result","subtype":"success","is_error":true,"result":"Prompt is too long"}`}, run.ClassContextOverflow},
		{"anything else", []string{`{"type":"result","subtype":"error_max_turns","is_error":true}`}, run.ClassRuntimeError},
	} {
		stream := &claudecode.Stream{}
		for _, line := range c.lines {
			stream.Reduce(line)
		}
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != c.class {
			t.Errorf("%s: %+v", c.name, turn.Error)
		}
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	stream := &claudecode.Stream{}
	stream.Reduce(`{"type":"result","subtype":"success","is_error":false}`)
	turn := stream.Reconcile(supervisor.Evidence{RecordError: "disk full"}, false)
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassInternal || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}

// git runs git in dir as a test's author, and returns its output.
func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	config := []string{"-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "maintenance.auto=false"}
	command := exec.Command("git", append(config, args...)...)
	command.Dir = dir
	out, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// repository makes a git repository whose first commit holds files, by
// path relative to it, and returns it and that commit.
func repository(t *testing.T, files map[string]string) (dir, head string) {
	t.Helper()
	dir = t.TempDir()
	git(t, dir, "init", "--quiet")
	return dir, commit(t, dir, files)
}

// commit writes files into dir and commits every change there.
func commit(t *testing.T, dir string, files map[string]string) string {
	t.Helper()
	write(t, dir, files)
	git(t, dir, "add", "--all")
	git(t, dir, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", "change")
	return git(t, dir, "rev-parse", "HEAD")
}

func write(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for path, content := range files {
		full := filepath.Join(dir, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func paths(files []claudecode.InstructionFile) []string {
	out := []string{}
	for _, file := range files {
		out = append(out, file.Path)
	}
	return out
}

func contents(files []claudecode.InstructionFile) []string {
	out := []string{}
	for _, file := range files {
		out = append(out, string(file.Content))
	}
	return out
}

// Claude Code loads AGENTS.md and CLAUDE.md along the path from the
// repository root to the working directory, root first; a directory
// beside or below that path gives nothing, and a symbolic link is followed
// within the commit.
func TestInstructionFilesFollowThePathFromTheRoot(t *testing.T) {
	repo := t.TempDir()
	git(t, repo, "init", "--quiet")
	write(t, repo, map[string]string{
		"AGENTS.md":                  "root agents",
		"CLAUDE.md":                  "root claude",
		"pkg/AGENTS.md":              "pkg agents",
		"pkg/sub/CLAUDE.md":          "sub claude",
		"pkg/sub/deeper/AGENTS.md":   "below the working directory",
		"other/AGENTS.md":            "sibling",
		"pkg/sibling/CLAUDE.md":      "sibling below the root",
		"pkg/sub/notes/instructions": "not an instruction file",
	})
	if err := os.Symlink("AGENTS.md", filepath.Join(repo, "pkg", "CLAUDE.md")); err != nil {
		t.Fatal(err)
	}
	head := commit(t, repo, nil)
	got, err := claudecode.ReadInstructions(context.Background(), filepath.Join(repo, "pkg", "sub"), head, nil)
	if err != nil {
		t.Fatal(err)
	}
	wantPaths := []string{"AGENTS.md", "CLAUDE.md", "pkg/AGENTS.md", "pkg/CLAUDE.md", "pkg/sub/CLAUDE.md"}
	wantContents := []string{"root agents", "root claude", "pkg agents", "pkg agents", "sub claude"}
	if got.Commit != head || !reflect.DeepEqual(paths(got.Files), wantPaths) || !reflect.DeepEqual(contents(got.Files), wantContents) {
		t.Fatalf("instructions = %s %q %q, want %s %q %q", got.Commit, paths(got.Files), contents(got.Files), head, wantPaths, wantContents)
	}
	// At the root, only the root's own.
	got, err = claudecode.ReadInstructions(context.Background(), repo, head, nil)
	if err != nil || !reflect.DeepEqual(paths(got.Files), []string{"AGENTS.md", "CLAUDE.md"}) {
		t.Fatalf("paths = %q, %v", paths(got.Files), err)
	}
}

// The files are the commit's: an uncommitted edit, a staged file and a
// deletion from the working tree change nothing; a file the commit lacks
// is absent.
func TestInstructionFilesComeFromTheCommitNotTheWorkingTree(t *testing.T) {
	repo, head := repository(t, map[string]string{"AGENTS.md": "committed", "CLAUDE.md": "committed claude", "pkg/x.go": "package x"})
	write(t, repo, map[string]string{"AGENTS.md": "edited", "pkg/AGENTS.md": "staged", "pkg/CLAUDE.md": "untracked"})
	git(t, repo, "add", "pkg/AGENTS.md")
	if err := os.Remove(filepath.Join(repo, "CLAUDE.md")); err != nil {
		t.Fatal(err)
	}
	got, err := claudecode.ReadInstructions(context.Background(), filepath.Join(repo, "pkg"), head, nil)
	if err != nil || !reflect.DeepEqual(paths(got.Files), []string{"AGENTS.md", "CLAUDE.md"}) ||
		!reflect.DeepEqual(contents(got.Files), []string{"committed", "committed claude"}) {
		t.Fatalf("files = %q %q, %v", paths(got.Files), contents(got.Files), err)
	}
}

// promptOf is the appended system prompt of the turn sink recorded, and
// the INSTRUCTION_FILES event it recorded.
func promptOf(t *testing.T, sink *runtimetest.Recorder) (string, map[string]any) {
	t.Helper()
	var args []string
	var recorded map[string]any
	for _, event := range sink.Events {
		switch event.Kind {
		case "PROCESS_STARTED":
			args, _ = event.Data["args"].([]string)
		case "INSTRUCTION_FILES":
			recorded = event.Data
		}
	}
	for i, arg := range args {
		if arg == "--append-system-prompt" && i+1 < len(args) {
			return args[i+1], recorded
		}
	}
	return "", recorded
}

// The commit a call pinned is what every turn reads: a commit the agent
// makes, or an edit, between turns does not change what a later turn gets.
func TestALaterCommitDoesNotChangeWhatALaterTurnGets(t *testing.T) {
	repo, pinned := repository(t, map[string]string{"AGENTS.md": "as the call started"})
	runner := &claudecode.Runner{Command: runtimetest.Binary(t, "fakeclaude")}
	r := request("SCENARIO:approve")
	r.Cwd, r.InstructionCommit = repo, pinned
	for turn := 1; turn <= 2; turn++ {
		sink := &runtimetest.Recorder{}
		if got := runner.RunTurn(context.Background(), r, sink); got.Status != run.Completed {
			t.Fatalf("turn %d = %+v", turn, got)
		}
		prompt, recorded := promptOf(t, sink)
		if !strings.Contains(prompt, "as the call started") || strings.Contains(prompt, "committed during the call") || recorded["commit"] != pinned {
			t.Fatalf("turn %d: prompt %q, recorded %v", turn, prompt, recorded)
		}
		commit(t, repo, map[string]string{"AGENTS.md": "committed during the call"})
	}
}

// Outside any repository there are none, even with instruction files in
// the working directory, and no commit is recorded; a commit given for
// such a directory is a mistake, not ignored.
func TestNoRepositoryGivesNoInstructionFiles(t *testing.T) {
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CEILING_DIRECTORIES", base)
	write(t, base, map[string]string{"work/AGENTS.md": "agents", "work/CLAUDE.md": "claude"})
	work := filepath.Join(base, "work")
	got, err := claudecode.ReadInstructions(context.Background(), work, "", nil)
	if err != nil || got.Commit != "" || len(got.Files) != 0 {
		t.Fatalf("instructions = %+v, %v", got, err)
	}
	if _, err := claudecode.ReadInstructions(context.Background(), work, "abc123", nil); err == nil || !strings.Contains(err.Error(), "in no repository") {
		t.Fatalf("a commit for no repository: %v", err)
	}
	r := request("SCENARIO:approve")
	r.Cwd = work
	sink := &runtimetest.Recorder{}
	if turn := (&claudecode.Runner{Command: runtimetest.Binary(t, "fakeclaude")}).RunTurn(context.Background(), r, sink); turn.Status != run.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	if prompt, recorded := promptOf(t, sink); prompt != "Do the thing." || !reflect.DeepEqual(recorded, map[string]any{"files": []any{}}) {
		t.Fatalf("prompt %q, recorded %v", prompt, recorded)
	}
}

// failing is git that fails with fault when it would run command, and
// runs otherwise.
func failing(command string, fault error) claudecode.Git {
	return func(ctx context.Context, dir string, stdin []byte, args ...string) ([]byte, error) {
		if strings.Join(args, " ") == command || len(args) > 0 && args[0] == command {
			return nil, fault
		}
		return claudecode.RunGit(ctx, dir, stdin, args...)
	}
}

// A git failure other than "not a repository" refuses the turn before any
// process starts, naming the cause; it is never taken as no repository.
func TestAGitFailureFailsTheTurnBeforeItStarts(t *testing.T) {
	repo, head := repository(t, map[string]string{"AGENTS.md": "root", "pkg/AGENTS.md": "pkg"})
	broken := &claudecode.GitError{Args: []string{"rev-parse", "--show-prefix"}, Stderr: "fatal: not a git repository: /elsewhere/.git\n", Err: errors.New("exit status 128")}
	for _, c := range []struct {
		name, cwd, commit string
		git               claudecode.Git
		cause             string
	}{
		{"finding the repository fails", "pkg", head, failing("rev-parse --show-prefix", errors.New("permission denied")), "permission denied"},
		{"a broken repository", "pkg", head, failing("rev-parse --show-prefix", broken), "/elsewhere/.git"},
		{"reading the files fails", "pkg", head, failing("cat-file", errors.New("bad object")), "bad object"},
		{"the commit is unknown", "pkg", "0123456789abcdef0123456789abcdef01234567", nil, "0123456789abcdef"},
		{"no commit for a repository", "pkg", "", nil, "no commit"},
		{"the working directory is gone", "gone", head, nil, "gone"},
	} {
		runner := &claudecode.Runner{Command: runtimetest.Binary(t, "fakeclaude"), Git: c.git}
		r := request("SCENARIO:approve")
		r.Cwd, r.InstructionCommit = filepath.Join(repo, c.cwd), c.commit
		sink := &runtimetest.Recorder{}
		turn := runner.RunTurn(context.Background(), r, sink)
		if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassRefused || !strings.Contains(turn.Error.Message, c.cause) {
			t.Errorf("%s: turn = %+v", c.name, turn)
		}
		if len(sink.Processes) != 0 || len(sink.Events) != 0 {
			t.Errorf("%s: a process started: %v, %v", c.name, sink.Processes, sink.Kinds())
		}
	}
}

// A relative working directory is below the process's, and an empty one is
// the process's own, as for the runtime's process itself.
func TestRelativeAndEmptyWorkingDirectoriesAreTheProcesss(t *testing.T) {
	repo, head := repository(t, map[string]string{"AGENTS.md": "root", "pkg/CLAUDE.md": "pkg", "other/AGENTS.md": "sibling"})
	want := []string{"AGENTS.md", "pkg/CLAUDE.md"}
	t.Chdir(repo)
	if got, err := claudecode.ReadInstructions(context.Background(), "pkg", head, nil); err != nil || !reflect.DeepEqual(paths(got.Files), want) {
		t.Fatalf("relative: %q, %v", paths(got.Files), err)
	}
	t.Chdir(filepath.Join(repo, "pkg"))
	if got, err := claudecode.ReadInstructions(context.Background(), "", head, nil); err != nil || !reflect.DeepEqual(paths(got.Files), want) {
		t.Fatalf("empty: %q, %v", paths(got.Files), err)
	}
}

// The turn's appended system prompt carries the files, root first, each
// introduced by its path, before the instruction; an event records the
// commit and each file's path and digest. Git is reached through the seam.
func TestTurnIsGivenTheInstructionFilesAndRecordsThem(t *testing.T) {
	repo, head := repository(t, map[string]string{
		"AGENTS.md":     "root agents",
		"pkg/CLAUDE.md": "pkg claude",
		"lib/AGENTS.md": "sibling",
	})
	var ran []string
	runner := &claudecode.Runner{Command: runtimetest.Binary(t, "fakeclaude"), Git: func(ctx context.Context, dir string, stdin []byte, args ...string) ([]byte, error) {
		ran = append(ran, strings.Join(args, " "))
		return claudecode.RunGit(ctx, dir, stdin, args...)
	}}
	r := request("SCENARIO:approve")
	r.Cwd, r.InstructionCommit = filepath.Join(repo, "pkg"), head
	sink := &runtimetest.Recorder{}
	if turn := runner.RunTurn(context.Background(), r, sink); turn.Status != run.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	if len(ran) == 0 {
		t.Fatal("git was not run through the seam")
	}
	prompt, recorded := promptOf(t, sink)
	root, pkg, instruction := strings.Index(prompt, "root agents"), strings.Index(prompt, "pkg claude"), strings.Index(prompt, "Do the thing.")
	if root < 0 || pkg < root || instruction < pkg || strings.Contains(prompt, "sibling") ||
		!strings.Contains(prompt[:root], "AGENTS.md") || !strings.Contains(prompt[root:pkg], "pkg/CLAUDE.md") {
		t.Fatalf("appended system prompt = %q", prompt)
	}
	digest := func(content string) string {
		sum := sha256.Sum256([]byte(content))
		return hex.EncodeToString(sum[:])
	}
	want := map[string]any{"commit": head, "files": []any{
		map[string]any{"path": "AGENTS.md", "sha256": digest("root agents")},
		map[string]any{"path": "pkg/CLAUDE.md", "sha256": digest("pkg claude")},
	}}
	if !reflect.DeepEqual(recorded, want) {
		t.Fatalf("recorded = %v, want %v", recorded, want)
	}
	if kinds := sink.Kinds(); kinds[0] != "PROCESS_STARTED" || kinds[1] != "INSTRUCTION_FILES" {
		t.Fatalf("events = %v", kinds)
	}
}

func TestArgumentsPutInstructionFilesBeforeTheInstruction(t *testing.T) {
	files := []claudecode.InstructionFile{{Path: "AGENTS.md", Content: []byte("root\n")}, {Path: "a/CLAUDE.md", Content: []byte("a")}}
	args, err := claudecode.Arguments(request("x"), files)
	if err != nil {
		t.Fatal(err)
	}
	want := claudecode.SystemPrompt(files, "Do the thing.")
	if !strings.Contains(strings.Join(args, "\x00"), "--append-system-prompt\x00"+want+"\x00") || !strings.HasSuffix(want, "\n\nDo the thing.") {
		t.Fatalf("args = %q", args)
	}
	r := request("x")
	r.Instruction = ""
	args, _ = claudecode.Arguments(r, files)
	if !strings.Contains(strings.Join(args, "\x00"), "--append-system-prompt\x00"+claudecode.SystemPrompt(files, "")+"\x00") {
		t.Fatalf("args = %q", args)
	}
}
