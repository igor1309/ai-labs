package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// exampleOpenCodeSettings is setup with the OpenCode example's settings:
// its agent runs opencode, which the in-process starter runs the fake by.
func exampleOpenCodeSettings(t *testing.T) (home, repo string) {
	t.Helper()
	home, repo = setup(t, "approve")
	example := os.DirFS(filepath.Join("..", "..", "examples", "opencode"))
	err := fs.WalkDir(example, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || filepath.Dir(path) == "." {
			return err
		}
		data, err := fs.ReadFile(example, path)
		if err != nil {
			return err
		}
		write(t, filepath.Join(home, path), string(data))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return home, repo
}

// verifyOpenCodeTools marks the tools named verified for 1.18 in the home's
// mapping, as a live check would; the shipped mapping verifies none.
func verifyOpenCodeTools(t *testing.T, home string, tools ...string) {
	t.Helper()
	mapping := filepath.Join(home, "runtimes", "opencode.yaml")
	text := read(t, mapping)
	for _, tool := range tools {
		item := regexp.MustCompile(`(?m)^    ` + tool + `: \{(.*)\}$`)
		if !item.MatchString(text) {
			t.Fatalf("no one-line primitive %s in %s", tool, mapping)
		}
		text = item.ReplaceAllString(text, `    `+tool+`: {$1, verified: ["1.18."]}`)
	}
	write(t, mapping, text)
}

// The example verifies no tool: nothing about OpenCode's tools has been
// checked live. So, as shipped, the settings do not pass check, which says
// why and what it refuses, and a call on it is refused before its runtime
// starts; with a tool verified they pass check and probe.
func TestExampleOpenCodeSettingsVerifyNoTool(t *testing.T) {
	t.Parallel()
	home, repo := exampleOpenCodeSettings(t)
	const problem = "verifies no primitive against any runtime version; calls on it are refused"
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "runtime mapping opencode: "+problem+"\n  refuses workflow ask_opencode_minimax\n") || !strings.Contains(r.stderr, "1 problem(s)") {
		t.Fatalf("check: exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "ask_opencode_minimax", "--param", "question=What does this repository do?")
	want := "workflow ask_opencode_minimax uses agent opencode-minimax, which uses runtime mapping opencode (" + filepath.Join(home, "runtimes", "opencode.yaml") + "): " + problem
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: exit %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if last := lastRun(t, home); last.record["result"].(map[string]any)["error"].(map[string]any)["class"] != "refused" || last.first != nil {
		t.Fatalf("record = %v, runtime = %v", last.record, last.first)
	}

	verifyOpenCodeTools(t, home, "read", "grep", "glob", "skill")
	for _, args := range [][]string{{"check"}, {"check", "--probe"}} {
		if r := agister(t, home, repo, args...); r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") {
			t.Fatalf("%v: exit %d\n%s%s", args, r.code, r.stdout, r.stderr)
		}
	}
}

// With the read tools verified and host reads opted in, a call runs as its
// generated agent: the granted tools allowed and everything else denied,
// the model from the agent, the question on stdin. The tool calls OpenCode
// reported are in the run's events. A continuation resumes the session
// OpenCode reported.
func TestOpenCodeCallRunsAsTheGeneratedAgent(t *testing.T) {
	t.Parallel()
	home, repo := exampleOpenCodeSettings(t)
	verifyOpenCodeTools(t, home, "read", "grep", "glob", "skill")
	allowHostReads(t, home, repo)
	r := agister(t, home, repo, "run", "ask_opencode_minimax", "--param", "question=What does this repository do?", "--timeout", "30s")
	if r.code != cli.ExitCompleted || strings.TrimSpace(r.stdout) != "All good." {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	first := lastRun(t, home)
	plan := first.record["plan"].(map[string]any)
	if !reflect.DeepEqual(plan["primitives"], []any{"read", "grep", "glob", "skill"}) ||
		!reflect.DeepEqual(plan["withheld"], []any{"repository.diff", "repository.history.read", "process.execute"}) {
		t.Fatalf("plan = %v", plan)
	}
	args := strings.Join(first.argv(), " ")
	if !regexp.MustCompile(`^run --format json --pure --agent agister-[0-9a-f]{16} -m opencode-go/minimax-m3$`).MatchString(args) {
		t.Fatalf("OpenCode argv = %s", args)
	}
	agent := first.argv()[5]
	config, _ := first.first["config"].(string)
	permission := `"permission":{"*":"deny","read":"allow","grep":"allow","glob":"allow","skill":"allow"}`
	if !strings.HasPrefix(config, `{"agent":{"`+agent+`":{"mode":"primary","prompt":"Answer the question`) || !strings.HasSuffix(config, permission+`}}}`) {
		t.Fatalf("config = %s", config)
	}
	if prompt, _ := first.first["prompt"].(string); !strings.Contains(prompt, "What does this repository do?") || first.first["cwd"] != repo {
		t.Fatalf("prompt %q in %v", prompt, first.first["cwd"])
	}
	result := first.record["result"].(map[string]any)
	id, _ := first.first["id"].(string)
	if id == "" || result["session"].(map[string]any)["provider_session_id"] != id {
		t.Fatalf("session %q, result = %v", id, result)
	}
	// The fake's one tool call, a bash command that completed.
	var calls []any
	for _, event := range first.events {
		if kind := event["kind"]; kind == "TOOL_REQUESTED" || kind == "TOOL_RESULT" {
			calls = append(calls, []any{kind, event["data"]})
		}
	}
	want := []any{
		[]any{"TOOL_REQUESTED", map[string]any{"tool_use_id": "call_1", "name": "bash", "input": `{"command":"git diff --stat","description":"Show the diff"}`}},
		[]any{"TOOL_RESULT", map[string]any{"tool_use_id": "call_1", "is_error": false}},
	}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("tool events = %v, want %v", calls, want)
	}

	r = agister(t, home, repo, "run", "ask_opencode_minimax", "--param", "question=And its tests?", "--continue", filepath.Base(first.dir), "--timeout", "30s")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Run IDs sort only to the second, so the continuation is the run that
	// is not the first.
	runs, _ := os.ReadDir(filepath.Join(home, "runs"))
	if len(runs) != 2 {
		t.Fatalf("runs = %v, want the first and its continuation", runs)
	}
	next := runs[0].Name()
	if next == filepath.Base(first.dir) {
		next = runs[1].Name()
	}
	second := lastRunIn(t, filepath.Join(home, "runs", next))
	if args := strings.Join(second.argv(), " "); !strings.Contains(args, " -s "+id+" ") || second.argv()[5] == agent {
		t.Fatalf("continuation argv %s", args)
	}
	session := second.record["result"].(map[string]any)["session"].(map[string]any)
	if session["provider_session_id"] != id || session["continues"] != filepath.Base(first.dir) {
		t.Fatalf("session = %v", session)
	}
}

// OpenCode lists and loads skills with its skill tool only. With the
// service of an `agister init` home, which withholds host.read, skill
// cannot be granted, so ask_opencode is refused before OpenCode starts
// (ADR-006).
func TestOpenCodeCallWithoutTheSkillToolIsRefused(t *testing.T) {
	t.Parallel()
	home, repo := exampleOpenCodeSettings(t)
	verifyOpenCodeTools(t, home, "read", "grep", "glob", "skill", "webfetch")
	const reason = "runtime opencode needs skill to use the repository's skills (ADR-006), and the plan grants no such tool: " +
		"skill needs host.read, which the plan withholds"
	r := agister(t, home, repo, "run", "ask_opencode_minimax", "--param", "question=What does this repository do?")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, reason) {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	last := lastRun(t, home)
	fault := last.record["result"].(map[string]any)["error"].(map[string]any)
	want := "workflow ask_opencode_minimax uses process ask_opencode (" + filepath.Join(home, "processes", "ask_opencode.yaml") + "): " + reason
	if fault["class"] != "refused" || fault["message"] != want || last.first != nil {
		t.Fatalf("error = %v, OpenCode's first line %v", fault, last.first)
	}
}

// OpenCode cannot limit cost: a call under a cost limit is refused.
func TestOpenCodeCallUnderACostLimitIsRefused(t *testing.T) {
	t.Parallel()
	home, repo := exampleOpenCodeSettings(t)
	verifyOpenCodeTools(t, home, "read", "grep", "glob", "skill")
	allowHostReads(t, home, repo)
	r := agister(t, home, repo, "run", "ask_opencode_minimax", "--param", "question=What does this repository do?", "--max-cost", "1")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "runtime opencode cannot enforce the cost limit 1") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// OpenCode's stream reports a tool call only once it has ended, so the
// adapter does not report tool calls: a call under a stale.tool_command
// limit, which a command still running could outlast unseen, is refused
// before OpenCode starts.
func TestOpenCodeCallUnderAToolCommandLimitIsRefused(t *testing.T) {
	t.Parallel()
	home, repo := exampleOpenCodeSettings(t)
	verifyOpenCodeTools(t, home, "read", "grep", "glob", "skill")
	allowHostReads(t, home, repo)
	process := filepath.Join(home, "processes", "ask_opencode.yaml")
	write(t, process, read(t, process)+"\nstale: {tool_command: 10m}\n")
	const reason = "runtime opencode does not report tool calls, so it cannot enforce stale.tool_command 10m0s"
	r := agister(t, home, repo, "run", "ask_opencode_minimax", "--param", "question=What does this repository do?", "--timeout", "30s")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, reason) {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if last := lastRun(t, home); last.first != nil {
		t.Fatalf("OpenCode started: %v", last.first)
	}
}

// Even when every grant is allowed, the unverified edit and bash cannot
// satisfy a required permission. The bad settings live only in a temp home.
func TestExampleOpenCodeSettingsRefuseUnverifiedTools(t *testing.T) {
	t.Parallel()
	for _, permission := range []string{"repository.write", "process.execute"} {
		t.Run(permission, func(t *testing.T) {
			t.Parallel()
			home, repo := exampleOpenCodeSettings(t)
			verifyOpenCodeTools(t, home, "read", "grep", "glob", "skill")
			service := filepath.Join(home, "service.toml")
			write(t, service, strings.Replace(read(t, service), `state_reaching = ["host.read", "host.write"]`, `state_reaching = []`, 1))
			ownLimits(t, filepath.Join(home, "processes", "ask_opencode.yaml"), `workspace: {access: read-write, scope: repository}
tools:
  allow: [repository.read, repository.search, repository.diff, repository.history.read, repository.write, repository.history.write, process.execute, network, host.read, host.write]
  require: [`+permission+`]
timeout: 10m
`)
			r := agister(t, home, repo, "check")
			if r.code != cli.ExitUsage ||
				!strings.Contains(r.stderr, "required permissions would be withheld: "+permission) ||
				!strings.Contains(r.stderr, "not verified for version 1.18: edit, webfetch, websearch, bash") {
				t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
			}
		})
	}
}
