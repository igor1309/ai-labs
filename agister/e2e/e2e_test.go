// Package e2e_test is the end-to-end check (docs/run-implementation.md, "A
// step on a model runtime"): the built agister runs a step on real
// claude-code and codex, on the owner's logins. It costs a few cents, so
// it is opt-in: its tests run only where AGISTER_E2E is 1, by
// scripts/e2e.sh, and are skipped otherwise, saying so.
package e2e_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// optedIn tells whether getenv opts in to the end-to-end tests.
func optedIn(getenv func(string) string) bool { return getenv("AGISTER_E2E") == "1" }

// skipper is what skips a test.
type skipper interface{ Skip(args ...any) }

// requireOptIn skips t, saying what runs it, unless getenv opts in.
func requireOptIn(t skipper, getenv func(string) string) {
	if !optedIn(getenv) {
		t.Skip("AGISTER_E2E=1 runs it: real claude-code and codex steps, on the owner's logins")
	}
}

// binary is the agister TestMain builds, where the tests are opted in.
var binary string

func TestMain(m *testing.M) { os.Exit(runTests(m)) }

// runTests runs m, the agister of ../cmd/agister built first where the
// tests are opted in, once for every test, and removed when they end.
func runTests(m *testing.M) int {
	if !optedIn(os.Getenv) {
		return m.Run()
	}
	dir, err := os.MkdirTemp("", "agister-e2e-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "e2e:", err)
		return 1
	}
	defer func() { _ = os.RemoveAll(dir) }()
	binary = filepath.Join(dir, "agister")
	build := exec.Command("go", "build", "-o", binary, "../cmd/agister")
	build.Stdout, build.Stderr = os.Stderr, os.Stderr
	if err := build.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "e2e: building agister:", err)
		return 1
	}
	return m.Run()
}

// agents are the agents the scratch home adds to home's, by name: one on
// claude-code with its cheapest model, one on codex at the least effort
// its models take.
var agents = map[string]string{
	"e2e-haiku": "schema = \"agister.agent/v1alpha1\"\nruntime = \"claude-code\"\nmodel = \"haiku\"\n",
	"e2e-codex": "schema = \"agister.agent/v1alpha1\"\nruntime = \"codex\"\neffort = \"low\"\n",
}

// repository is the scratch repository's settings, by path: the process
// "ask", its input "q" from the param "q", its output an object of a
// string "answer"; it allows what codex's read-only sandbox grants, so its
// plan warns of nothing.
var repository = map[string]string{
	".agister/processes/ask.yaml": `schema: agister.process/v1alpha1
prompt: ask
instruction: Answer the question given as input q, as the prompt says.
params:
  q: {}
inputs:
  q: {source: param, name: q}
permissions:
  require: [repository.read]
  allow: [repository.read, repository.search, repository.diff, repository.history.read, process.execute, host.read]
output:
  schema: answer
`,
	".agister/prompts/ask.md": "Reply in one short sentence, without reading any file.\n",
	".agister/schemas/answer.json": `{"type":"object","required":["answer"],"additionalProperties":false,` +
		`"properties":{"answer":{"type":"string"}}}`,
}

// scratch makes the test's own home's folder, a copy of ../home with the
// agents, and its own git repository, holding the repository's settings;
// and gives each.
func scratch(t *testing.T) (home, repo string) {
	t.Helper()
	root := t.TempDir()
	home, repo = filepath.Join(root, "home"), filepath.Join(root, "repo")
	if err := os.CopyFS(home, os.DirFS("../home")); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{}
	for name, content := range agents {
		files[filepath.Join(home, "agents", name+".toml")] = content
	}
	for name, content := range repository {
		files[filepath.Join(repo, name)] = content
	}
	for name, content := range files {
		if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(name, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if out, err := exec.Command("git", "init", "-q", repo).CombinedOutput(); err != nil {
		t.Fatalf("git init: %v: %s", err, out)
	}
	return home, repo
}

// printed is what the tests read of a run's printed result.
type printed struct {
	Status string         `json:"status"`
	Output map[string]any `json:"output"`
	Usage  struct {
		Input  *int64 `json:"input_tokens"`
		Output *int64 `json:"output_tokens"`
	} `json:"usage"`
	Sessions map[string]string `json:"sessions"`
}

// e2e.feature, "A step on a real runtime completes". A step alone's run
// gives its step's output as its output "output" (ADR-013, rule 1).
//
// Contract test: the built agister, on real claude-code and codex and the
// owner's logins, in a real git repository.
func TestAStepOnARealRuntimeCompletes(t *testing.T) {
	t.Parallel()
	requireOptIn(t, os.Getenv)
	for _, agent := range []string{"e2e-haiku", "e2e-codex"} {
		t.Run(agent, func(t *testing.T) {
			t.Parallel()
			home, repo := scratch(t)
			run := exec.Command(binary, "run", "--process", "ask", "--agent", agent, "--param", "q=hi")
			run.Dir = repo
			run.Env = append(os.Environ(), "AGISTER_HOME="+home)
			var stdout, stderr bytes.Buffer
			run.Stdout, run.Stderr = &stdout, &stderr
			err := run.Run()
			if exit := (*exec.ExitError)(nil); err != nil && !errors.As(err, &exit) {
				t.Fatal(err)
			}
			if code := run.ProcessState.ExitCode(); code != 0 {
				t.Errorf("exit %d, want 0", code)
			}
			var got printed
			if err := json.Unmarshal(stdout.Bytes(), &got); err != nil {
				t.Fatalf("stdout is no result: %v\nstdout:\n%s\nstderr:\n%s", err, stdout.Bytes(), stderr.Bytes())
			}
			if got.Status != "completed" {
				t.Errorf("status %q, want completed", got.Status)
			}
			step, _ := got.Output["output"].(map[string]any)
			if _, ok := step["answer"].(string); !ok {
				t.Errorf("output %v, want its step's answer a string", got.Output)
			}
			if got.Usage.Input == nil || *got.Usage.Input <= 0 || got.Usage.Output == nil || *got.Usage.Output <= 0 {
				t.Errorf("usage of %v input and %v output tokens, want each more than 0", got.Usage.Input, got.Usage.Output)
			}
			if got.Sessions["ask"] == "" {
				t.Errorf("sessions %v, want one for ask", got.Sessions)
			}
			if t.Failed() {
				t.Logf("stdout:\n%s\nstderr:\n%s", stdout.Bytes(), stderr.Bytes())
			}
		})
	}
}

// skipSpy is a test's skipper: it keeps what each skip said.
type skipSpy struct{ said []string }

func (s *skipSpy) Skip(args ...any) { s.said = append(s.said, fmt.Sprint(args...)) }

// e2e.feature, "Without AGISTER_E2E nothing runs": an end-to-end test is
// skipped, saying AGISTER_E2E=1 runs it, wherever AGISTER_E2E is not 1.
func TestWithoutTheOptInNothingRuns(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, value string
		skipped     bool
	}{
		{"unset", "", true},
		{"0", "0", true},
		{"true", "true", true},
		{"1", "1", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &skipSpy{}
			requireOptIn(spy, func(name string) string {
				if name == "AGISTER_E2E" {
					return c.value
				}
				return "1"
			})
			switch {
			case c.skipped && (len(spy.said) != 1 || !strings.Contains(spy.said[0], "AGISTER_E2E=1 runs it")):
				t.Errorf("skipped saying %q, want once, saying AGISTER_E2E=1 runs it", spy.said)
			case !c.skipped && len(spy.said) > 0:
				t.Errorf("skipped saying %q, want it run", spy.said)
			}
		})
	}
}
