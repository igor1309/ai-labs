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

// ran is what a command printed and its exit code; of a run, its progress
// lines apart from the rest of stderr.
type ran struct {
	stdout, stderr string
	progress       string
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
	commandLine, err := build("/u", links, newFilesystemSpy(settings), rootSpy{root: "/r", links: links.links}, newRuntimesSpy(t).runtimes(), schemaValidator{}, (&sourcesSpy{}).sourcing(), (&holdingSpy{}).holding(), (&storeSpy{}).at, idleHost(t), &stdout, &stderr)
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
	// The fallback plans include Bash, whose grants exceed read-only reviews.
	var warnings strings.Builder
	for _, w := range []struct {
		name      string
		processes []string
	}{
		{"adr_review", []string{"adr_review_codex"}},
		{"code_review", []string{"architecture_review", "tests_review", "adversarial_review", "clarity_review", "intent_review"}},
	} {
		for i, process := range w.processes {
			// The tests slot is a workflow; its own call plans follow below.
			if w.name == "code_review" && i == 1 {
				continue
			}
			for _, extra := range []string{"repository.write", "repository.history.write", "network", "host.write"} {
				fmt.Fprintf(&warnings, "warning: /u/.agister/workflows/%s.yaml:%d steps[0].parallel.steps[%d]: its plan on its fallback \"claude-opus\" grants %q beyond what its process %q allows\n  with workflow %s\n", w.name, 16+i, i, extra, process, w.name)
			}
		}
	}
	for _, step := range []struct {
		place, process, how string
		line                int
	}{
		{"steps[0]", "tests_review", " on its fallback \"claude-opus\"", 10},
		{"steps[1]", "review_critique", "", 11},
		{"steps[2].repeat.steps[0]", "review_revise", " on its fallback \"claude-opus\"", 16},
		{"steps[2].repeat.steps[1]", "review_critique", "", 17},
	} {
		for _, extra := range []string{"repository.write", "repository.history.write", "network", "host.write"} {
			fmt.Fprintf(&warnings, "warning: /u/.agister/workflows/tests_debate.yaml:%d %s: its plan%s grants %q beyond what its process %q allows\n  with workflow code_review, workflow tests_debate\n", step.line, step.place, step.how, extra, step.process)
		}
	}
	if want := (ran{stdout: warnings.String() + fmt.Sprintf("%d resolve, 0 refused\n", heldNames(t))}); got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
}

// check.feature, "A workflow a run refuses before it starts, check refuses".
// The same line must come from the check composition and the run planner.
func TestCheckAndRunShareEveryWorkflowNotRunLine(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, workflow, line string
	}{
		{"parallel repeat", `schema: agister.workflow/v1alpha1
steps:
 - name: p
   parallel:
    - name: c
      repeat:
       state: {}
       next: {}
       steps:
        - {name: s, process: say, agent: bash, inputs: {what: hi}}
       until: {equals: [{from: steps.s.outputs.exit_code}, 0]}
       max: 2
`, `the workflow "w": the item "c", a repeat, is not run yet`},
		{"runtime turn", `schema: agister.workflow/v1alpha1
steps:
  - {name: s, process: say, agent: pi-m3, inputs: {what: hi}}
`, `the step "s": the runtime "pi"'s turn is not run yet`},
		{"workflow input from git.diff", `schema: agister.workflow/v1alpha1
inputs:
  d: {source: git.diff}
steps:
  - {name: s, process: say, agent: bash, inputs: {what: hi}}
`, `the workflow "w": the input "d" from the source "git.diff" is not run yet`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			settings := map[string]string{
				"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", ""),
				"/u/.agister/prompts/say.md":     `echo "$what"`,
				"/u/.agister/workflows/w.yaml":   c.workflow,
				"/u/.agister/workflows/v.yaml":   pairWorkflow,
			}
			checked := compose(t, settings, "check")
			if checked.code != 1 || checked.stderr != "" || !strings.Contains(checked.stdout, "/u/.agister/workflows/w.yaml: "+c.line) {
				t.Fatalf("check ran %+v, want refusal at workflow file containing %q", checked, c.line)
			}
			allSettings := shippedHome(t)
			maps.Copy(allSettings, settings)
			run := asBuilt(t, allSettings, "run", "w")
			wantRun := "agister: the run is refused, and nothing runs:\n  " + c.line + "\n"
			if run.stderr != wantRun || run.code != 1 || run.stdout != "" {
				t.Fatalf("run ran %+v, want stderr %q", run, wantRun)
			}
		})
	}
}

// check.feature, "A workflow a run runs is not refused for it".
func TestCheckDoesNotRefuseAWorkflowItsRunCanRun(t *testing.T) {
	t.Parallel()
	settings := map[string]string{
		"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", ""),
		"/u/.agister/prompts/say.md":     `echo "$what"`,
		"/u/.agister/workflows/w.yaml": `schema: agister.workflow/v1alpha1
steps:
  - {name: a, process: say, agent: bash, inputs: {what: hi}}
  - {name: b, process: say, agent: bash, inputs: {what: hi}}
`,
	}
	got := compose(t, settings, "check")
	if got.code != 0 || strings.Contains(got.stdout, "\n  refuses ") {
		t.Fatalf("check ran %+v, want no refusal", got)
	}
}

// check.feature, "A process's line is the process's, reported once" and
// "A process asked for alone is refused for a source a run does not take".
func TestCheckReportsAnUnpluggedProcessSourceOnce(t *testing.T) {
	t.Parallel()
	settings := map[string]string{
		"/u/.agister/processes/say.yaml": `schema: agister.process/v1alpha1
prompt: say
inputs:
  d: {source: git.diff}
`,
		"/u/.agister/prompts/say.md": `echo hi`,
		"/u/.agister/workflows/w1.yaml": `schema: agister.workflow/v1alpha1
steps:
  - {name: s, process: say, agent: bash}
`,
		"/u/.agister/workflows/w2.yaml": `schema: agister.workflow/v1alpha1
steps:
  - {name: s, process: say, agent: bash}
`,
	}
	got := compose(t, settings, "check")
	want := `the process "say": the input "d" from the source "git.diff" is not run yet`
	if got.code != 1 || !strings.Contains(got.stdout, "/u/.agister/processes/say.yaml: "+want) || !strings.Contains(got.stdout, "refuses workflow w1, workflow w2, process say") {
		t.Fatalf("check ran %+v, want one process finding containing %q", got, want)
	}
	if strings.Count(got.stdout, want) != 1 {
		t.Errorf("process refusal appeared %d times, want once; stdout %q", strings.Count(got.stdout, want), got.stdout)
	}
}

// settings/check's check.feature, "A fault met again adds the problems it
// did not have", as composed: the process "p" is refused through the
// workflow on bash for its source alone, and through the one on
// claude-opus for its document-name input too, which a later workflow
// adds.
func TestCheckReportsAProcessDocumentNameProblemFromEitherWorkflowOrder(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, first, second string
	}{
		{"bash then message", "bash", "claude-opus"},
		{"message then bash", "claude-opus", "bash"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			settings := map[string]string{
				"/u/.agister/processes/p.yaml": `schema: agister.process/v1alpha1
prompt: say
params:
  prompt: {}
inputs:
  prompt: {source: param, name: prompt}
  d: {source: git.diff}
`,
				"/u/.agister/prompts/say.md": `echo hi`,
				"/u/.agister/workflows/w1.yaml": fmt.Sprintf(`schema: agister.workflow/v1alpha1
steps:
  - {name: s, process: p, agent: %s, inputs: {prompt: hi}}
`, c.first),
				"/u/.agister/workflows/w2.yaml": fmt.Sprintf(`schema: agister.workflow/v1alpha1
steps:
  - {name: s, process: p, agent: %s, inputs: {prompt: hi}}
`, c.second),
			}
			got := compose(t, settings, "check")
			source := `the process "p": the input "d" from the source "git.diff" is not run yet`
			name := `the process "p": the input "prompt", a document's name, is not run yet`
			if got.code != 1 || !strings.Contains(got.stdout, "refuses workflow w1, workflow w2, process p") {
				t.Fatalf("check ran %+v, want the process p refusing w1, w2 and p", got)
			}
			for _, want := range []string{source, name} {
				if strings.Count(got.stdout, "/u/.agister/processes/p.yaml: "+want) != 1 {
					t.Errorf("want %q once at p's file; stdout %q", want, got.stdout)
				}
			}
		})
	}
}

// check.feature, "Inspect shows a workflow a run does not run yet as
// refused", with no plan beside the refusal.
func TestInspectShowsTheWorkflowNotRunRefusalWithoutAPlan(t *testing.T) {
	t.Parallel()
	settings := map[string]string{
		"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", ""),
		"/u/.agister/prompts/say.md":     `echo "$what"`,
		"/u/.agister/workflows/v.yaml":   pairWorkflow,
		"/u/.agister/workflows/w.yaml": `schema: agister.workflow/v1alpha1
steps:
  - name: p
    parallel:
      - name: c
        repeat:
          state: {}
          next: {}
          steps:
            - {name: s, process: say, agent: bash, inputs: {what: hi}}
          until: {equals: [{from: steps.s.outputs.exit_code}, 0]}
          max: 2
`,
	}
	got := compose(t, settings, "inspect", "workflow", "w")
	if got.code != 0 || !strings.Contains(got.stdout, `the workflow "w": the item "c", a repeat, is not run yet`) || strings.Contains(got.stdout, "plan of ") {
		t.Fatalf("inspect ran %+v, want refusal and no plan", got)
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
  refuses workflow adr_review, workflow code_review, workflow tests_debate, agent claude-opus, agent codex-sol-61
`
	if !strings.HasPrefix(got.stdout, want) {
		t.Errorf("stdout\n%s\nwant it to start\n%s", got.stdout, want)
	}
	counted(t, got.stdout, heldNames(t)-5, 5)
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
		if strings.HasPrefix(line, "plan of ") {
			place = ""
		}
		if rest, ok := strings.CutPrefix(line, "plan of "); ok {
			step, what, _ := strings.Cut(rest, ": ")
			agent, runtime, _ := strings.Cut(what, ", runtime ")
			place = step + ": " + agent
			plans[place] = plan{runtime: runtime}
			continue
		}
		if options, ok := strings.CutPrefix(line, "  options: "); ok && place != "" {
			p := plans[place]
			p.options = options
			plans[place] = p
		}
	}
	want := map[string]plan{"code_review steps[1]: process review_judge, agent claude-opus": {runtime: "claude-code"}}
	for i := range 5 {
		// The tests slot exposes the child workflow's plans below.
		if i == 1 {
			continue
		}
		prefix := fmt.Sprintf("code_review steps[0].parallel.steps[%d]: process %s, agent ", i, reviews[i].process)
		want[prefix+"codex-sol-61"] = plan{runtime: "codex", options: "read-only"}
		want[prefix+"claude-opus"] = plan{runtime: "claude-code", options: "Glob, Bash"}
	}
	for _, step := range []struct {
		place, process string
		codex          bool
	}{
		{"steps[0]", "tests_review", true},
		{"steps[1]", "review_critique", false},
		{"steps[2].repeat.steps[0]", "review_revise", true},
		{"steps[2].repeat.steps[1]", "review_critique", false},
	} {
		prefix := "tests_debate " + step.place + ": process " + step.process + ", agent "
		if step.codex {
			want[prefix+"codex-sol-61"] = plan{runtime: "codex", options: "read-only"}
		}
		want[prefix+"claude-opus"] = plan{runtime: "claude-code", options: "Glob, Bash"}
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
			commandLine, err := build("/u", &linksSpy{}, newFilesystemSpy(settings), rootSpy{root: "/r"}, newRuntimesSpy(t).runtimes(), schemaValidator{}, (&sourcesSpy{}).sourcing(), (&holdingSpy{}).holding(), (&storeSpy{}).at, machine, &stdout, &stderr)
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
	if _, err := build("/u", nil, newFilesystemSpy(nil), rootSpy{root: "/r"}, newRuntimesSpy(t).runtimes(), schemaValidator{}, (&sourcesSpy{}).sourcing(), (&holdingSpy{}).holding(), (&storeSpy{}).at, idleHost(t), io.Discard, io.Discard); err == nil {
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
			if _, err := build("/u", &linksSpy{}, newFilesystemSpy(nil), rootSpy{root: "/r"}, wrappers, schemaValidator{}, (&sourcesSpy{}).sourcing(), (&holdingSpy{}).holding(), (&storeSpy{}).at, idleHost(t), io.Discard, io.Discard); err == nil {
				t.Errorf("command line built with no %s wrapper, want an error", name)
			}
		})
	}
}

// A command line is built with a store of runs, which it fails without.
func TestACommandLineIsBuiltWithAStoreOfRuns(t *testing.T) {
	t.Parallel()
	if _, err := build("/u", &linksSpy{}, newFilesystemSpy(nil), rootSpy{root: "/r"}, newRuntimesSpy(t).runtimes(), schemaValidator{}, (&sourcesSpy{}).sourcing(), (&holdingSpy{}).holding(), nil, idleHost(t), io.Discard, io.Discard); err == nil || err.Error() != "build: no record store" {
		t.Errorf("command line built with no store of runs: %v, want build: no record store", err)
	}
}
