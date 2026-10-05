package app_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Settings give an agent its skills (ADR-021).

func skillDoc(name string) string {
	return "---\nname: " + name + "\ndescription: How to " + name + ".\n---\n\n# " + name + "\n"
}

// skilledAgent is the harness's agent a, named name, with the skills given.
func skilledAgent(name string, skills ...string) string {
	text := strings.Replace(settingsDocs()[definition.KindAgent]["a"], `name = "a"`, `name = "`+name+`"`, 1)
	if len(skills) > 0 {
		text += `skills = ["` + strings.Join(skills, `", "`) + `"]` + "\n"
	}
	return text
}

// withSkills is the process with a top-level line naming the skills given,
// after the line that names its agent.
func withSkills(process string, skills ...string) string {
	return strings.Replace(process, "uses: agent:a\n", "uses: agent:a\nskills: ["+strings.Join(skills, ", ")+"]\n", 1)
}

// skilling has process p name the skills review and tests, and its agent a
// style and review; the settings have no skill: skilled adds each.
func skilling(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] = withSkills(settingsDocs()[definition.KindProcess]["p"], "review", "tests")
	h.defs.docs[definition.KindAgent]["a"] = skilledAgent("a", "style", "review")
	h.defs.docs[definition.KindSkill] = map[string]string{}
}

// skilled is skilling with each skill in the settings, on a runtime whose
// adapter gives skills.
func skilled(h *harness) {
	skilling(h)
	for _, name := range []string{"review", "tests", "style"} {
		h.defs.docs[definition.KindSkill][name] = skillDoc(name)
	}
	h.runner.identity.Skills = true
}

func skillSources(record run.Record) []run.DefinitionSource {
	var sources []run.DefinitionSource
	for _, source := range record.Definitions {
		if source.Kind == string(definition.KindSkill) {
			sources = append(sources, source)
		}
	}
	return sources
}

func skillSource(name string) run.DefinitionSource {
	return run.DefinitionSource{Kind: "skills", Name: name, Path: "mem/skills/" + name, SHA256: sha(skillDoc(name))}
}

func callSkill(name string) app.CallSkill {
	return app.CallSkill{Name: name, Bytes: []byte(skillDoc(name)), Identity: "sha256:" + sha(skillDoc(name))}
}

// resolved is the call of p as the harness's settings resolve it.
func (h *harness) resolved(t *testing.T, request app.CallResolveRequest) (*app.ResolvedCall, error) {
	t.Helper()
	request.Process = "p"
	return app.NewResolver(h.defs, h.runtimes, h.validator, resolverCheckStub{}).Snapshot(context.Background()).Resolve(context.Background(), request)
}

// Rules 2 and 3: the resolved call carries its skills in order, the
// process's then its agent's, each once, each with its name, its bytes and
// its digest; the run records each among the call's definitions.
func TestACallIsResolvedWithItsProcessesSkillsThenItsAgents(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	call, err := h.resolved(t, app.CallResolveRequest{})
	if want := []app.CallSkill{callSkill("review"), callSkill("tests"), callSkill("style")}; err != nil || !reflect.DeepEqual(call.Skills, want) {
		t.Fatalf("skills = %+v, %v", call.Skills, err)
	}
	for _, name := range []string{"review", "tests", "style"} {
		source := app.CallSource{Kind: "skills", Name: name, Path: "mem/skills/" + name, SHA256: sha(skillDoc(name))}
		if !reflect.DeepEqual(skillsAmong(call.Sources, name), []app.CallSource{source}) {
			t.Fatalf("sources of %s = %+v", name, skillsAmong(call.Sources, name))
		}
	}

	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	if want := []run.DefinitionSource{skillSource("review"), skillSource("tests"), skillSource("style")}; !reflect.DeepEqual(skillSources(record), want) {
		t.Fatalf("skill sources = %+v", skillSources(record))
	}
}

func skillsAmong(sources []app.CallSource, name string) []app.CallSource {
	var found []app.CallSource
	for _, source := range sources {
		if source.Kind == string(definition.KindSkill) && source.Name == name {
			found = append(found, source)
		}
	}
	return found
}

// Rule 2: with --agent the process's skills stay and the agent's are the
// named agent's.
func TestAnotherAgentSwapsTheAgentsSkills(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	h.defs.docs[definition.KindAgent]["b"] = skilledAgent("b", "git", "tests")
	h.defs.docs[definition.KindSkill]["git"] = skillDoc("git")
	call, err := h.resolved(t, app.CallResolveRequest{Agent: "b"})
	if want := []app.CallSkill{callSkill("review"), callSkill("tests"), callSkill("git")}; err != nil || !reflect.DeepEqual(call.Skills, want) {
		t.Fatalf("skills = %+v, %v", call.Skills, err)
	}
	record := h.call(t, contract.CallRequest{Agent: "b"})
	if want := []run.DefinitionSource{skillSource("review"), skillSource("tests"), skillSource("git")}; record.Result.Status != run.Completed || !reflect.DeepEqual(skillSources(record), want) {
		t.Fatalf("result %+v: %s; skill sources %+v", record.Result, message(record), skillSources(record))
	}
	// An agent that names none leaves the process's.
	h.defs.docs[definition.KindAgent]["c"] = skilledAgent("c")
	call, err = h.resolved(t, app.CallResolveRequest{Agent: "c"})
	if want := []app.CallSkill{callSkill("review"), callSkill("tests")}; err != nil || !reflect.DeepEqual(call.Skills, want) {
		t.Fatalf("skills on c = %+v, %v", call.Skills, err)
	}
}

// Rule 3: a skill's bytes are its SKILL.md's, whole, and its identity
// their digest: an edit is another skill to the run that records it.
func TestASkillIsRecordedByItsDigest(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	edited := skillDoc("review") + "\nRead the tests first.\n"
	h.defs.docs[definition.KindSkill]["review"] = edited
	call, err := h.resolved(t, app.CallResolveRequest{})
	if err != nil || string(call.Skills[0].Bytes) != edited || call.Skills[0].Identity != "sha256:"+sha(edited) {
		t.Fatalf("review = %+v, %v", call.Skills[0], err)
	}
	record := h.call(t, contract.CallRequest{})
	if sources := skillSources(record); len(sources) != 3 || sources[0].SHA256 != sha(edited) {
		t.Fatalf("skill sources = %+v", sources)
	}
}

// Rule 4: a name the settings lack is a problem of the agent or the
// process that names it.
func TestAMissingSkillIsAProblemOfWhatNamesIt(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilling(h)
	h.defs.docs[definition.KindSkill]["review"] = skillDoc("review")
	report := checkOf(t, h, false)
	want := []string{`agent a: skill "style" does not exist`, `process p: skill "tests" does not exist`}
	if !reflect.DeepEqual(messages(report.Problems), want) || report.Checked["skills"] != 1 {
		t.Fatalf("problems %q, checked %v", messages(report.Problems), report.Checked)
	}
}

// A call resolved without a skill it names is refused before its first
// turn, naming what names the skill and where it was expected.
func TestACallNamingAMissingSkillIsRefused(t *testing.T) {
	t.Parallel()
	missing := errors.New("not found (expected /repo/.agister/skills/x/SKILL.md or /home/skills/x/SKILL.md)")
	for name, want := range map[string]string{
		"tests": `process p names skill "tests": ` + missing.Error(),
		"style": `agent a names skill "style": ` + missing.Error(),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			skilled(h)
			h.calls = h.callsOn(failingSource{definitionsSpy: h.defs, readErr: map[string]error{"skills/" + name: missing}})
			record := h.call(t, contract.CallRequest{})
			if class(record) != run.ClassRefused || message(record) != want {
				t.Fatalf("result %+v: %q, want %q", record.Result, message(record), want)
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
				t.Fatalf("turns %d, checkouts %v after the refusal", len(h.runner.calls()), h.workspaces.checkouts)
			}
		})
	}
}

// Rule 4: a broken skill is a problem of its own: what names it is not
// told that it does not exist.
func TestABrokenSkillIsAProblemOfItsOwnNotAMissingOne(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	h.defs.docs[definition.KindSkill]["review"] = "# Review\n\nNo front matter.\n"
	report := checkOf(t, h, false)
	want := []string{"skill review: has no front matter: it starts with a line ---, then name and description, then a line ---"}
	if !reflect.DeepEqual(messages(report.Problems), want) || report.Checked["skills"] != 3 {
		t.Fatalf("problems %q, checked %v", messages(report.Problems), report.Checked)
	}
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "has no front matter") || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}

	// So is one whose folder cannot be read as a skill.
	h = newHarness()
	skilled(h)
	unreadable := errors.New("/home/skills/review holds notes.md beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"skills/review": unreadable}}
	report, err := app.NewChecker(live, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"skill review: " + unreadable.Error()}; !reflect.DeepEqual(messages(report.Problems), want) || len(report.Warnings) != 0 {
		t.Fatalf("problems %q, warnings %q, want %q", messages(report.Problems), report.Warnings, want)
	}
	h.calls = h.callsOn(live)
	record = h.call(t, contract.CallRequest{})
	if want := `process p names skill "review": ` + unreadable.Error(); class(record) != run.ClassRefused || message(record) != want || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q, want %q", record.Result, message(record), want)
	}
}

// Rule 4: either refuses only the calls that depend on it (ADR-015): the
// calls of what names the skill, and with another agent the calls that no
// longer do; every other call runs.
func TestASkillProblemRefusesOnlyTheCallsThatDependOnIt(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	process := settingsDocs()[definition.KindProcess]["p"]
	settings := func() *harness {
		h := newHarness()
		h.runner.identity.Skills = true
		// p names review, and its agent a names style; q names neither, on
		// b, which names neither.
		h.defs.docs[definition.KindProcess]["p"] = withSkills(process, "review")
		h.defs.docs[definition.KindProcess]["q"] = strings.Replace(strings.Replace(process, "name: p", "name: q", 1), "uses: agent:a", "uses: agent:b", 1)
		h.defs.docs[definition.KindAgent]["a"] = skilledAgent("a", "style")
		h.defs.docs[definition.KindAgent]["b"] = skilledAgent("b")
		h.defs.docs[definition.KindSkill] = map[string]string{"review": skillDoc("review"), "style": skillDoc("style")}
		return h
	}
	refused := func(t *testing.T, h *harness, client contract.Client, request contract.CallRequest, want string) {
		t.Helper()
		turns := len(h.runner.calls())
		if record := h.submit(t, client, request); class(record) != run.ClassRefused || message(record) != want {
			t.Fatalf("call %+v: %s %q, want %q", request, class(record), message(record), want)
		}
		if len(h.runner.calls()) != turns {
			t.Fatalf("call %+v: a turn started", request)
		}
	}
	runs := func(t *testing.T, h *harness, client contract.Client, request contract.CallRequest) {
		t.Helper()
		turns := len(h.runner.calls())
		if record := h.submit(t, client, request); class(record) != "" || len(h.runner.calls()) != turns+1 {
			t.Fatalf("call %+v: %s %s, %d turns", request, class(record), message(record), len(h.runner.calls())-turns)
		}
	}
	reaches := func(t *testing.T, client contract.Client, problem string, subject contract.DefinitionRef, processes ...string) {
		t.Helper()
		report, err := client.Check(ctx, false)
		if err != nil {
			t.Fatal(err)
		}
		if reach := reachOf(t, report, problem); reach.Stops || !reflect.DeepEqual(reach.Processes, processes) || reach.Subject == nil || *reach.Subject != subject {
			t.Fatalf("reach = %+v", reach)
		}
	}

	t.Run("a skill the agent names is missing", func(t *testing.T) {
		t.Parallel()
		h := settings()
		delete(h.defs.docs[definition.KindSkill], "style")
		client := h.clientOn(h.defs)
		reaches(t, client, `agent a: skill "style" does not exist`, contract.DefinitionRef{Kind: "agents", Name: "a"}, "p")
		refused(t, h, client, contract.CallRequest{Process: "p"}, `process p uses agent a (mem/agents/a): skill "style" does not exist`)
		runs(t, h, client, contract.CallRequest{Process: "p", Agent: "b"})
		runs(t, h, client, contract.CallRequest{Process: "q"})
		refused(t, h, client, contract.CallRequest{Process: "q", Agent: "a"}, `process q uses agent a (mem/agents/a): skill "style" does not exist`)
	})
	t.Run("a skill the process names is missing", func(t *testing.T) {
		t.Parallel()
		h := settings()
		delete(h.defs.docs[definition.KindSkill], "review")
		client := h.clientOn(h.defs)
		reaches(t, client, `process p: skill "review" does not exist`, contract.DefinitionRef{Kind: "processes", Name: "p"}, "p")
		refused(t, h, client, contract.CallRequest{Process: "p"}, `process p (mem/processes/p): skill "review" does not exist`)
		refused(t, h, client, contract.CallRequest{Process: "p", Agent: "b"}, `process p (mem/processes/p): skill "review" does not exist`)
		runs(t, h, client, contract.CallRequest{Process: "q"})
		runs(t, h, client, contract.CallRequest{Process: "q", Agent: "a"})
	})
	t.Run("a skill the process names is broken", func(t *testing.T) {
		t.Parallel()
		h := settings()
		h.defs.docs[definition.KindSkill]["review"] = "---\nname: review\n---\n"
		client := h.clientOn(h.defs)
		reaches(t, client, "skill review: description: is required", contract.DefinitionRef{Kind: "skills", Name: "review"}, "p")
		refused(t, h, client, contract.CallRequest{Process: "p"}, "process p uses skill review (mem/skills/review): description: is required")
		refused(t, h, client, contract.CallRequest{Process: "p", Agent: "b"}, "process p uses skill review (mem/skills/review): description: is required")
		runs(t, h, client, contract.CallRequest{Process: "q"})
	})
	t.Run("a skill the agent names is broken", func(t *testing.T) {
		t.Parallel()
		h := settings()
		h.defs.docs[definition.KindSkill]["style"] = "---\nname: styles\ndescription: d\n---\n"
		client := h.clientOn(h.defs)
		problem := `name: "styles" does not match its definition name "style"`
		reaches(t, client, "skill style: "+problem, contract.DefinitionRef{Kind: "skills", Name: "style"}, "p")
		refused(t, h, client, contract.CallRequest{Process: "p"}, "process p uses agent a, which uses skill style (mem/skills/style): "+problem)
		runs(t, h, client, contract.CallRequest{Process: "p", Agent: "b"})
		runs(t, h, client, contract.CallRequest{Process: "q"})
	})
	t.Run("a skill nothing names is broken", func(t *testing.T) {
		t.Parallel()
		h := settings()
		h.defs.docs[definition.KindSkill]["unused"] = "no front matter"
		client := h.clientOn(h.defs)
		report, err := client.Check(ctx, false)
		if err != nil {
			t.Fatal(err)
		}
		problem := "skill unused: has no front matter: it starts with a line ---, then name and description, then a line ---"
		if reach := reachOf(t, report, problem); reach.Stops || len(reach.Processes)+len(reach.Workflows) != 0 {
			t.Fatalf("reach = %+v, want nothing refused", reach)
		}
		runs(t, h, client, contract.CallRequest{Process: "p"})
		runs(t, h, client, contract.CallRequest{Process: "q"})
	})
}

// A skill folder whose name breaks the naming rule names no document: it
// stops every command, as such a file of any kind does (ADR-015 rule 4).
func TestASkillFolderWithAnInvalidNameStopsEveryCommand(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	h.defs.docs[definition.KindSkill]["Code Review"] = skillDoc("Code Review")
	report, err := h.clientOn(h.defs).Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	problem := `skill Code Review: "Code Review" is not a valid name; rename the folder`
	if reach := reachOf(t, report, problem); !reach.Stops {
		t.Fatalf("reach = %+v, want every command stopped", reach)
	}
}

// check --tree's links: an agent and a process use each skill they name,
// found or not, and the skill is used by both.
func TestCheckLinksAnAgentAndAProcessToTheirSkills(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	definitions := func(h *harness) map[contract.DefinitionRef]contract.Definition {
		got := map[contract.DefinitionRef]contract.Definition{}
		for _, d := range checkOf(t, h, false).Definitions {
			got[ref(d.Kind, d.Name)] = d
		}
		return got
	}
	agentUses := []contract.DefinitionRef{ref("runtimes", "rt"), ref("skills", "style"), ref("skills", "review")}
	processUses := []contract.DefinitionRef{ref("agents", "a"), ref("policies", "pol"), ref("skills", "review"), ref("skills", "tests"), ref("schemas", "s")}
	h := newHarness()
	skilled(h)
	got := definitions(h)
	if a := got[ref("agents", "a")]; !reflect.DeepEqual(a.Uses, agentUses) {
		t.Fatalf("a = %+v", a)
	}
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, processUses) {
		t.Fatalf("p = %+v", p)
	}
	if review := got[ref("skills", "review")]; !reflect.DeepEqual(review.UsedBy, []contract.DefinitionRef{ref("agents", "a"), ref("processes", "p")}) || review.Path != "mem/skills/review" || review.Layer != "global" || len(review.Uses) != 0 {
		t.Fatalf("review = %+v", review)
	}
	if style := got[ref("skills", "style")]; !reflect.DeepEqual(style.UsedBy, []contract.DefinitionRef{ref("agents", "a")}) {
		t.Fatalf("style = %+v", style)
	}
	if tests := got[ref("skills", "tests")]; !reflect.DeepEqual(tests.UsedBy, []contract.DefinitionRef{ref("processes", "p")}) {
		t.Fatalf("tests = %+v", tests)
	}

	missing := newHarness()
	skilling(missing)
	got = definitions(missing)
	if a, p := got[ref("agents", "a")], got[ref("processes", "p")]; !reflect.DeepEqual(a.Uses, agentUses) || !reflect.DeepEqual(p.Uses, processUses) {
		t.Fatalf("without the skills: a = %+v, p = %+v", a, p)
	}
	if _, ok := got[ref("skills", "review")]; ok {
		t.Fatal("a skill that does not exist is listed")
	}
}

// Rule 6: no adapter gives skills yet. A call that names one on an adapter
// that cannot give it is refused before its first turn, naming the adapter
// and the skills: it must not run without them.
func TestACallNamingASkillIsRefusedOnAnAdapterThatGivesNone(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	h.runner.identity.Skills = false
	record := h.call(t, contract.CallRequest{})
	want := "adapter spy of runtime rt cannot give a call its skills (ADR-021): review, tests, style"
	if class(record) != run.ClassRefused || message(record) != "process p: "+want {
		t.Fatalf("result %+v: %q, want %q", record.Result, message(record), want)
	}
	if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 || len(h.inputs.specs) != 0 {
		t.Fatalf("turns %d, checkouts %v, inputs %d after the refusal", len(h.runner.calls()), h.workspaces.checkouts, len(h.inputs.specs))
	}
	// The refused run still records what the call was resolved from.
	if want := []run.DefinitionSource{skillSource("review"), skillSource("tests"), skillSource("style")}; !reflect.DeepEqual(skillSources(record), want) {
		t.Fatalf("skill sources = %+v", skillSources(record))
	}

	// Through the client it names the process's document too; the settings
	// themselves have no problem.
	h = newHarness()
	skilled(h)
	h.runner.identity.Skills = false
	client := h.clientOn(h.defs)
	if report, err := client.Check(context.Background(), false); err != nil || len(report.Problems) != 0 {
		t.Fatalf("problems %q, %v", messages(report.Problems), err)
	}
	record = h.submit(t, client, contract.CallRequest{Process: "p"})
	if class(record) != run.ClassRefused || message(record) != "process p (mem/processes/p): "+want || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}
}

// The skills of the agent alone refuse the call the same way, and another
// agent's do not: the call is judged on the skills it is given.
func TestTheRefusalIsOfTheSkillsTheCallIsGiven(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[definition.KindAgent]["a"] = skilledAgent("a", "style")
	h.defs.docs[definition.KindAgent]["b"] = skilledAgent("b")
	h.defs.docs[definition.KindSkill] = map[string]string{"style": skillDoc("style")}
	record := h.call(t, contract.CallRequest{})
	want := "process p: adapter spy of runtime rt cannot give a call its skills (ADR-021): style"
	if class(record) != run.ClassRefused || message(record) != want || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q, want %q", record.Result, message(record), want)
	}
	h = newHarness()
	h.defs.docs[definition.KindAgent]["a"] = skilledAgent("a", "style")
	h.defs.docs[definition.KindAgent]["b"] = skilledAgent("b")
	h.defs.docs[definition.KindSkill] = map[string]string{"style": skillDoc("style")}
	if record := h.call(t, contract.CallRequest{Agent: "b"}); record.Result.Status != run.Completed || len(h.runner.calls()) != 1 {
		t.Fatalf("on b: result %+v: %s", record.Result, message(record))
	}
}

// A second skills does not empty the first: a process or an agent that
// declares its skills twice is invalid, so its call is refused before its
// first turn rather than run without the skill it names.
func TestACallOfSkillsDeclaredTwiceIsRefused(t *testing.T) {
	t.Parallel()
	cases := map[string]struct {
		kind                definition.Kind
		name, text, problem string
	}{
		"a process": {
			definition.KindProcess, "p",
			withSkills(settingsDocs()[definition.KindProcess]["p"], "review") + "skills: []\n",
			"process p: skills: is declared more than once: one list names the process's skills",
		},
		// The TOML parser refuses a key defined twice itself.
		"an agent": {
			definition.KindAgent, "a",
			skilledAgent("a", "review") + "skills = []\n",
			"agent a: toml: line 9 (last key \"skills\"): Key 'skills' has already been defined.",
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			h.defs.docs[c.kind][c.name] = c.text
			h.defs.docs[definition.KindSkill] = map[string]string{"review": skillDoc("review")}
			if report := checkOf(t, h, false); !slices.Contains(messages(report.Problems), c.problem) {
				t.Fatalf("problems = %q, want %q among them", messages(report.Problems), c.problem)
			}
			record := h.call(t, contract.CallRequest{})
			_, want, _ := strings.Cut(c.problem, ": ")
			if class(record) != run.ClassRefused || !strings.Contains(message(record), want) {
				t.Fatalf("result %+v: %q, want %q", record.Result, message(record), want)
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
				t.Fatalf("turns %d, checkouts %v after the refusal", len(h.runner.calls()), h.workspaces.checkouts)
			}
		})
	}
}

// A call that names no skill runs as it did, whether or not the settings
// have skills and whatever the adapter says of them.
func TestACallNamingNoSkillRunsAsBefore(t *testing.T) {
	t.Parallel()
	plain := newHarness()
	want := plain.call(t, contract.CallRequest{})
	if want.Result.Status != run.Completed || len(plain.runner.calls()) != 1 {
		t.Fatalf("result %+v: %s", want.Result, message(want))
	}
	for name, gives := range map[string]bool{"an adapter that gives none": false, "an adapter that gives skills": true} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			h.defs.docs[definition.KindSkill] = map[string]string{"review": skillDoc("review")}
			h.runner.identity.Skills = gives
			call, err := h.resolved(t, app.CallResolveRequest{})
			if err != nil || len(call.Skills) != 0 {
				t.Fatalf("skills = %+v, %v", call.Skills, err)
			}
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Completed || len(skillSources(record)) != 0 || !reflect.DeepEqual(record.Definitions, want.Definitions) {
				t.Fatalf("result %+v: %s; definitions %+v", record.Result, message(record), record.Definitions)
			}
			if !reflect.DeepEqual(h.runner.calls(), plain.runner.calls()) {
				t.Fatalf("turn = %+v, want %+v", h.runner.calls(), plain.runner.calls())
			}
		})
	}
}

// process show lists the call's skills, the process's apart from its
// agent's, and where each comes from among its sources; on an adapter that
// gives none it shows the refusal.
func TestShowProcessShowsItsSkills(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	skilled(h)
	h.defs.docs[definition.KindAgent]["b"] = skilledAgent("b", "git")
	h.defs.docs[definition.KindSkill]["git"] = skillDoc("git")
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{}))
	view, err := inspection.ShowProcess(ctx, "p", "")
	if err != nil || !reflect.DeepEqual(view.Skills, []string{"review", "tests"}) || !reflect.DeepEqual(view.AgentSkills, []string{"style"}) || view.Refusal != "" {
		t.Fatalf("skills %q, agent's %q, refusal %q, %v", view.Skills, view.AgentSkills, view.Refusal, err)
	}
	for _, name := range []string{"review", "tests", "style"} {
		if origin := (contract.DefinitionOrigin{Kind: "skills", Name: name, Layer: "global", Path: "mem/skills/" + name}); !containsOrigin(view.Sources, origin) {
			t.Fatalf("sources lack %s: %+v", name, view.Sources)
		}
	}
	view, err = inspection.ShowProcess(ctx, "p", "b")
	if err != nil || !reflect.DeepEqual(view.Skills, []string{"review", "tests"}) || !reflect.DeepEqual(view.AgentSkills, []string{"git"}) || view.Refusal != "" {
		t.Fatalf("on b: skills %q, agent's %q, refusal %q, %v", view.Skills, view.AgentSkills, view.Refusal, err)
	}

	h.runner.identity.Skills = false
	view, err = inspection.ShowProcess(ctx, "p", "")
	if want := "process p: adapter spy of runtime rt cannot give a call its skills (ADR-021): review, tests, style"; err != nil || view.Refusal != want || !reflect.DeepEqual(view.AgentSkills, []string{"style"}) {
		t.Fatalf("refusal = %q, %v, want %q", view.Refusal, err, want)
	}

	h.runner.identity.Skills = true
	delete(h.defs.docs[definition.KindSkill], "tests")
	view, err = inspection.ShowProcess(ctx, "p", "")
	if err != nil || !reflect.DeepEqual(view.Skills, []string{"review", "tests"}) || !reflect.DeepEqual(view.AgentSkills, []string{"style"}) || view.Refusal != `process p names skill "tests": not found` {
		t.Fatalf("missing: skills %q, agent's %q, refusal %q, %v", view.Skills, view.AgentSkills, view.Refusal, err)
	}
}

// The snapshot covers skills: the skill a call is given is the one check
// saw, though it was edited between the check and the call.
func TestGatedCallIsGivenTheSkillCheckSaw(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	skilled(h)
	gated := &app.Gated{
		Definitions: h.defs,
		Global:      h.defs,
		Build: func(src, _ app.GateDefinitions) contract.Client {
			return &afterCheck{
				Client: &app.Host{
					Checker: app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff", "param"}),
					Calls:   h.callsOn(src),
				},
				f: func() { h.defs.set(definition.KindSkill, "review", "Edited after the check.\n") },
			}
		},
	}
	if _, err := gated.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	record := h.recorder.wait(t)
	if class(record) != "" {
		t.Fatalf("call failed: %s", message(record))
	}
	if want := []run.DefinitionSource{skillSource("review"), skillSource("tests"), skillSource("style")}; !reflect.DeepEqual(skillSources(record), want) {
		t.Fatalf("skill sources = %+v", skillSources(record))
	}
}

// A snapshot keeps what the source answered for a skill an agent or a
// process names and the settings do not list, so a view of the process
// says where it was expected; and it reads the source no more for it.
func TestSnapshotKeepsTheReadOfAMissingSkill(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	for name, want := range map[string]string{"tests": `process p names skill "tests": `, "style": `agent a names skill "style": `} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			skilled(h)
			delete(h.defs.docs[definition.KindSkill], name)
			missing := errors.New("not found (expected /repo/.agister/skills/" + name + "/SKILL.md or /home/skills/" + name + "/SKILL.md)")
			live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"skills/" + name: missing}}
			snap := app.Snapshot(ctx, live)
			reads := h.defs.readCount()
			if _, err := snap.Read(ctx, definition.KindSkill, name); err != missing {
				t.Fatalf("read error = %v", err)
			}
			view, err := app.NewInspection(app.NewResolver(snap, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{})).ShowProcess(ctx, "p", "")
			if err != nil || view.Refusal != want+missing.Error() {
				t.Fatalf("refusal = %q, %v, want %q", view.Refusal, err, want+missing.Error())
			}
			if got := h.defs.readCount(); got != reads {
				t.Fatalf("reading the snapshot read the source %d more times", got-reads)
			}
		})
	}
}

// Rule 3: a workflow's node gets the skills of its own call: its process's,
// then its agent's.
func TestAWorkflowNodeGetsTheSkillsOfItsOwnCall(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	h.runner.skills = true
	h.defs.set(definition.KindProcess, "first", withSkills(nodeProcess("first", "Work as first."), "review"))
	h.defs.set(definition.KindProcess, "joiner", withSkills(joinProcess, "tests", "style"))
	h.defs.set(definition.KindAgent, "a", skilledAgent("a", "style"))
	h.defs.docs[definition.KindSkill] = map[string]string{"review": skillDoc("review"), "tests": skillDoc("tests"), "style": skillDoc("style")}
	id := h.submit(t, contract.CallRequest{})
	if record := h.store.wait(t, id); record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	for run, want := range map[string][]run.DefinitionSource{
		"run-2": {skillSource("review"), skillSource("style")}, // one: first
		"run-3": {skillSource("style")},                        // two: second
		"run-4": {skillSource("tests"), skillSource("style")},  // merge: joiner
	} {
		if got := skillSources(h.store.wait(t, run)); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: skill sources = %+v, want %+v", run, got, want)
		}
	}
}

// Rule 6: a workflow one of whose nodes names a skill, on an adapter that
// gives none, is refused before any node starts.
func TestAWorkflowWithASkilledNodeIsRefusedOnAnAdapterThatGivesNone(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	h.defs.set(definition.KindProcess, "joiner", withSkills(joinProcess, "tests"))
	h.defs.docs[definition.KindSkill] = map[string]string{"tests": skillDoc("tests")}
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	want := "adapter spy of runtime rt cannot give a call its skills (ADR-021): tests"
	if class(record) != run.ClassRefused || !strings.Contains(message(record), want) || len(h.store.ids()) != 1 {
		t.Fatalf("result %+v, runs %v", record.Result, h.store.ids())
	}
	for _, instruction := range []string{"Work as first.", "Work as second.", "Join them."} {
		if turns := h.runner.turns(instruction); len(turns) != 0 {
			t.Fatalf("%q ran %d turns", instruction, len(turns))
		}
	}
}

// Rules 5-6: every turn carries the resolved bytes in process/agent order.
func assertTurnSkills(t *testing.T, turns []app.TurnRequest, count int) {
	t.Helper()
	want := []app.TurnSkill{{Name: "review", Bytes: []byte(skillDoc("review"))}, {Name: "tests", Bytes: []byte(skillDoc("tests"))}, {Name: "style", Bytes: []byte(skillDoc("style"))}}
	if len(turns) != count {
		t.Fatalf("turns = %+v, want %d", turns, count)
	}
	for i, turn := range turns {
		if !reflect.DeepEqual(turn.Skills, want) {
			t.Fatalf("turn %d skills = %+v, want %+v", i, turn.Skills, want)
		}
	}
}

func TestTheFirstTurnCarriesTheCallsSkills(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	if record := h.call(t, contract.CallRequest{}); record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	assertTurnSkills(t, h.runner.calls(), 1)
}

func TestAContinuationCarriesTheCallsSkills(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	patchedRun(h, "run-0", "", 0, 1, "")
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	assertTurnSkills(t, h.runner.calls(), 1)
	if h.runner.calls()[0].ResumeSessionID != "prov-0" {
		t.Fatalf("continuation = %+v", h.runner.calls()[0])
	}
}

func TestEveryVerificationRepairCarriesTheCallsSkills(t *testing.T) {
	t.Parallel()
	h := newHarness()
	skilled(h)
	verifying(h)
	h.commands.exits = []int{1, 1, 0}
	identities := 0
	h.changes.identify = func() string { identities++; return fmt.Sprintf("tree-%d", identities) }
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || len(record.Attempts) != 3 {
		t.Fatalf("result %+v, attempts %+v", record.Result, record.Attempts)
	}
	assertTurnSkills(t, h.runner.calls(), 3)
	for _, turn := range h.runner.calls()[1:] {
		if turn.ResumeSessionID != "prov-1" {
			t.Fatalf("repair = %+v", turn)
		}
	}
}
