package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A file input may name the forms its text must have (ADR-026 rule 8): a
// call whose text has none of them is refused before it starts, naming the
// input, each form and each wrong part.

const goalForm = `schema: agister.brief/v1alpha1
name: goal
parts:
  - {heading: "## Intent", required: true}
  - {heading: "## Done when", required: true}
  - {heading: "## Out of scope", required: true}
  - {heading: "## Open", required: true, reads: None.}
template: |
  ## Intent

  ## Done when

  ## Out of scope

  ## Open

  None.
`

const stepForm = `schema: agister.brief/v1alpha1
name: step
parts:
  - {heading: "## Goal", required: true, reference: file}
  - {heading: "## Covers", required: true}
  - {heading: "## Open", required: true, reads: None.}
template: |
  ## Goal

  ## Covers

  ## Open

  None.
`

// goalText has the form goal; stepText has the form step, and refers to
// the goal at goals/g.md.
const (
	goalText = "## Intent\n\nReport a failed write.\n\n## Done when\n\n1. The caller gets the error.\n\n## Out of scope\n\nNone.\n\n## Open\n\nNone.\n"
	stepText = "## Goal\n\n`goals/g.md`\n\n## Covers\n\n- 1\n\n## Open\n\nNone.\n"
)

// briefed is a harness whose process p also takes a brief from brief.md,
// which reads as text, with the value spec given after its path.
func briefed(text, spec string) *harness {
	h := newHarness()
	h.defs.docs[document.KindBrief] = map[string]string{"goal": goalForm, "step": stepForm}
	h.defs.docs[document.KindProcess]["p"] = strings.Replace(h.defs.docs[document.KindProcess]["p"],
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n",
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n"+
			"    brief: {source: file, path: brief.md"+spec+"}\n", 1)
	base := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if spec.Source == "file" {
			return app.Resolved{Value: text, Identity: "sha256:" + sha(text)}, nil
		}
		return base(spec)
	}
	return h
}

// A text that has either of its forms runs, and the forms are recorded
// among the call's sources. A step's goal is resolved relative to the
// caller's directory.
func TestATextWithOneOfItsFormsRuns(t *testing.T) {
	t.Parallel()
	for name, text := range map[string]string{"goal": goalText, "step": stepText} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := briefed(text, ", form: [goal, step]")
			h.references.files = map[string]bool{"/repo/goals/g.md": true}
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Completed {
				t.Fatalf("result = %+v", record.Result.Error)
			}
			var forms []string
			for _, source := range record.Definitions {
				if source.Kind == string(document.KindBrief) {
					forms = append(forms, source.Name)
				}
			}
			if strings.Join(forms, ",") != "goal,step" {
				t.Fatalf("definitions = %+v", record.Definitions)
			}
			if want := map[string]string{"goal": "", "step": "/repo/goals/g.md"}[name]; strings.Join(h.references.asked, ",") != want {
				t.Fatalf("asked = %q, want %q", h.references.asked, want)
			}
		})
	}
	// An absolute path is asked as it is.
	h := briefed(strings.Replace(stepText, "goals/g.md", "/elsewhere/g.md", 1), ", form: [step]")
	h.references.files = map[string]bool{"/elsewhere/g.md": true}
	if record := h.call(t, contract.CallRequest{Cwd: "/repo/sub"}); record.Result.Status != run.Completed {
		t.Fatalf("absolute: %+v", record.Result.Error)
	}
}

// A call whose text has none of its forms is refused before any effect,
// naming the input, each form and each wrong part.
func TestATextWithoutItsFormIsRefused(t *testing.T) {
	t.Parallel()
	cases := map[string]struct {
		text, spec, reason string
		arrange            func(*harness)
	}{
		"none of two forms": {"Just do it.\n", ", form: [goal, step]",
			`input brief: has none of its forms: ` +
				`form goal: part "## Intent" is missing, part "## Done when" is missing, part "## Out of scope" is missing, part "## Open" is missing; ` +
				`form step: part "## Goal" is missing, part "## Covers" is missing, part "## Open" is missing`, nil},
		"Open not None.": {strings.Replace(goalText, "## Open\n\nNone.", "## Open\n\nShould it retry?", 1), ", form: [goal]",
			`input brief: does not have its form goal: part "## Open" must read "None."`, nil},
		"an empty part": {strings.Replace(goalText, "Report a failed write.", "", 1), ", form: [goal]",
			`input brief: does not have its form goal: part "## Intent" is empty`, nil},
		"a goal that does not exist": {stepText, ", form: [step]",
			`input brief: does not have its form step: part "## Goal": file goals/g.md does not exist`, nil},
		"a goal that cannot be looked up": {stepText, ", form: [step]",
			`input brief: does not have its form step: part "## Goal": file goals/g.md: permission denied`,
			func(h *harness) { h.references.err = errors.New("permission denied") }},
		"a form the settings lack": {goalText, ", form: [goal, plan]", `process p names brief "plan": not found`, nil},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := briefed(c.text, c.spec)
			if c.arrange != nil {
				c.arrange(h)
			}
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Failed || class(record) != run.ClassRefused || !strings.Contains(message(record), c.reason) {
				t.Fatalf("result %+v\nwant refused: %s", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 {
				t.Fatal("the call went on after the refusal")
			}
			if kinds := h.recorder.kinds(); !contains(kinds, "REFUSED") || kinds[len(kinds)-1] != "CALL_FINISHED" {
				t.Fatalf("events = %v", kinds)
			}
		})
	}
}

// A text refused for its form is the refusal's evidence (ADR-026 rule 6):
// the run keeps its bytes as an artifact, with their digest, and no
// runtime starts.
func TestARefusedTextIsKeptAsItsRunsEvidence(t *testing.T) {
	t.Parallel()
	digest := "sha256:" + sha(longText)
	want := run.Artifact{Name: "input-brief.txt", Path: "artifacts/input-brief.txt", Digest: digest, Bytes: int64(len(longText))}
	h := briefed(longText, ", form: [goal]")
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), `input brief: does not have its form goal`) {
		t.Fatalf("result = %+v", record.Result.Error)
	}
	if len(h.runner.calls()) != 0 {
		t.Fatal("the call went on after the refusal")
	}
	if brief := inputOf(t, record, "brief"); brief.Value != nil || brief.Identity != digest || brief.Artifact == nil || *brief.Artifact != want {
		t.Fatalf("brief = %+v, artifact %+v", brief, brief.Artifact)
	}
	if stored := string(h.recorder.artifacts["input-brief.txt"]); stored != longText {
		t.Fatalf("brief stored as %q", stored)
	}
}

// A workflow's goal refused for its form is the workflow's evidence: its
// run keeps the bytes as an artifact, with their digest, and no node
// starts.
func TestAWorkflowsRefusedGoalIsKeptAsItsEvidence(t *testing.T) {
	t.Parallel()
	digest := "sha256:" + sha(longText)
	want := run.Artifact{Name: "input-goal.txt", Path: "artifacts/input-goal.txt", Digest: digest, Bytes: int64(len(longText))}
	h := formedFlow(longText)
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	if class(record) != run.ClassRefused || !strings.Contains(message(record), `input goal: does not have its form goal`) {
		t.Fatalf("result = %+v", record.Result)
	}
	if len(h.store.ids()) != 1 || len(h.runner.turns("Work as first.")) != 0 || len(h.runner.turns("Work as second.")) != 0 {
		t.Fatalf("a node started: runs %v", h.store.ids())
	}
	if goal := inputOf(t, record, "goal"); goal.Value != nil || goal.Identity != digest || goal.Artifact == nil || *goal.Artifact != want {
		t.Fatalf("goal = %+v, artifact %+v", goal, goal.Artifact)
	}
	if stored := string(h.store.handle(t, id).artifacts["input-goal.txt"]); stored != longText {
		t.Fatalf("goal stored as %q", stored)
	}
}

// formStandIn is a CallForm that reports what it is given to report: it
// keeps the texts it is asked to check, asks resolve for each of its
// paths, and adds each refusal resolve gives.
type formStandIn struct {
	mu    sync.Mutex
	paths []string
	wrong []string
	texts []string
}

func (f *formStandIn) check(text string, resolve func(path string) error) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.texts = append(f.texts, text)
	wrong := append([]string(nil), f.wrong...)
	for _, path := range f.paths {
		if err := resolve(path); err != nil {
			wrong = append(wrong, err.Error())
		}
	}
	return wrong
}

func (f *formStandIn) checked() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.texts...)
}

// standInForms is a CallResolver that resolves through the one it wraps,
// then gives the call the form checks it holds in place of those resolved.
type standInForms struct {
	resolver app.CallResolver
	forms    map[string]app.CallForm
}

func (s standInForms) Snapshot(ctx context.Context) app.CallResolution {
	return standInResolution{s.resolver.Snapshot(ctx), s.forms}
}

type standInResolution struct {
	app.CallResolution
	forms map[string]app.CallForm
}

func (r standInResolution) Resolve(ctx context.Context, request app.CallResolveRequest) (*app.ResolvedCall, error) {
	res, err := r.CallResolution.Resolve(ctx, request)
	res.Forms = r.forms
	return res, err
}

// A call checks its input's text with the form checks its resolution
// gives, in the order the input names them: the first the text passes
// lets it run; none refuses it, with what each check reports. A check
// resolves a path relative to the caller's directory.
func TestACallChecksItsTextWithTheFormChecksItIsGiven(t *testing.T) {
	t.Parallel()
	const text = "Any text: the checks decide.\n"
	cases := map[string]struct {
		step   []string // what the step check reports
		reason string   // empty: the call runs
	}{
		"the second form passes": {nil, ""},
		"no form passes": {[]string{"no step"},
			`input brief: has none of its forms: form goal: no goal, file goals/g.md does not exist; form step: no step`},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := briefed(text, ", form: [goal, step]")
			goal := &formStandIn{wrong: []string{"no goal"}, paths: []string{"goals/g.md"}}
			step := &formStandIn{wrong: c.step}
			resolver := standInForms{app.NewResolver(h.defs, h.runtimes, h.validator, resolverCheckStub{}), map[string]app.CallForm{"goal": goal.check, "step": step.check}}
			h.calls = app.NewCalls(
				resolver, h.runtimes,
				map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs, "file": h.inputs}, h.copies, h.references,
				h.workspaces, h.changes, h.holder(), app.NewVerifier(h.changes, h.commands, h.clock), app.NewRecoverer(h.clock), h.validator, h.recorder, h.runs,
				h.clock, h.timer, fixedIDs{}, "/state", h.hosted,
			)
			record := h.call(t, contract.CallRequest{})
			if !reflect.DeepEqual(goal.checked(), []string{text}) || !reflect.DeepEqual(step.checked(), []string{text}) {
				t.Fatalf("goal checked %q, step checked %q", goal.checked(), step.checked())
			}
			if !reflect.DeepEqual(h.references.asked, []string{"/repo/goals/g.md"}) {
				t.Fatalf("asked = %q", h.references.asked)
			}
			if c.reason == "" {
				if record.Result.Status != run.Completed {
					t.Fatalf("result = %+v", record.Result.Error)
				}
				return
			}
			if class(record) != run.ClassRefused || message(record) != c.reason || len(h.runner.calls()) != 0 {
				t.Fatalf("result %+v, runner calls %d\nwant refused: %s", record.Result.Error, len(h.runner.calls()), c.reason)
			}
		})
	}
}

// A form the input names that its resolution does not give is a refusal of
// the call, naming the input and the form, not a fault of Agister's; no
// runtime starts.
func TestAFormTheResolutionLacksRefusesTheCall(t *testing.T) {
	t.Parallel()
	h := briefed(goalText, ", form: [goal, step]")
	step := &formStandIn{wrong: []string{"no step"}}
	resolver := standInForms{app.NewResolver(h.defs, h.runtimes, h.validator, resolverCheckStub{}), map[string]app.CallForm{"step": step.check}}
	h.calls = app.NewCalls(
		resolver, h.runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs, "file": h.inputs}, h.copies, h.references,
		h.workspaces, h.changes, h.holder(), app.NewVerifier(h.changes, h.commands, h.clock), app.NewRecoverer(h.clock), h.validator, h.recorder, h.runs,
		h.clock, h.timer, fixedIDs{}, "/state", h.hosted,
	)
	record := h.call(t, contract.CallRequest{})
	if want := `input brief: brief "goal" was not resolved with the call`; class(record) != run.ClassRefused || message(record) != want {
		t.Fatalf("result %+v\nwant refused: %s", record.Result.Error, want)
	}
	if len(h.runner.calls()) != 0 || step.checked() != nil {
		t.Fatalf("runner calls %d, step checked %q", len(h.runner.calls()), step.checked())
	}
}

// A value that names no form is not checked: its text may have any shape,
// and nothing it refers to is looked up.
func TestAValueWithoutFormIsUnchecked(t *testing.T) {
	t.Parallel()
	h := briefed("Just do it, see `missing.md`.\n", "")
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || h.references.asked != nil {
		t.Fatalf("result = %+v, asked %q", record.Result.Error, h.references.asked)
	}
	for _, source := range record.Definitions {
		if source.Kind == string(document.KindBrief) {
			t.Fatalf("a form was read: %+v", record.Definitions)
		}
	}
}

// formedFlow is a flow harness whose workflow w takes its goal from
// goal.md, which reads as goal, with the form goal; both nodes take it.
func formedFlow(goal string) *flowHarness {
	h := newFlowHarness()
	takesGoal := func(doc string) string {
		return strings.Replace(strings.Replace(doc,
			"    candidate: {default: HEAD}\n", "    candidate: {default: HEAD}\n    goal: {}\n", 1),
			"  values:\n", "  values:\n    goal: {source: param, name: goal}\n", 1)
	}
	h.defs.docs[document.KindProcess]["first"] = takesGoal(nodeProcess("first", "Work as first."))
	h.defs.docs[document.KindProcess]["second"] = takesGoal(nodeProcess("second", "Work as second."))
	h.defs.docs[document.KindBrief] = map[string]string{"goal": goalForm}
	h.defs.docs[document.KindWorkflow]["w"] = strings.Replace(workflowDoc, "  values:\n", "  values:\n    goal: {source: file, path: goal.md, form: [goal]}\n", 1)
	base := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if spec.Source == "file" && spec.Args["path"] == "goal.md" {
			return app.Resolved{Value: goal, Identity: "sha256:" + sha(goal)}, nil
		}
		return base(spec)
	}
	return h
}

// A workflow's goal that lacks its form refuses the workflow before any
// node starts; one that has it runs, with the form among the workflow's
// sources.
func TestAWorkflowsGoalIsCheckedBeforeItsNodesStart(t *testing.T) {
	t.Parallel()
	h := formedFlow("Goal: report a failed write.\n")
	record := h.store.wait(t, h.submit(t, contract.CallRequest{}))
	want := `input goal: does not have its form goal: part "## Intent" is missing`
	if class(record) != run.ClassRefused || !strings.Contains(message(record), want) || len(h.store.ids()) != 1 {
		t.Fatalf("result %+v, runs %v", record.Result, h.store.ids())
	}

	h = formedFlow(goalText)
	record = h.store.wait(t, h.submit(t, contract.CallRequest{}))
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	if len(record.Definitions) != 2 || record.Definitions[1].Kind != "briefs" || record.Definitions[1].Name != "goal" || digestRecorded(record.Definitions[1]) != sha(goalForm) {
		t.Fatalf("definitions = %+v", record.Definitions)
	}
}

// Workflow show names the forms a workflow's input takes, and the form
// among the workflow's sources, with the layer and path a caller copies
// the template from.
func TestShowWorkflowShowsItsForms(t *testing.T) {
	t.Parallel()
	h := formedFlow(goalText)
	inspection := app.NewInspection(app.NewResolver(h.defs, nodeRuntimes{runner: h.runner}, okValidator{}, resolverCheckStub{}))
	view, err := inspection.ShowWorkflow(context.Background(), "w")
	if err != nil || view.Refusal != "" || !contains(view.Inputs, "goal <- file (form goal)") || !contains(view.Inputs, "base <- git.revision") {
		t.Fatalf("inputs %q, refusal %q, %v", view.Inputs, view.Refusal, err)
	}
	if origin := (contract.DefinitionOrigin{Kind: "briefs", Name: "goal", Layer: "home", Path: "mem/briefs/goal"}); !containsOrigin(view.Sources, origin) {
		t.Fatalf("sources lack goal: %+v", view.Sources)
	}
}

// briefCheck is the check of h's settings, with the file and param
// sources known.
func briefCheck(t *testing.T, h *harness) contract.CheckReport {
	t.Helper()
	report, err := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff", "file", "param"}).Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	return report
}

// Check reads each brief form as a document of its own, links a process
// and a workflow to the forms their inputs name, and reports a form the
// settings lack as a problem of what names it and a broken one as a
// problem of its own.
func TestCheckReadsBriefsAndLinksWhatNamesThem(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	h := briefed(goalText, ", form: [goal, step]")
	// And the workflow w, whose goal takes the form goal.
	flow := formedFlow(goalText).defs.docs
	for name, doc := range flow[document.KindProcess] {
		h.defs.docs[document.KindProcess][name] = doc
	}
	h.defs.docs[document.KindWorkflow] = map[string]string{"w": flow[document.KindWorkflow]["w"]}
	report := briefCheck(t, h)
	if len(report.Problems) != 0 || report.Checked["briefs"] != 2 || report.Checked["workflows"] != 1 {
		t.Fatalf("problems %q, checked %v", messages(report.Problems), report.Checked)
	}
	got := map[contract.DefinitionRef]contract.Definition{}
	for _, d := range report.Definitions {
		got[ref(d.Kind, d.Name)] = d
	}
	// A process uses no agent: a workflow's node binds it to one.
	processUses := []contract.DefinitionRef{ref("prompts", "inspect"), ref("schemas", "s"), ref("briefs", "goal"), ref("briefs", "step")}
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, processUses) {
		t.Fatalf("p = %+v", p)
	}
	// The agent its nodes bind their processes to is the workflow's to name.
	workflowUses := []contract.DefinitionRef{ref("processes", "first"), ref("agents", "a"), ref("processes", "second"), ref("processes", "joiner"), ref("briefs", "goal")}
	if w := got[ref("workflows", "w")]; !reflect.DeepEqual(w.Uses, workflowUses) {
		t.Fatalf("w = %+v", w)
	}
	if goal := got[ref("briefs", "goal")]; !reflect.DeepEqual(goal.UsedBy, []contract.DefinitionRef{ref("processes", "p"), ref("workflows", "w")}) {
		t.Fatalf("goal = %+v", goal)
	}
	if step := got[ref("briefs", "step")]; !reflect.DeepEqual(step.UsedBy, []contract.DefinitionRef{ref("processes", "p")}) {
		t.Fatalf("step = %+v", step)
	}

	h = briefed(goalText, ", form: [goal, plan]")
	h.defs.docs[document.KindBrief]["step"] = stepForm + "extra: 1\n"
	want := []string{"brief step: extra: unknown field", `process p: input brief: brief "plan" does not exist`}
	if got := messages(briefCheck(t, h).Problems); !reflect.DeepEqual(got, want) {
		t.Fatalf("problems %q, want %q", got, want)
	}
}

// Show names the forms an input takes and the forms among the sources a
// call reads, with the layer and path a caller copies the template from.
func TestShowProcessShowsItsForms(t *testing.T) {
	t.Parallel()
	h := briefed(goalText, ", form: [goal, step]")
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{}))
	view, err := callShown(inspection, "p_a")
	if err != nil || view.Refusal != "" || !contains(view.Inputs, "brief <- file (form goal, step)") || !contains(view.Inputs, "diff <- git.diff") {
		t.Fatalf("inputs %q, refusal %q, %v", view.Inputs, view.Refusal, err)
	}
	for _, name := range []string{"goal", "step"} {
		if origin := (contract.DefinitionOrigin{Kind: "briefs", Name: name, Layer: "home", Path: "mem/briefs/" + name}); !containsOrigin(view.Sources, origin) {
			t.Fatalf("sources lack %s: %+v", name, view.Sources)
		}
	}
}
