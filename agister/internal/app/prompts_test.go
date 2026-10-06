package app_test

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Prompts are settings (ADR-014).

const reviewPrompt = "Review the change against the rules.\n"

// promptingProcess is the harness's process p with the inputs given added
// after its others.
func promptingProcess(values string) string {
	diff := "    diff: {source: git.diff, base: \"${param.base}\", head: \"${param.candidate}\"}\n"
	return strings.Replace(settingsDocs()[definition.KindProcess]["p"], diff, diff+values, 1)
}

// prompting gives p the input rules, the prompt review, and the settings
// no prompt: prompted adds it.
func prompting(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] = promptingProcess("    rules: {source: prompt, name: review}\n")
	h.defs.docs[definition.KindPrompt] = map[string]string{}
}

func prompted(h *harness, text string) {
	prompting(h)
	h.defs.docs[definition.KindPrompt]["review"] = text
}

func promptInput(record run.Record) run.Input {
	for _, input := range record.Inputs {
		if input.Source == definition.PromptSource {
			return input
		}
	}
	return run.Input{}
}

func promptSources(record run.Record) []run.DefinitionSource {
	var sources []run.DefinitionSource
	for _, source := range record.Definitions {
		if source.Kind == string(definition.KindPrompt) {
			sources = append(sources, source)
		}
	}
	return sources
}

// Rules 1 and 3: the input's value is the document's text, unchanged; its
// identity is the digest the call records among its definitions.
func TestACallIsGivenThePromptItsProcessNames(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompted(h, reviewPrompt)
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	want := run.Input{Name: "rules", Source: "prompt", Identity: "sha256:" + sha(reviewPrompt), Value: reviewPrompt}
	if got := promptInput(record); !reflect.DeepEqual(got, want) {
		t.Fatalf("input = %+v, want %+v", got, want)
	}
	source := run.DefinitionSource{Kind: "prompts", Name: "review", Path: "mem/prompts/review", SHA256: sha(reviewPrompt)}
	if got := promptSources(record); !reflect.DeepEqual(got, []run.DefinitionSource{source}) {
		t.Fatalf("prompt sources = %+v", got)
	}
	if calls := h.runner.calls(); len(calls) != 1 || !strings.Contains(calls[0].Prompt, reviewPrompt) {
		t.Fatalf("the agent was not given the prompt: %+v", calls)
	}
}

// Two inputs naming one prompt read it once, and it is one source.
func TestAPromptNamedTwiceIsOneSource(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompted(h, reviewPrompt)
	h.defs.docs[definition.KindProcess]["p"] = promptingProcess("    rules: {source: prompt, name: review}\n    again: {source: prompt, name: review}\n")
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || len(promptSources(record)) != 1 {
		t.Fatalf("result %+v: %s; prompt sources %+v", record.Result, message(record), promptSources(record))
	}
	var values []any
	for _, input := range record.Inputs {
		if input.Source == definition.PromptSource {
			values = append(values, input.Value)
		}
	}
	if !reflect.DeepEqual(values, []any{reviewPrompt, reviewPrompt}) {
		t.Fatalf("prompt values = %q", values)
	}
}

// Rule 4: a prompt in neither layer is a problem of the process that names
// it; a call resolved without it is refused before the first turn, naming
// the input, the prompt and where it was expected.
func TestAMissingPromptIsAProblemOfTheProcessAndRefusesTheCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompting(h)
	if report := checkOf(t, h, false); !reflect.DeepEqual(messages(report.Problems), []string{`process p: input rules: prompt "review" does not exist`}) {
		t.Fatalf("problems = %q", messages(report.Problems))
	}

	missing := errors.New("not found (expected /repo/.agister/prompts/review.md or /home/prompts/review.md)")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/review": missing}}
	h.calls = h.callsOn(live)
	record := h.call(t, contract.CallRequest{})
	want := `input rules: prompt "review": ` + missing.Error()
	if class(record) != run.ClassRefused || message(record) != want {
		t.Fatalf("result %+v: %q, want %q", record.Result, message(record), want)
	}
	if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
		t.Fatalf("turns %d, checkouts %v after the refusal", len(h.runner.calls()), h.workspaces.checkouts)
	}
}

// Rule 1: a prompt that is not readable text is a problem of that document,
// not of the process naming it; a call of the process is refused.
func TestAnUnreadablePromptIsAProblemOfItsOwn(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompted(h, "\x00")
	report := checkOf(t, h, false)
	if !reflect.DeepEqual(messages(report.Problems), []string{"prompt review: not a UTF-8 text file"}) || report.Checked["prompts"] != 1 {
		t.Fatalf("problems %q, checked %v", messages(report.Problems), report.Checked)
	}
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "not a UTF-8 text file") || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}
}

// Rule 1: a prompt that is listed but cannot be read is a problem of that
// document: the process naming it is not told that it does not exist.
func TestAnUnreadableListedPromptIsAProblemNotAMissingOne(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompted(h, reviewPrompt)
	unreadable := errors.New("cannot read prompt review")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/review": unreadable}}
	report, err := app.NewChecker(live, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"prompt review: cannot read prompt review"}
	if !reflect.DeepEqual(messages(report.Problems), want) || len(report.Warnings) != 0 {
		t.Fatalf("problems %q, warnings %q, want problems %q and no warnings", messages(report.Problems), report.Warnings, want)
	}
}

// withoutPrompts is a CallResolver that resolves through the Resolver and
// then drops the prompts it resolved, as a resolution that forgot them
// would.
type withoutPrompts struct{ resolver app.CallResolver }

func (w withoutPrompts) Snapshot(ctx context.Context) app.CallResolution {
	return promptless{w.resolver.Snapshot(ctx)}
}

type promptless struct{ app.CallResolution }

func (r promptless) Resolve(ctx context.Context, request app.CallResolveRequest) (*app.ResolvedCall, error) {
	res, err := r.CallResolution.Resolve(ctx, request)
	res.Prompts = nil
	return res, err
}

// A call is refused, before its first turn, when an input names a prompt
// its resolution did not give it, though resolution succeeded.
func TestAPromptNotResolvedWithTheCallRefusesIt(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompted(h, reviewPrompt)
	h.calls = app.NewCalls(
		withoutPrompts{app.NewResolver(h.defs, h.runtimes, h.validator, resolverCheckStub{})}, h.runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs},
		h.workspaces, h.changes, app.NewPreparer(h.changes, h.setup, h.clock), h.borrower(), app.NewVerifier(h.changes, h.copies, h.commands, h.clock), h.validator, h.recorder, h.runs,
		h.clock, h.timer, fixedIDs{}, "/state", h.hosted,
	)
	record := h.call(t, contract.CallRequest{})
	want := `input rules: prompt "review" was not resolved with the call`
	if class(record) != run.ClassRefused || message(record) != want {
		t.Fatalf("result %+v: %q, want %q", record.Result, message(record), want)
	}
	if len(h.runner.calls()) != 0 {
		t.Fatalf("turns %d after the refusal", len(h.runner.calls()))
	}
}

// check --tree's links: the process uses each prompt it names, found or
// not, and the prompt is used by the process.
func TestCheckLinksAProcessToItsPrompts(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	definitions := func(h *harness) map[contract.DefinitionRef]contract.Definition {
		got := map[contract.DefinitionRef]contract.Definition{}
		for _, d := range checkOf(t, h, false).Definitions {
			got[ref(d.Kind, d.Name)] = d
		}
		return got
	}
	h := newHarness()
	prompted(h, reviewPrompt)
	got := definitions(h)
	uses := []contract.DefinitionRef{ref("agents", "a"), ref("policies", "pol"), ref("prompts", "review"), ref("schemas", "s")}
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, uses) {
		t.Fatalf("p = %+v", p)
	}
	if review := got[ref("prompts", "review")]; !reflect.DeepEqual(review.UsedBy, []contract.DefinitionRef{ref("processes", "p")}) || review.Path != "mem/prompts/review" || review.Layer != "global" {
		t.Fatalf("review = %+v", review)
	}

	missing := newHarness()
	prompting(missing)
	got = definitions(missing)
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, uses) {
		t.Fatalf("p without the prompt = %+v", p)
	}
	if _, ok := got[ref("prompts", "review")]; ok {
		t.Fatal("a prompt that does not exist is listed")
	}
}

// process show lists the prompts the process names, and where each comes
// from among its sources; a missing one is shown with the refusal it
// causes.
func TestShowProcessShowsItsPrompts(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompted(h, reviewPrompt)
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{}))
	view, err := inspection.ShowProcess(context.Background(), "p", "")
	if err != nil || !reflect.DeepEqual(view.Prompts, []string{"review"}) || view.Refusal != "" {
		t.Fatalf("prompts %q, refusal %q, %v", view.Prompts, view.Refusal, err)
	}
	origin := contract.DefinitionOrigin{Kind: "prompts", Name: "review", Layer: "global", Path: "mem/prompts/review"}
	if !containsOrigin(view.Sources, origin) {
		t.Fatalf("sources = %+v", view.Sources)
	}
	if !reflect.DeepEqual(view.Inputs, []string{"candidate_revision <- git.revision", "diff <- git.diff", "rules <- prompt"}) {
		t.Fatalf("inputs = %q", view.Inputs)
	}

	delete(h.defs.docs[definition.KindPrompt], "review")
	view, err = inspection.ShowProcess(context.Background(), "p", "")
	if err != nil || !reflect.DeepEqual(view.Prompts, []string{"review"}) || view.Refusal != `input rules: prompt "review": not found` {
		t.Fatalf("missing: prompts %q, refusal %q, %v", view.Prompts, view.Refusal, err)
	}
}

// The snapshot covers prompts: the prompt a call is given is the one check
// saw, though it was edited between the check and the call.
func TestGatedCallIsGivenThePromptCheckSaw(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	prompted(h, reviewPrompt)
	gated := &app.Gated{
		Definitions: h.defs,
		Global:      h.defs,
		Build: func(src, _ app.GateDefinitions) contract.Client {
			return &afterCheck{
				Client: &app.Host{
					Checker: app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff", "param"}),
					Calls:   h.callsOn(src),
				},
				f: func() { h.defs.set(definition.KindPrompt, "review", "Edited after the check.\n") },
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
	if input := promptInput(record); input.Value != reviewPrompt || input.Identity != "sha256:"+sha(reviewPrompt) {
		t.Fatalf("input = %+v", input)
	}
	if sources := promptSources(record); len(sources) != 1 || sources[0].SHA256 != sha(reviewPrompt) {
		t.Fatalf("prompt sources = %+v", sources)
	}
}

// A snapshot keeps what the source answered for a prompt a process names
// and the settings do not list, so a view of the process says where it was
// expected; and it reads the source no more for it.
func TestSnapshotKeepsTheReadOfAMissingPrompt(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	prompting(h)
	missing := errors.New("not found (expected /repo/.agister/prompts/review.md or /home/prompts/review.md)")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/review": missing}}
	snap := app.Snapshot(ctx, live)
	reads := h.defs.readCount()
	if _, err := snap.Read(ctx, definition.KindPrompt, "review"); err != missing {
		t.Fatalf("read error = %v", err)
	}
	view, err := app.NewInspection(app.NewResolver(snap, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{})).ShowProcess(ctx, "p", "")
	if want := `input rules: prompt "review": ` + missing.Error(); err != nil || view.Refusal != want {
		t.Fatalf("refusal = %q, %v, want %q", view.Refusal, err, want)
	}
	if got := h.defs.readCount(); got != reads {
		t.Fatalf("reading the snapshot read the source %d more times", got-reads)
	}
}

// An optional prompt is optional (ADR-019).

// optionally gives p the optional input go, naming the prompt go_tests,
// and the settings no prompt.
func optionally(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] = promptingProcess("    go: {source: prompt, name: go_tests, optional: true}\n")
	h.defs.docs[definition.KindPrompt] = map[string]string{}
}

// Rules 2 and 3: a missing optional prompt is not a check problem; the
// call goes ahead without its input, which gives the agent no section,
// and the record lists it as absent, by input and name.
func TestAMissingOptionalPromptRunsTheCallWithoutItsInput(t *testing.T) {
	t.Parallel()
	h := newHarness()
	optionally(h)
	if report := checkOf(t, h, false); len(report.Problems) != 0 {
		t.Fatalf("problems = %q", messages(report.Problems))
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	if input := promptInput(record); input.Name != "" {
		t.Fatalf("input = %+v", input)
	}
	if sources := promptSources(record); len(sources) != 0 {
		t.Fatalf("prompt sources = %+v", sources)
	}
	if want := []run.AbsentPrompt{{Input: "go", Prompt: "go_tests"}}; !reflect.DeepEqual(record.AbsentPrompts, want) {
		t.Fatalf("absent prompts = %v, want %v", record.AbsentPrompts, want)
	}
	calls := h.runner.calls()
	if len(calls) != 1 || strings.Contains(calls[0].Prompt, "## go\n") || !strings.Contains(calls[0].Prompt, "## diff\n") {
		t.Fatalf("the agent was given: %+v", calls)
	}
}

// Rule 2: a present optional prompt is given, resolved and recorded
// exactly as a required one.
func TestAPresentOptionalPromptIsGivenAsARequiredOne(t *testing.T) {
	t.Parallel()
	given := func(process string) run.Record {
		h := newHarness()
		prompted(h, reviewPrompt)
		h.defs.docs[definition.KindProcess]["p"] = promptingProcess(process)
		record := h.call(t, contract.CallRequest{})
		if record.Result.Status != run.Completed {
			t.Fatalf("%s: result %+v: %s", process, record.Result, message(record))
		}
		if calls := h.runner.calls(); len(calls) != 1 || !strings.Contains(calls[0].Prompt, "## rules\n\n```\n"+reviewPrompt) {
			t.Fatalf("%s: the agent was given: %+v", process, calls)
		}
		return record
	}
	required := given("    rules: {source: prompt, name: review}\n")
	optional := given("    rules: {source: prompt, name: review, optional: true}\n")
	if !reflect.DeepEqual(promptInput(optional), promptInput(required)) || promptInput(optional).Value != reviewPrompt {
		t.Fatalf("input = %+v, as required %+v", promptInput(optional), promptInput(required))
	}
	if !reflect.DeepEqual(promptSources(optional), promptSources(required)) || len(promptSources(optional)) != 1 {
		t.Fatalf("prompt sources = %+v, as required %+v", promptSources(optional), promptSources(required))
	}
	if optional.AbsentPrompts != nil {
		t.Fatalf("absent prompts = %v", optional.AbsentPrompts)
	}
}

// A required input naming the prompt an optional one names makes it
// required: missing, it is a check problem and refuses the call.
func TestAMissingPromptARequiredInputAlsoNamesRefusesTheCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	optionally(h)
	h.defs.docs[definition.KindProcess]["p"] = promptingProcess("    go: {source: prompt, name: go_tests, optional: true}\n    rules: {source: prompt, name: go_tests}\n")
	if report := checkOf(t, h, false); !reflect.DeepEqual(messages(report.Problems), []string{`process p: input rules: prompt "go_tests" does not exist`}) {
		t.Fatalf("problems = %q", messages(report.Problems))
	}
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || message(record) != `input rules: prompt "go_tests": not found` || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}
}

// Rule 1: an optional prompt that exists but cannot be read is a broken
// document, as any other: a problem of its own, and the call is refused.
func TestABrokenOptionalPromptRefusesTheCall(t *testing.T) {
	t.Parallel()
	t.Run("not text", func(t *testing.T) {
		t.Parallel()
		h := newHarness()
		optionally(h)
		h.defs.docs[definition.KindPrompt]["go_tests"] = "\x00"
		if report := checkOf(t, h, false); !reflect.DeepEqual(messages(report.Problems), []string{"prompt go_tests: not a UTF-8 text file"}) {
			t.Fatalf("problems = %q", messages(report.Problems))
		}
		record := h.call(t, contract.CallRequest{})
		if class(record) != run.ClassRefused || !strings.Contains(message(record), "not a UTF-8 text file") || len(h.runner.calls()) != 0 || record.AbsentPrompts != nil {
			t.Fatalf("result %+v: %q, absent %v", record.Result, message(record), record.AbsentPrompts)
		}
	})
	t.Run("listed, unreadable", func(t *testing.T) {
		t.Parallel()
		h := newHarness()
		optionally(h)
		h.defs.docs[definition.KindPrompt]["go_tests"] = reviewPrompt
		unreadable := errors.New("cannot read prompt go_tests")
		h.calls = h.callsOn(failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/go_tests": unreadable}})
		record := h.call(t, contract.CallRequest{})
		if class(record) != run.ClassRefused || !strings.Contains(message(record), unreadable.Error()) || len(h.runner.calls()) != 0 || record.AbsentPrompts != nil {
			t.Fatalf("result %+v: %q, absent %v", record.Result, message(record), record.AbsentPrompts)
		}
	})
}

// Rule 5: an input that refers to an optional prompt's value is a check
// problem of the process.
func TestReferringToAnOptionalPromptIsAProblemOfTheProcess(t *testing.T) {
	t.Parallel()
	h := newHarness()
	optionally(h)
	h.defs.docs[definition.KindPrompt]["go_tests"] = reviewPrompt
	h.defs.docs[definition.KindProcess]["p"] = promptingProcess("    go: {source: prompt, name: go_tests, optional: true}\n    other: {source: git.diff, base: \"${value.go}\", head: \"${param.candidate}\"}\n")
	want := "input.values.other: refers to ${value.go}, an optional prompt, which may be missing"
	if problems := messages(checkOf(t, h, false).Problems); len(problems) != 1 || !strings.HasPrefix(problems[0], "process p: ") || !strings.Contains(problems[0], want) {
		t.Fatalf("problems = %q, want one of process p with %q", problems, want)
	}
}

// Rule 5 with a repeated name: of two inputs named go, the optional prompt
// may supply the text a later input refers to, whichever comes first. With
// one input of the name, required, check has nothing to say.
func TestReferringToARepeatedNameWithAnOptionalPromptIsAProblemOfTheProcess(t *testing.T) {
	t.Parallel()
	required := "    go: {source: prompt, name: review}\n"
	optional := "    go: {source: prompt, name: go_tests, optional: true}\n"
	refers := "    other: {source: git.diff, base: \"${value.go}\", head: \"${param.candidate}\"}\n"
	want := "input.values.other: refers to ${value.go}, an optional prompt, which may be missing"
	for name, values := range map[string]string{
		"required, then optional": required + optional + refers,
		"optional, then required": optional + required + refers,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			prompted(h, reviewPrompt)
			h.defs.docs[definition.KindProcess]["p"] = promptingProcess(values)
			if problems := messages(checkOf(t, h, false).Problems); len(problems) != 1 || !strings.HasPrefix(problems[0], "process p: ") || !strings.Contains(problems[0], want) {
				t.Fatalf("problems = %q, want one of process p with %q", problems, want)
			}
		})
	}
	h := newHarness()
	prompted(h, reviewPrompt)
	h.defs.docs[definition.KindProcess]["p"] = promptingProcess(required + refers)
	if problems := messages(checkOf(t, h, false).Problems); len(problems) != 0 {
		t.Fatalf("unique name: problems = %q", problems)
	}
}

// Rule 4: check --tree links the process to its optional prompt, found
// or not, as optional.
func TestCheckLinksAProcessToItsOptionalPrompt(t *testing.T) {
	t.Parallel()
	uses := func(h *harness) []contract.DefinitionRef {
		for _, d := range checkOf(t, h, false).Definitions {
			if d.Kind == "processes" && d.Name == "p" {
				return d.Uses
			}
		}
		return nil
	}
	want := contract.DefinitionRef{Kind: "prompts", Name: "go_tests", Optional: true}
	h := newHarness()
	optionally(h)
	if got := uses(h); !slices.Contains(got, want) {
		t.Fatalf("missing: p uses %+v", got)
	}
	h.defs.docs[definition.KindPrompt]["go_tests"] = reviewPrompt
	if got := uses(h); !slices.Contains(got, want) {
		t.Fatalf("found: p uses %+v", got)
	}
}

// Rule 4: process show shows the input as optional and whether its prompt
// was found; a missing one refuses nothing.
func TestShowProcessShowsAnOptionalPrompt(t *testing.T) {
	t.Parallel()
	h := newHarness()
	optionally(h)
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{}))
	view, err := inspection.ShowProcess(context.Background(), "p", "")
	if err != nil || view.Refusal != "" || !reflect.DeepEqual(view.Optional, []string{"go_tests"}) || !reflect.DeepEqual(view.Absent, []string{"go_tests"}) {
		t.Fatalf("missing: optional %q, absent %q, refusal %q, %v", view.Optional, view.Absent, view.Refusal, err)
	}
	if !slices.Contains(view.Inputs, "go <- prompt (optional)") {
		t.Fatalf("inputs = %q", view.Inputs)
	}

	h.defs.docs[definition.KindPrompt]["go_tests"] = reviewPrompt
	view, err = inspection.ShowProcess(context.Background(), "p", "")
	if err != nil || view.Refusal != "" || !reflect.DeepEqual(view.Optional, []string{"go_tests"}) || view.Absent != nil {
		t.Fatalf("found: optional %q, absent %q, refusal %q, %v", view.Optional, view.Absent, view.Refusal, err)
	}
	origin := contract.DefinitionOrigin{Kind: "prompts", Name: "go_tests", Layer: "global", Path: "mem/prompts/go_tests"}
	if !containsOrigin(view.Sources, origin) || !slices.Contains(view.Inputs, "go <- prompt (optional)") {
		t.Fatalf("sources %+v, inputs %q", view.Sources, view.Inputs)
	}
}

// D-11: absence belongs to the input, not to its name. Of two inputs
// named alike, the optional one whose prompt neither layer has is left
// out, and the required one whose prompt is present is given.
func TestAnAbsentOptionalInputDropsNoOtherOfItsName(t *testing.T) {
	t.Parallel()
	h := newHarness()
	prompted(h, reviewPrompt)
	h.defs.docs[definition.KindProcess]["p"] = promptingProcess("    rules: {source: prompt, name: go_tests, optional: true}\n    rules: {source: prompt, name: review}\n")
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	if calls := h.runner.calls(); len(calls) != 1 || !strings.Contains(calls[0].Prompt, "## rules\n\n```\n"+reviewPrompt) {
		t.Fatalf("the agent was given: %+v", calls)
	}
	if input := promptInput(record); input.Name != "rules" || input.Value != reviewPrompt {
		t.Fatalf("input = %+v", input)
	}
	if want := []run.AbsentPrompt{{Input: "rules", Prompt: "go_tests"}}; !reflect.DeepEqual(record.AbsentPrompts, want) {
		t.Fatalf("absent prompts = %v, want %v", record.AbsentPrompts, want)
	}
}

// D-11: only a read that finds an optional prompt in neither layer makes
// it absent. Prompts that cannot be listed, or a read that fails
// otherwise, are a check problem and refuse the call before its first
// turn, with nothing absent.
func TestAnOptionalPromptThatCannotBeListedOrReadRefusesTheCall(t *testing.T) {
	t.Parallel()
	failure := errors.New("permission denied")
	for name, live := range map[string]func(*definitionsSpy) failingSource{
		"listing": func(spy *definitionsSpy) failingSource {
			return failingSource{definitionsSpy: spy, listErr: map[definition.Kind]error{definition.KindPrompt: failure}}
		},
		"read": func(spy *definitionsSpy) failingSource {
			return failingSource{definitionsSpy: spy, readErr: map[string]error{"prompts/go_tests": failure}}
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			optionally(h)
			report, err := app.NewChecker(live(h.defs), h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(context.Background(), false)
			if problems := messages(report.Problems); err != nil || len(problems) != 1 || !strings.Contains(problems[0], failure.Error()) {
				t.Fatalf("problems %q, %v", problems, err)
			}
			h.calls = h.callsOn(live(h.defs))
			record := h.call(t, contract.CallRequest{})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), `input go: prompt "go_tests": `) || !strings.Contains(message(record), failure.Error()) {
				t.Fatalf("result %+v: %q", record.Result, message(record))
			}
			if record.AbsentPrompts != nil || len(h.runner.calls()) != 0 {
				t.Fatalf("absent %v, turns %d after the refusal", record.AbsentPrompts, len(h.runner.calls()))
			}
		})
	}
}
