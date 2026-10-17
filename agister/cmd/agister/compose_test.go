package main

import (
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"path"
	"slices"
	"strings"
	"testing"
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
// through the composition as main builds it, over a filesystem holding
// home's files as Agister ships them and the files repository gives, at
// their paths; and a git whose worktree root of "/r" and below is "/r".
func compose(t *testing.T, repository map[string]string, args ...string) ran {
	t.Helper()
	settings := shippedHome(t)
	maps.Copy(settings, repository)
	return asBuilt(t, settings, args...)
}

// asBuilt runs "agister <args>" in "/r", the user's home directory "/u",
// over the command line build gives over a filesystem holding settings, by
// path, a git whose worktree root of "/r" and below is "/r", and no links.
func asBuilt(t *testing.T, settings map[string]string, args ...string) ran {
	t.Helper()
	return builtIn(t, settings, &linksSpy{}, "/r", args...)
}

// builtIn runs "agister <args>" in dir as asBuilt does, over links, which
// git sees through as well, and spies of the runtime wrappers that run no
// turn.
func builtIn(t *testing.T, settings map[string]string, links *linksSpy, dir string, args ...string) ran {
	t.Helper()
	var stdout, stderr strings.Builder
	commandLine, err := build("/u", links, newFilesystemSpy(settings), rootSpy{root: "/r", links: links.links}, newRuntimesSpy(t).runtimes(), schemaValidator{}, (&sourcesSpy{}).sourcing(), idleHost(t), &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	code := commandLine.Run(args, dir)
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

// compose.feature, "The command runs over every runtime wrapper and the
// user's home". Home holds a runtime of each wrapper's contract, and no
// other document: each resolves only where home is read at
// "/u/.agister" and a wrapper takes its contract.
func TestTheCommandRunsOverEveryRuntimeWrapperAndTheUsersHome(t *testing.T) {
	t.Parallel()
	settings := map[string]string{}
	for _, contract := range []string{"claude-code/3", "codex/2", "pi/1", "bash/1"} {
		adapter, _, _ := strings.Cut(contract, "/")
		settings["/u/.agister/runtimes/"+adapter+".yaml"] = fmt.Sprintf(
			"schema: agister.runtime/v1alpha1\nadapter: %s\ncontract: %s\n", adapter, contract)
	}
	got := asBuilt(t, settings, "check")
	if want := (ran{stdout: "4 resolve, 0 refused\n"}); got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
}

// compose.feature, "AGISTER_HOME names home's folder". Home's folder holds
// a runtime of each wrapper's contract, and no other folder holds any:
// each resolves only where home is read at the folder AGISTER_HOME names,
// or at the user's ".agister" where it names none.
func TestAgisterHomeNamesHomesFolder(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		environ []string
		home    string
	}{
		{"set", []string{"HOME=/u", "AGISTER_HOME=/h"}, "/h"},
		{"set twice, the last kept", []string{"AGISTER_HOME=/x", "AGISTER_HOME=/h"}, "/h"},
		{"unset", []string{"HOME=/u"}, "/u/.agister"},
		{"empty", []string{"AGISTER_HOME=/x", "AGISTER_HOME="}, "/u/.agister"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			settings := map[string]string{}
			for _, contract := range []string{"claude-code/3", "codex/2", "pi/1", "bash/1"} {
				adapter, _, _ := strings.Cut(contract, "/")
				settings[c.home+"/runtimes/"+adapter+".yaml"] = fmt.Sprintf(
					"schema: agister.runtime/v1alpha1\nadapter: %s\ncontract: %s\n", adapter, contract)
			}
			machine := idleHost(t)
			machine.environ = c.environ
			var stdout, stderr strings.Builder
			commandLine, err := build("/u", &linksSpy{}, newFilesystemSpy(settings), rootSpy{root: "/r"}, newRuntimesSpy(t).runtimes(), schemaValidator{}, (&sourcesSpy{}).sourcing(), machine, &stdout, &stderr)
			if err != nil {
				t.Fatal(err)
			}
			code := commandLine.Run([]string{"check"}, "/r")
			got := ran{stdout: stdout.String(), stderr: stderr.String(), code: code}
			if want := (ran{stdout: "4 resolve, 0 refused\n"}); got != want {
				t.Errorf("ran %+v, want %+v", got, want)
			}
		})
	}
}

// compose.feature, "A launch through a link reads the settings where it
// leads". "/o/x" leads to "/r/a", below the worktree root "/r", which git
// gives of either: walked up from "/o/x", "/o/.agister" would be the
// project layer.
//
// Contract test: the files home holds, as Agister ships them.
func TestALaunchThroughALinkReadsTheSettingsWhereItLeads(t *testing.T) {
	t.Parallel()
	settings := shippedHome(t)
	settings["/o/.agister/processes/stray.yaml"] = "schema: agister.process/v1alpha1\ninstruction: Stray.\n"
	links := &linksSpy{links: map[string]string{"/o/x": "/r/a"}}
	got := builtIn(t, settings, links, "/o/x", "inspect", "processes")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	listed := map[string]bool{}
	for _, line := range lines(got.stdout) {
		if len(line) > 0 {
			listed[line[0]] = true
		}
	}
	if listed["stray"] {
		t.Errorf("listed\n%s\nwant no stray", got.stdout)
	}
	for name := range settings {
		if process, ok := strings.CutPrefix(name, "/u/.agister/processes/"); ok {
			if process = strings.TrimSuffix(process, path.Ext(process)); !listed[process] {
				t.Errorf("listed\n%s\nwant %s", got.stdout, process)
			}
		}
	}
	if want := []string{"/o/x"}; !slices.Equal(links.askedOf(), want) {
		t.Errorf("links asked %q, want %q", links.askedOf(), want)
	}
}

// A launch directory whose links do not resolve fails the command, with
// the directory and files' error; and a command line is built with links.
func TestALaunchDirectoryThatDoesNotResolveFailsTheCommand(t *testing.T) {
	t.Parallel()
	got := builtIn(t, shippedHome(t), &linksSpy{missing: []string{"/gone"}}, "/gone", "check")
	if got.code == 0 || got.stdout != "" || !strings.Contains(got.stderr, "/gone") || !strings.Contains(got.stderr, fs.ErrNotExist.Error()) {
		t.Errorf("ran %+v, want a failure naming /gone and %q", got, fs.ErrNotExist)
	}
	if _, err := build("/u", nil, newFilesystemSpy(nil), rootSpy{root: "/r"}, newRuntimesSpy(t).runtimes(), schemaValidator{}, (&sourcesSpy{}).sourcing(), idleHost(t), io.Discard, io.Discard); err == nil {
		t.Error("command line built with no links, want an error")
	}
}

// A command line is built with every runtime wrapper.
func TestACommandLineIsBuiltWithEveryRuntimeWrapper(t *testing.T) {
	t.Parallel()
	for name, without := range map[string]func(*runtimes){
		"bash":        func(r *runtimes) { r.bash = nil },
		"claude-code": func(r *runtimes) { r.claude = nil },
		"codex":       func(r *runtimes) { r.codex = nil },
		"pi":          func(r *runtimes) { r.pi = nil },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			wrappers := newRuntimesSpy(t).runtimes()
			without(&wrappers)
			if _, err := build("/u", &linksSpy{}, newFilesystemSpy(nil), rootSpy{root: "/r"}, wrappers, schemaValidator{}, (&sourcesSpy{}).sourcing(), idleHost(t), io.Discard, io.Discard); err == nil {
				t.Errorf("command line built with no %s wrapper, want an error", name)
			}
		})
	}
}
