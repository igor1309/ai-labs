package main

import (
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/runtime/pi"
)

// shippedHome is every file home holds as Agister ships it, at home's
// folder "/u/.agister".
func shippedHome(t *testing.T) map[string]string {
	t.Helper()
	shipped := map[string]string{}
	home := os.DirFS("../../home")
	err := fs.WalkDir(home, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		content, err := fs.ReadFile(home, name)
		if err != nil {
			return err
		}
		shipped[path.Join("/u/.agister", name)] = string(content)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return shipped
}

// ran is what a command printed and its exit code.
type ran struct {
	stdout, stderr string
	code           int
}

// compose runs "agister <args>" in "/r", the user's home directory "/u",
// through the composition: its parts and cli, over a filesystem holding
// home's files as Agister ships them and the files repository gives, at
// their paths; a git whose worktree root of "/r" and below is "/r"; and
// the runtime facts, each wrapper's as runtime/<name> gives them.
func compose(t *testing.T, repository map[string]string, args ...string) ran {
	t.Helper()
	settings := shippedHome(t)
	maps.Copy(settings, repository)
	wrappers, err := newContracts(
		claudeCodeFacts(claudecode.New()), codexFacts(codex.New()), piFacts(pi.New()), bashFacts(bash.New()))
	if err != nil {
		t.Fatal(err)
	}
	var stdout, stderr strings.Builder
	commandLine, err := newCommandLine(newFilesystemSpy(settings), rootSpy{root: "/r"}, wrappers, &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	code := commandLine.Run(args, "/r", "/u")
	return ran{stdout: stdout.String(), stderr: stderr.String(), code: code}
}

// lines is each line of stdout, split at its runs of spaces.
func lines(stdout string) [][]string {
	var split [][]string
	for _, line := range strings.Split(strings.TrimSuffix(stdout, "\n"), "\n") {
		split = append(split, strings.Fields(line))
	}
	return split
}

// counted checks that the last line of stdout counts resolve names
// resolving and refused refused.
func counted(t *testing.T, stdout string, resolve, refused int) {
	t.Helper()
	verb := "resolve"
	if resolve == 1 {
		verb = "resolves"
	}
	if want := fmt.Sprintf("%d %s, %d refused\n", resolve, verb, refused); !strings.HasSuffix(stdout, "\n"+want) && stdout != want {
		t.Errorf("stdout %q, want it to end in %q", stdout, want)
	}
}

// heldNames is how many names home holds as Agister ships it: one for
// each file in a kind's folder.
func heldNames(t *testing.T) int {
	t.Helper()
	n := 0
	for name := range shippedHome(t) {
		if strings.Count(strings.TrimPrefix(name, "/u/.agister/"), "/") == 1 {
			n++
		}
	}
	return n
}

// compose.feature, "Shipped settings check clean".
//
// Contract test: the files home holds, as Agister ships them.
func TestShippedSettingsCheckClean(t *testing.T) {
	t.Parallel()
	got := compose(t, nil, "check")
	if want := (ran{stdout: fmt.Sprintf("%d resolve, 0 refused\n", heldNames(t))}); got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
}

// compose.feature, "A missing runtime is reported with what it refuses".
//
// Contract test: the files home holds, as Agister ships them.
func TestAMissingRuntimeIsReportedWithWhatItRefuses(t *testing.T) {
	t.Parallel()
	got := compose(t, map[string]string{"/r/.agister/agents/claude-opus.toml": "runtime = \"gone\"\n"}, "check")
	want := `runtime gone
  no layer holds the runtime "gone"
  refuses workflow adr_review, workflow code_review, agent claude-opus
`
	if !strings.HasPrefix(got.stdout, want) {
		t.Errorf("stdout\n%s\nwant it to start\n%s", got.stdout, want)
	}
	counted(t, got.stdout, heldNames(t)-3, 3)
	if got.stderr != "" || got.code != 1 {
		t.Errorf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
}

// compose.feature, "A blocked document is reported with what it refuses".
//
// Contract test: the files home holds, as Agister ships them.
func TestABlockedDocumentIsReportedWithWhatItRefuses(t *testing.T) {
	t.Parallel()
	got := compose(t, map[string]string{"/r/.agister/blocks.yaml": "- {process: review_judge, reason: not here}\n"}, "check")
	want := `process review_judge
  /r/.agister/blocks.yaml:1: blocked: not here
  refuses workflow adr_review, workflow code_review, process review_judge
`
	if !strings.HasPrefix(got.stdout, want) {
		t.Errorf("stdout\n%s\nwant it to start\n%s", got.stdout, want)
	}
	counted(t, got.stdout, heldNames(t)-3, 3)
	if got.stderr != "" || got.code != 1 {
		t.Errorf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
}

// compose.feature, "A field is shown with its layer".
//
// Contract test: the files home holds, as Agister ships them.
func TestAFieldIsShownWithItsLayer(t *testing.T) {
	t.Parallel()
	got := compose(t, map[string]string{"/r/.agister/processes/review.yaml": "instruction: Review.\n"}, "inspect", "process", "review")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	fields := map[string][]string{}
	for _, line := range lines(got.stdout) {
		if len(line) == 4 {
			fields[line[0]] = line[1:]
		}
	}
	for place, want := range map[string][]string{
		"instruction": {`"Review."`, "/r/.agister/processes/review.yaml:1", "repository"},
		"schema":      {`"agister.process/v1alpha1"`, "/u/.agister/processes/review.yaml:1", "home"},
	} {
		if got := fields[place]; !slices.Equal(got, want) {
			t.Errorf("%s shown as %q, want %q", place, got, want)
		}
	}
}

// compose.feature, "A step's plan comes through the source and the facts".
// No fault: codex and claude-code take the agents' effort "high".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepsPlanComesThroughTheSourceAndTheFacts(t *testing.T) {
	t.Parallel()
	got := compose(t, nil, "inspect", "workflow", "code_review")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	// Each plan, by its place: its runtime, and the options it takes.
	type plan struct {
		runtime string
		options string
	}
	plans := map[string]plan{}
	var place string
	for _, line := range strings.Split(got.stdout, "\n") {
		if line == "refused" {
			t.Errorf("the workflow is refused:\n%s", got.stdout)
		}
		if rest, ok := strings.CutPrefix(line, "plan of code_review "); ok {
			step, what, _ := strings.Cut(rest, ": ")
			_, runtime, _ := strings.Cut(what, ", runtime ")
			place = step
			plans[place] = plan{runtime: runtime}
			continue
		}
		if options, ok := strings.CutPrefix(line, "  options: "); ok && place != "" {
			p := plans[place]
			p.options = options
			plans[place] = p
		}
	}
	want := map[string]plan{"steps[1]": {runtime: "claude-code"}}
	for i := range 5 {
		want[fmt.Sprintf("steps[0].parallel[%d]", i)] = plan{runtime: "codex", options: "read-only"}
	}
	if !maps.Equal(plans, want) {
		t.Errorf("plans %+v, want %+v", plans, want)
	}
}
