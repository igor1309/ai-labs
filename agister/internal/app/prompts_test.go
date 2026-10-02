package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Prompts are settings (ADR-013).

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
	h := newHarness()
	prompting(h)
	if report := checkOf(t, h, false); !reflect.DeepEqual(report.Problems, []string{`process p: input rules: prompt "review" does not exist`}) {
		t.Fatalf("problems = %q", report.Problems)
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
	h := newHarness()
	prompted(h, "\x00")
	report := checkOf(t, h, false)
	if !reflect.DeepEqual(report.Problems, []string{"prompt review: not a UTF-8 text file"}) || report.Checked["prompts"] != 1 {
		t.Fatalf("problems %q, checked %v", report.Problems, report.Checked)
	}
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "not a UTF-8 text file") || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}
}

// Rule 1: a prompt that is listed but cannot be read is a problem of that
// document: the process naming it is not told that it does not exist.
func TestAnUnreadableListedPromptIsAProblemNotAMissingOne(t *testing.T) {
	h := newHarness()
	prompted(h, reviewPrompt)
	unreadable := errors.New("cannot read prompt review")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/review": unreadable}}
	report, err := app.NewChecker(live, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"prompt review: cannot read prompt review"}
	if !reflect.DeepEqual(report.Problems, want) || len(report.Warnings) != 0 {
		t.Fatalf("problems %q, warnings %q, want problems %q and no warnings", report.Problems, report.Warnings, want)
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
	h := newHarness()
	prompted(h, reviewPrompt)
	h.calls = app.NewCalls(
		withoutPrompts{app.NewResolver(h.defs, h.runtimes, h.validator)}, h.runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs},
		h.workspaces, h.changes, app.NewPreparer(h.changes, h.setup, h.clock), app.NewVerifier(h.changes, h.copies, h.commands, h.clock), h.validator, h.recorder, h.runs,
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
	h := newHarness()
	prompted(h, reviewPrompt)
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator))
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
	view, err := app.NewInspection(app.NewResolver(snap, struct{ app.ResolverIdentities }{h.runtimes}, h.validator)).ShowProcess(ctx, "p", "")
	if want := `input rules: prompt "review": ` + missing.Error(); err != nil || view.Refusal != want {
		t.Fatalf("refusal = %q, %v, want %q", view.Refusal, err, want)
	}
	if got := h.defs.readCount(); got != reads {
		t.Fatalf("reading the snapshot read the source %d more times", got-reads)
	}
}
