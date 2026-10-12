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
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Prompts are settings (ADR-014), which a process names as its prompt and
// its guidance (ADR-028 rule 8).

const (
	reviewPrompt  = "Review the change against the rules.\n"
	stylePrompt   = "Name things for what they do.\n"
	testingPrompt = "Prove each rule with a test.\n"
)

// guided gives the harness's process p the guidance named, and the
// settings each guidance prompt given; p's prompt, inspect, stays.
func guided(h *harness, guidance []string, prompts map[string]string) {
	process := h.defs.docs[document.KindProcess]["p"]
	h.defs.docs[document.KindProcess]["p"] = strings.Replace(process, "prompt: inspect\n", "prompt: inspect\nguidance: ["+strings.Join(guidance, ", ")+"]\n", 1)
	for name, text := range prompts {
		h.defs.docs[document.KindPrompt][name] = text
	}
}

// promptInputs are the inputs a call recorded from its prompts, in order.
func promptInputs(record run.Record) []run.Input {
	var inputs []run.Input
	for _, input := range record.Inputs {
		if input.Source == definition.PromptSource {
			inputs = append(inputs, input)
		}
	}
	return inputs
}

func promptSources(record run.Record) []run.DefinitionSource {
	var sources []run.DefinitionSource
	for _, source := range record.Definitions {
		if source.Kind == string(document.KindPrompt) {
			sources = append(sources, source)
		}
	}
	return sources
}

func promptInput(name, text string) run.Input {
	return run.Input{Name: name, Source: definition.PromptSource, Identity: "sha256:" + sha(text), Value: text}
}

// Rule 8: the agent is given the process's input values in their order,
// then its prompt as the input prompt, then each guidance prompt, in the
// list's order, as the input guidance.<name>; each is the document's text,
// unchanged, recorded among the call's inputs and its definitions with its
// digest (ADR-014 rules 1 and 3).
func TestACallIsGivenItsValuesThenItsPromptThenItsGuidance(t *testing.T) {
	t.Parallel()
	h := newHarness()
	guided(h, []string{"testing", "style"}, map[string]string{"testing": testingPrompt, "style": stylePrompt})
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	var names []string
	for _, input := range record.Inputs {
		names = append(names, input.Name)
	}
	if want := []string{"candidate_revision", "diff", "prompt", "guidance.testing", "guidance.style"}; !reflect.DeepEqual(names, want) {
		t.Fatalf("inputs %q, want %q", names, want)
	}
	want := []run.Input{promptInput("prompt", inspectPrompt), promptInput("guidance.testing", testingPrompt), promptInput("guidance.style", stylePrompt)}
	if got := promptInputs(record); !reflect.DeepEqual(got, want) {
		t.Fatalf("prompt inputs = %+v, want %+v", got, want)
	}
	sources := []run.DefinitionSource{homeFile("prompts", "inspect", inspectPrompt), homeFile("prompts", "testing", testingPrompt), homeFile("prompts", "style", stylePrompt)}
	if got := promptSources(record); !reflect.DeepEqual(got, sources) {
		t.Fatalf("prompt sources = %+v, want %+v", got, sources)
	}
	calls := h.runner.calls()
	if len(calls) != 1 {
		t.Fatalf("turns = %d", len(calls))
	}
	sections := []string{"## diff\n", "## prompt\n\n```\n" + inspectPrompt, "## guidance.testing\n\n```\n" + testingPrompt, "## guidance.style\n\n```\n" + stylePrompt}
	at := 0
	for _, section := range sections {
		found := strings.Index(calls[0].Prompt[at:], section)
		if found < 0 {
			t.Fatalf("the agent was not given %q after the sections before it:\n%s", section, calls[0].Prompt)
		}
		at += found + len(section)
	}
}

// Rule 8: a process with no guidance, or guidance [], is given its prompt
// alone.
func TestAProcessWithNoGuidanceIsGivenItsPromptAlone(t *testing.T) {
	t.Parallel()
	for name, guidance := range map[string]func(*harness){
		"no guidance": func(*harness) {},
		"[]":          func(h *harness) { guided(h, nil, nil) },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			guidance(h)
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Completed {
				t.Fatalf("result %+v: %s", record.Result, message(record))
			}
			if got, want := promptInputs(record), []run.Input{promptInput("prompt", inspectPrompt)}; !reflect.DeepEqual(got, want) {
				t.Fatalf("prompt inputs = %+v, want %+v", got, want)
			}
		})
	}
}

// Rule 8, after ADR-014 rule 4: a prompt or guidance prompt no layer has
// is a problem of the process that names it; a call resolved without it
// is refused before the first turn, naming the field, the prompt and
// where it was expected.
func TestAPromptNoLayerHasIsAProblemOfTheProcessAndRefusesTheCall(t *testing.T) {
	t.Parallel()
	missing := errors.New("not found (expected /repo/.agister/prompts/x.md or /home/prompts/x.md)")
	for name, c := range map[string]struct {
		missing string
		problem string
		refusal string
	}{
		// The refusal starts at the workflow whose call it refuses.
		"the prompt":  {"inspect", `process p: prompt "inspect" does not exist`, `workflow p_a uses process p names prompt "inspect": ` + missing.Error()},
		"a guidance":  {"testing", `process p: guidance: prompt "testing" does not exist`, `workflow p_a uses process p names in its guidance prompt "testing": ` + missing.Error()},
		"the last of": {"style", `process p: guidance: prompt "style" does not exist`, `workflow p_a uses process p names in its guidance prompt "style": ` + missing.Error()},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			guided(h, []string{"testing", "style"}, map[string]string{"testing": testingPrompt, "style": stylePrompt})
			delete(h.defs.docs[document.KindPrompt], c.missing)
			if report := checkOf(t, h, false); !reflect.DeepEqual(messages(report.Problems), []string{c.problem}) {
				t.Fatalf("problems = %q, want %q", messages(report.Problems), c.problem)
			}

			live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/" + c.missing: missing}}
			h.calls = h.callsOn(live)
			record := h.call(t, contract.CallRequest{})
			if class(record) != run.ClassRefused || message(record) != c.refusal {
				t.Fatalf("result %+v: %q, want %q", record.Result, message(record), c.refusal)
			}
			if len(h.runner.calls()) != 0 {
				t.Fatalf("turns %d after the refusal", len(h.runner.calls()))
			}
		})
	}
}

// ADR-014 rule 1: a prompt that is not readable text is a problem of that
// document, not of the process naming it; a call of the process is
// refused.
func TestAnUnreadablePromptIsAProblemOfItsOwn(t *testing.T) {
	t.Parallel()
	h := newHarness()
	guided(h, []string{"review"}, map[string]string{"review": "\x00"})
	report := checkOf(t, h, false)
	if !reflect.DeepEqual(messages(report.Problems), []string{"prompt review: not a UTF-8 text file"}) || report.Checked["prompts"] != 2 {
		t.Fatalf("problems %q, checked %v", messages(report.Problems), report.Checked)
	}
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "not a UTF-8 text file") || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}
}

// ADR-014 rule 1: a prompt that is listed but cannot be read is a problem
// of that document: the process naming it is not told that it does not
// exist.
func TestAnUnreadableListedPromptIsAProblemNotAMissingOne(t *testing.T) {
	t.Parallel()
	h := newHarness()
	unreadable := errors.New("cannot read prompt inspect")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/inspect": unreadable}}
	report, err := app.NewChecker(live, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"prompt inspect: cannot read prompt inspect"}
	if !reflect.DeepEqual(messages(report.Problems), want) || len(report.Warnings) != 0 {
		t.Fatalf("problems %q, warnings %q, want problems %q and no warnings", messages(report.Problems), report.Warnings, want)
	}
}

// check --tree's links: the process uses its prompt and each guidance
// prompt, marked as guidance, found or not; and each prompt is used by the
// process.
func TestCheckLinksAProcessToItsPromptAndGuidance(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	definitions := func(h *harness) map[contract.DefinitionRef]contract.Definition {
		got := map[contract.DefinitionRef]contract.Definition{}
		for _, d := range checkOf(t, h, false).Definitions {
			got[ref(d.Kind, d.Name)] = d
		}
		return got
	}
	guidance := contract.DefinitionRef{Kind: "prompts", Name: "review", Guidance: true}
	// A process uses no agent: a workflow's node binds it to one.
	uses := []contract.DefinitionRef{ref("prompts", "inspect"), guidance, ref("schemas", "s")}

	h := newHarness()
	guided(h, []string{"review"}, map[string]string{"review": reviewPrompt})
	got := definitions(h)
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, uses) {
		t.Fatalf("p uses %+v, want %+v", p.Uses, uses)
	}
	for _, name := range []string{"inspect", "review"} {
		if prompt := got[ref("prompts", name)]; !reflect.DeepEqual(prompt.UsedBy, []contract.DefinitionRef{ref("processes", "p")}) || prompt.Path != "mem/prompts/"+name || prompt.Layer != "home" {
			t.Fatalf("%s = %+v", name, prompt)
		}
	}

	missing := newHarness()
	guided(missing, []string{"review"}, nil)
	got = definitions(missing)
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, uses) {
		t.Fatalf("p without its guidance uses %+v", p.Uses)
	}
	if _, ok := got[ref("prompts", "review")]; ok {
		t.Fatal("a prompt that does not exist is listed")
	}
}

// process show names the process's prompt and guidance, and where each
// comes from among its sources; a missing one is shown with the refusal
// it causes.
func TestShowProcessShowsItsPromptAndGuidance(t *testing.T) {
	t.Parallel()
	h := newHarness()
	guided(h, []string{"review"}, map[string]string{"review": reviewPrompt})
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{}))
	view, err := callShown(inspection, "p_a")
	if err != nil || view.Prompt != "inspect" || !reflect.DeepEqual(view.Guidance, []string{"review"}) || view.Refusal != "" {
		t.Fatalf("prompt %q, guidance %q, refusal %q, %v", view.Prompt, view.Guidance, view.Refusal, err)
	}
	for _, name := range []string{"inspect", "review"} {
		if origin := (contract.DefinitionOrigin{Kind: "prompts", Name: name, Layer: "home", Path: "mem/prompts/" + name}); !containsOrigin(view.Sources, origin) {
			t.Fatalf("sources %+v lack %+v", view.Sources, origin)
		}
	}
	if !reflect.DeepEqual(view.Inputs, []string{"candidate_revision <- git.revision", "diff <- git.diff"}) {
		t.Fatalf("inputs = %q", view.Inputs)
	}

	delete(h.defs.docs[document.KindPrompt], "review")
	view, err = callShown(inspection, "p_a")
	if want := `process p names in its guidance prompt "review": not found`; err != nil || view.Prompt != "inspect" || !reflect.DeepEqual(view.Guidance, []string{"review"}) || view.Refusal != want {
		t.Fatalf("missing: prompt %q, guidance %q, refusal %q, %v, want %q", view.Prompt, view.Guidance, view.Refusal, err, want)
	}
}

// The snapshot covers prompts: the prompt a call is given is the one check
// saw, though it was edited between the check and the call.
func TestGatedCallIsGivenThePromptCheckSaw(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	gated := &app.Gated{
		Definitions: h.defs,
		Global:      h.defs,
		Build: func(src, _ app.GateDefinitions) contract.Client {
			return &afterCheck{
				Client: &app.Host{
					Checker: app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff", "param"}),
					Calls:   h.callsOn(src),
				},
				f: func() { h.defs.set(document.KindPrompt, "inspect", "Edited after the check.\n") },
			}
		},
	}
	if _, err := gated.Submit(ctx, contract.CallRequest{Process: "p_a", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	record := h.recorder.wait(t)
	if class(record) != "" {
		t.Fatalf("call failed: %s", message(record))
	}
	if got, want := promptInputs(record), []run.Input{promptInput("prompt", inspectPrompt)}; !reflect.DeepEqual(got, want) {
		t.Fatalf("prompt inputs = %+v, want %+v", got, want)
	}
	if sources := promptSources(record); len(sources) != 1 || digestRecorded(sources[0]) != sha(inspectPrompt) {
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
	guided(h, []string{"review"}, nil)
	missing := errors.New("not found (expected /repo/.agister/prompts/review.md or /home/prompts/review.md)")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"prompts/review": missing}}
	snap := app.Snapshot(ctx, live)
	reads := h.defs.readCount()
	if _, err := snap.Read(ctx, document.KindPrompt, "review"); err != missing {
		t.Fatalf("read error = %v", err)
	}
	view, err := callShown(app.NewInspection(app.NewResolver(snap, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{})), "p_a")
	if want := `process p names in its guidance prompt "review": ` + missing.Error(); err != nil || view.Refusal != want {
		t.Fatalf("refusal = %q, %v, want %q", view.Refusal, err, want)
	}
	if got := h.defs.readCount(); got != reads {
		t.Fatalf("reading the snapshot read the source %d more times", got-reads)
	}
}

// foldedSource is the spy's settings, home's, under a repository layer
// whose layer.yaml lists a folder that holds folded, prompt texts by name:
// Read finds one there before home's, as a call reads it, and ReadListed
// never does, as the settings list it (ADR-028 rule 9).
type foldedSource struct {
	*definitionsSpy
	folded map[string]string
}

func (s foldedSource) Read(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	text, ok := s.folded[name]
	if kind != document.KindPrompt || !ok {
		return s.definitionsSpy.Read(ctx, kind, name)
	}
	s.record(string(kind) + "/" + name)
	path := "mem/lib/" + name + ".md"
	return document.Document{
		Source: document.Source{
			Kind: kind, Name: name, Layer: document.LayerRepository, Path: path, SHA256: sha(text),
			Layers: []document.LayerFile{{Layer: document.LayerRepository, Path: path, SHA256: sha(text)}},
		},
		Bytes: []byte(text),
	}, nil
}

func (s foldedSource) ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	s.record("inventory/" + string(kind) + "/" + name)
	return s.definitionsSpy.ReadListed(ctx, kind, name)
}

// A named prompt is frozen only as the call resolves it. Reading its
// inventory version as well would touch a shadowed file, which could be
// a FIFO. The spy tells those reads apart, without kernel waits.
func TestANamedPromptIsNotAlsoReadFromTheInventory(t *testing.T) {
	t.Parallel()
	for name, frozen := range map[string]bool{"the settings": false, "their snapshot": true} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			h := newHarness()
			h.defs.docs[document.KindPrompt]["inspect"] = "\x00\xff"
			h.defs.docs[document.KindPrompt]["notes"] = "Home's notes.\n"
			folded := foldedSource{definitionsSpy: h.defs, folded: map[string]string{"inspect": inspectPrompt}}
			var src app.CheckDefinitions = folded
			if frozen {
				src = app.Snapshot(ctx, folded)
			}
			report, err := app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(ctx, false)
			if err != nil || len(report.Problems) != 0 {
				t.Fatalf("check = %+v, %v", report, err)
			}
			doc, err := src.Read(ctx, document.KindPrompt, "inspect")
			if err != nil || string(doc.Bytes) != inspectPrompt || doc.Source.Path != "mem/lib/inspect.md" || doc.Source.SHA256 != sha(inspectPrompt) {
				t.Fatalf("inspect = %+v %q, %v", doc.Source, doc.Bytes, err)
			}
			h.defs.mu.Lock()
			reads := append([]string(nil), h.defs.reads...)
			h.defs.mu.Unlock()
			if slices.Contains(reads, "inventory/prompts/inspect") || !slices.Contains(reads, "inventory/prompts/notes") {
				t.Fatalf("inventory reads = %v; want notes alone", reads)
			}
		})
	}
}

// A process that cannot be parsed does not select library prompts for
// inventory checks, on live settings or on their snapshot.
func TestAnInvalidProcessDoesNotSelectLibraryPrompts(t *testing.T) {
	t.Parallel()
	for name, frozen := range map[string]bool{"the settings": false, "their snapshot": true} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			h := newHarness()
			h.defs.docs[document.KindProcess]["p"] += "unexpected: true\n"
			folded := foldedSource{definitionsSpy: h.defs, folded: map[string]string{"inspect": "\x00\xff"}}
			var src app.CheckDefinitions = folded
			if frozen {
				src = app.Snapshot(ctx, folded)
			}
			report, err := app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(ctx, false)
			// Workflow p_a binds the process, which it does not find.
			if want := []string{"process p: unexpected: unknown field", `workflow p_a: call node p: process "p" does not exist`}; err != nil || !reflect.DeepEqual(messages(report.Problems), want) {
				t.Fatalf("problems = %q, %v; want %q", messages(report.Problems), err, want)
			}
			for _, d := range report.Definitions {
				if d.Kind == "prompts" && d.Name == "inspect" {
					if d.Layer != "home" || d.Path != "mem/prompts/inspect" || d.Invalid {
						t.Fatalf("inventory inspect = %+v", d)
					}
					return
				}
			}
			t.Fatal("inventory inspect is missing")
		})
	}
}

// ADR-028 rule 9: a folder a layer.yaml lists is read for a name a process
// gives, and is not otherwise settings. A file there named as a prompt no
// process names, which would fail as a prompt, is neither checked nor
// shown: check takes home's prompt of that name, and passes. Once a
// process names it, check reads it as a call does, from the folder before
// home's, and reports it. Checked so on the settings and on their
// snapshot alike.
func TestAListedFolderIsReadOnlyForTheNamesAProcessGives(t *testing.T) {
	t.Parallel()
	const notes = "Home's notes.\n"
	for name, frozen := range map[string]bool{"the settings": false, "their snapshot": true} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			check := func(h *harness) (contract.CheckReport, contract.Definition) {
				t.Helper()
				folded := foldedSource{definitionsSpy: h.defs, folded: map[string]string{"notes": "\x00\xff"}}
				var src app.CheckDefinitions = folded
				if frozen {
					src = app.Snapshot(ctx, folded)
				}
				report, err := app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(ctx, false)
				if err != nil {
					t.Fatal(err)
				}
				for _, d := range report.Definitions {
					if d.Kind == string(document.KindPrompt) && d.Name == "notes" {
						return report, d
					}
				}
				t.Fatalf("notes is not listed: %+v", report.Definitions)
				return report, contract.Definition{}
			}

			h := newHarness()
			h.defs.docs[document.KindPrompt]["notes"] = notes
			report, listed := check(h)
			if len(report.Problems) != 0 || report.Checked["prompts"] != 2 {
				t.Fatalf("unnamed: problems %q, checked %v", messages(report.Problems), report.Checked)
			}
			want := contract.Definition{Kind: "prompts", Name: "notes", Layer: "home", Path: "mem/prompts/notes", Layers: []contract.DefinitionLayer{{Layer: "home", Path: "mem/prompts/notes"}}}
			if !reflect.DeepEqual(listed, want) {
				t.Fatalf("unnamed: notes = %+v, want %+v", listed, want)
			}

			guided(h, []string{"notes"}, nil)
			report, named := check(h)
			if !reflect.DeepEqual(messages(report.Problems), []string{"prompt notes: not a UTF-8 text file"}) {
				t.Fatalf("named: problems %q", messages(report.Problems))
			}
			if named.Layer != "repository" || named.Path != "mem/lib/notes.md" || !named.Invalid || !reflect.DeepEqual(named.UsedBy, []contract.DefinitionRef{{Kind: "processes", Name: "p"}}) {
				t.Fatalf("named: notes = %+v", named)
			}
		})
	}
}
