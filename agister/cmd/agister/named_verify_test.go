package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// A process names its verification (ADR-010), on real settings
// directories: Agister's home and a repository's .agister, composed by the
// layered store.

const repoVerification = `schema: agister.verify/v1alpha1
name: repo
command: go vet ./... && go test ./...
timeout: 7m
max_attempts: 2
instruction: The repository's check failed. Fix the cause.
`

// namingHome is a home whose implement names verify:repo and which holds
// no verification, and a repository without settings of its own.
func namingHome(t *testing.T) (home, repo string) {
	t.Helper()
	home, repo = setup(t, "approve")
	if text := read(t, filepath.Join(home, "processes", "implement.yaml")); !strings.Contains(text, "\nverify: verify:repo\n") {
		t.Fatalf("the shipped implement does not name verify:repo:\n%s", text)
	}
	if err := os.Remove(filepath.Join(home, "verifies", "repo.yaml")); err != nil {
		t.Fatal(err)
	}
	return home, repo
}

func showImplement(t *testing.T, home, repo string) contract.ProcessView {
	t.Helper()
	r := agister(t, home, repo, "process", "show", "implement", "--json")
	var view contract.ProcessView
	if err := json.Unmarshal([]byte(r.stdout), &view); err != nil || r.code != 0 {
		t.Fatalf("process show: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	return view
}

// The issue's case (LAB-49): the process is global, the verification the
// repository's. The resolved process verifies with the repository's
// command, and the document is among the call's sources as a project one.
//
// Contract test: the composition over two layers of settings on the
// filesystem and a real git repository. Its runtimes are fakes run in
// process.
func TestAGlobalProcessVerifiesWithTheRepositorysVerification(t *testing.T) {
	t.Parallel()
	home, repo := namingHome(t)
	project := filepath.Join(repo, ".agister", "verifies", "repo.yaml")
	write(t, project, repoVerification)

	view := showImplement(t, home, repo)
	want := contract.Verify{Command: "go vet ./... && go test ./...", Timeout: 7 * time.Minute, MaxAttempts: 2, Instruction: "The repository's check failed. Fix the cause."}
	if view.Verify == nil || *view.Verify != want || view.VerifyName != "repo" || view.Refusal != "" {
		t.Fatalf("verify %+v from %q, refusal %q", view.Verify, view.VerifyName, view.Refusal)
	}
	var verification, process contract.DefinitionOrigin
	for _, source := range view.Sources {
		switch source.Kind {
		case "verifies":
			verification = source
		case "processes":
			process = source
		}
	}
	if want := (contract.DefinitionOrigin{Kind: "verifies", Name: "repo", Layer: "project", Path: project}); verification != want {
		t.Fatalf("verification source = %+v, want %+v", verification, want)
	}
	if process.Layer != "global" || process.Path != filepath.Join(home, "processes", "implement.yaml") {
		t.Fatalf("process source = %+v", process)
	}

	r := agister(t, home, repo, "check", "--tree")
	if r.code != 0 || !regexp.MustCompile(`└─ verification repo +project `+regexp.QuoteMeta(project)+"\n").MatchString(r.stdout) ||
		!strings.Contains(r.stderr, "warning process implement: verify runs its command with the operator's authority") {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "process", "show", "implement")
	if r.code != 0 || !strings.Contains(r.stdout, "verify       go vet ./... && go test ./...\n") || !strings.Contains(r.stdout, "  from       verify:repo\n") ||
		!strings.Contains(r.stdout, "verification repo: project "+project+"\n") {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// Without the repository's document the verification exists in neither
// layer: a call of the process is refused before its first turn, naming
// the process, the reference and both expected paths; check passes with a
// warning, and another process of the same settings resolves and runs.
//
// Contract test: the composition over two layers of settings on the
// filesystem and a real git repository. Its runtimes are fakes run in
// process.
func TestAVerificationInNeitherLayerRefusesOnlyTheProcessNamingIt(t *testing.T) {
	t.Parallel()
	home, repo := namingHome(t)
	global, project := filepath.Join(home, "verifies", "repo.yaml"), filepath.Join(repo, ".agister", "verifies", "repo.yaml")
	reason := `process implement names verify:repo: verification "repo": not found (expected ` + project + " or " + global + ")"
	// A repository without .agister has no settings layer of its own; the
	// refusal still names where it would hold the document.
	if view := showImplement(t, home, repo); view.Refusal != reason {
		t.Fatalf("without project settings: refusal %q, want %q", view.Refusal, reason)
	}
	if err := os.Mkdir(filepath.Join(repo, ".agister"), 0o700); err != nil {
		t.Fatal(err)
	}

	r := agister(t, home, repo, "check")
	warning := "warning process implement: names verify:repo, which does not exist; calls of it are refused until verifies/repo.yaml exists\n"
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") || r.stderr != warning {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "check", "--tree")
	if r.code != 0 || !regexp.MustCompile(`└─ verification repo +MISSING\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	view := showImplement(t, home, repo)
	if view.Verify != nil || view.VerifyName != "repo" || view.Refusal != reason || len(view.Warnings) != 0 {
		t.Fatalf("verify %+v from %q, warnings %q, refusal %q\nwant %q", view.Verify, view.VerifyName, view.Warnings, view.Refusal, reason)
	}
	r = agister(t, home, repo, "process", "show", "implement")
	if r.code != 0 || !strings.Contains(r.stdout, "verify       verify:repo (not resolved)\nplan         REFUSED: "+reason+"\n") {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	write(t, filepath.Join(repo, "brief.md"), "Do it.\n")
	r = agister(t, home, repo, "run", "implement", "--quiet", "--param", "brief=brief.md")
	last := lastRun(t, home)
	result, _ := last.record["result"].(map[string]any)
	fault, _ := result["error"].(map[string]any)
	if r.code == cli.ExitCompleted || fault["class"] != "refused" || fault["message"] != reason {
		t.Fatalf("run: %d, error %v\n%s", r.code, fault, r.stderr)
	}
	if kinds := strings.Join(last.kinds(), " "); !strings.Contains(kinds, "REFUSED") || strings.Contains(kinds, "PROCESS_STARTED") || strings.Contains(kinds, "VERIFY_STARTED") {
		t.Fatalf("events = %s", kinds)
	}

	if r := agister(t, home, repo, "process", "show", "ask"); r.code != 0 || strings.Contains(r.stdout, "REFUSED") {
		t.Fatalf("show another process: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run another process: %d\n%s", r.code, r.stderr)
	}
}

// A repository's verification replaces the global one of the same name,
// whole, as any document does.
//
// Contract test: the composition over two layers of settings on the
// filesystem and a real git repository. Its runtimes are fakes run in
// process.
func TestARepositoryVerificationReplacesAGlobalOne(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	global, project := filepath.Join(home, "verifies", "repo.yaml"), filepath.Join(repo, ".agister", "verifies", "repo.yaml")

	view := showImplement(t, home, repo)
	if view.Verify == nil || view.Verify.Command != "make test" || view.VerifyName != "repo" {
		t.Fatalf("with the global one alone: %+v from %q", view.Verify, view.VerifyName)
	}

	write(t, project, repoVerification)
	view = showImplement(t, home, repo)
	want := contract.Verify{Command: "go vet ./... && go test ./...", Timeout: 7 * time.Minute, MaxAttempts: 2, Instruction: "The repository's check failed. Fix the cause."}
	if view.Verify == nil || *view.Verify != want {
		t.Fatalf("verify = %+v", view.Verify)
	}
	origin := contract.DefinitionOrigin{Kind: "verifies", Name: "repo", Layer: "project", Path: project, Overrides: global}
	var sources []contract.DefinitionOrigin
	for _, source := range view.Sources {
		if source.Kind == "verifies" {
			sources = append(sources, source)
		}
	}
	if !reflect.DeepEqual(sources, []contract.DefinitionOrigin{origin}) {
		t.Fatalf("sources = %+v", sources)
	}
	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.Contains(r.stdout, "override verification repo: "+project+" overrides "+global) {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// An invalid verification is a problem of the settings, on that document;
// it refuses the calls of the processes that name it, and nothing else
// (ADR-015, amending ADR-010 rule 4).
//
// Contract test: the composition over two layers of settings on the
// filesystem and a real git repository. Its runtimes are fakes run in
// process.
func TestAnInvalidRepositoryVerificationFailsCheck(t *testing.T) {
	t.Parallel()
	home, repo := namingHome(t)
	path := filepath.Join(repo, ".agister", "verifies", "repo.yaml")
	write(t, path, strings.Replace(repoVerification, "timeout: 7m\n", "", 1))
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "verification repo: timeout: is required\n  refuses process implement\n1 problem(s) in ") || strings.Contains(r.stderr, "\nprocess implement") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "implement", "--quiet", "--param", "candidate=HEAD", "--param", "brief=b.md")
	if want := "process implement uses verification repo (" + path + "): timeout: is required"; r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if last := lastRun(t, home); last.record["result"].(map[string]any)["error"].(map[string]any)["class"] != "refused" || len(last.events) == 0 {
		t.Fatalf("record = %v", last.record)
	}
	if r := agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("a process that does not name it: %d\n%s", r.code, r.stderr)
	}
}
