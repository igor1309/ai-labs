package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestCheckReportsEveryProblemAcrossDocuments(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindAgent]["broken"] = "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\ncolour = \"red\"\n"
	h.defs.docs[definition.KindProcess]["q"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: q", 1) + "timeout: 2h\n"
	h.validator.compileErr = errors.New("not a schema")
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})

	report, err := checker.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(report.Problems, "\n")
	for _, want := range []string{
		"agent broken: colour: unknown field",
		"agent broken: runtime: is required",
		"schema s: not a schema",
		`process p: output schema "s" does not exist`,
		"process q: timeout: 2h0m0s widens the policy's 20m0s",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in:\n%s", want, joined)
		}
	}
	if report.Checked["processes"] != 2 || report.Checked["agents"] != 2 {
		t.Fatalf("checked = %v", report.Checked)
	}
	if len(h.runner.calls()) != 0 || len(h.runtimes.identified) != 0 {
		t.Fatal("check without probe must not touch runtimes")
	}
}

// The report lists every definition read and what each uses, including
// references to definitions that do not exist and what nothing uses.
func TestCheckReportsWhatDefinesWhat(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindPolicy]["spare"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "name: pol", "name: spare", 1)
	h.defs.docs[definition.KindProcess]["q"] = strings.Replace(strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: q", 1), "agent:a", "agent:ghost", 1)
	h.defs.docs[definition.KindAgent]["broken"] = "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\ncolour = \"red\"\n"
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	report, err := checker.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	got := map[contract.DefinitionRef]contract.Definition{}
	var order []string
	for _, d := range report.Definitions {
		got[ref(d.Kind, d.Name)] = d
		order = append(order, d.Kind+"/"+d.Name)
	}
	if strings.Join(order, " ") != "service/service runtimes/rt agents/a agents/broken policies/pol policies/spare processes/p processes/q schemas/s" {
		t.Fatalf("order = %v", order)
	}
	p, a := got[ref("processes", "p")], got[ref("agents", "a")]
	if !reflect.DeepEqual(p.Uses, []contract.DefinitionRef{ref("agents", "a"), ref("policies", "pol"), ref("schemas", "s")}) || p.Layer != "global" || p.Path != "mem/processes/p" {
		t.Fatalf("p = %+v", p)
	}
	if !reflect.DeepEqual(a.Uses, []contract.DefinitionRef{ref("runtimes", "rt")}) || !reflect.DeepEqual(a.UsedBy, []contract.DefinitionRef{ref("processes", "p")}) {
		t.Fatalf("a = %+v", a)
	}
	if q := got[ref("processes", "q")]; q.Uses[0] != ref("agents", "ghost") {
		t.Fatalf("q = %+v", q)
	}
	if spare := got[ref("policies", "spare")]; len(spare.UsedBy) != 0 {
		t.Fatalf("spare = %+v", spare)
	}
	if broken := got[ref("agents", "broken")]; !broken.Invalid || len(broken.Uses) != 0 {
		t.Fatalf("broken = %+v", broken)
	}
}

func TestCheckProbesEachAgentsRuntime(t *testing.T) {
	h := newHarness()
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	if report, _ := checker.Check(context.Background(), true); len(report.Problems) != 0 {
		t.Fatalf("problems = %v", report.Problems)
	}
	if !reflect.DeepEqual(h.runtimes.identified, []string{"spy|/bin/spy"}) {
		t.Fatalf("identified = %v", h.runtimes.identified)
	}
	h.runner.identity.Version = "9.0.0"
	report, _ := checker.Check(context.Background(), true)
	if !reflect.DeepEqual(report.Problems, []string{"agent a: mapping rt verifies no primitive for runtime version 9.0.0"}) {
		t.Fatalf("problems = %v", report.Problems)
	}
}

// Only an adapter the code provides is probed: the identity of one it does
// not is never asked for, and its absence is reported once, as what it is.
func TestCheckProbeAsksNoIdentityOfAnAdapterTheCodeDoesNotProvide(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindRuntime]["rt"] = strings.Replace(h.defs.docs[definition.KindRuntime]["rt"], "adapter: spy", "adapter: ghost", 1)
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	without, _ := checker.Check(context.Background(), false)
	report, _ := checker.Check(context.Background(), true)
	want := []string{`runtime mapping rt: unknown adapter "ghost" (available: spy)`}
	if !reflect.DeepEqual(without.Problems, want) || !reflect.DeepEqual(report.Problems, without.Problems) {
		t.Fatalf("problems without probe %q, with %q, want %q", without.Problems, report.Problems, want)
	}
	if len(h.runtimes.identified) != 0 {
		t.Fatalf("identities asked for: %v", h.runtimes.identified)
	}
}

// The installed version may verify some primitive, yet not the ones a process
// needs.
func TestCheckProbePlansEachProcessOnTheInstalledVersion(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindRuntime]["rt"] = strings.Replace(h.defs.docs[definition.KindRuntime]["rt"], "Read: {grants: [repository.read], verified: [\"1.\"]}", "Read: {grants: [repository.read], verified: [\"2.\"]}", 1)
	h.defs.docs[definition.KindProcess]["p"] += "tools: {require: [repository.read]}\n"
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	if report, _ := checker.Check(context.Background(), false); len(report.Problems) != 0 {
		t.Fatalf("problems = %v", report.Problems)
	}
	report, _ := checker.Check(context.Background(), true)
	if len(report.Problems) != 1 || !strings.HasPrefix(report.Problems[0], "process p: cannot run on agent a's runtime rt version 1.2.3: ") ||
		!strings.Contains(report.Problems[0], "not verified for version 1.2.3: Read") {
		t.Fatalf("problems = %v", report.Problems)
	}
}

type readerSpy struct {
	calls   []int // afterSeq per call
	batches [][]run.Event
	status  []run.State
	record  run.Record
	state   run.State
}

func (s *readerSpy) Events(_ context.Context, _ string, afterSeq int) ([]run.Event, run.State, error) {
	i := len(s.calls)
	s.calls = append(s.calls, afterSeq)
	return s.batches[i], s.status[i], nil
}

func (s *readerSpy) Get(context.Context, string) (run.Record, run.State, error) {
	return s.record, s.state, nil
}

func (s *readerSpy) List(context.Context) ([]run.Record, error) { return []run.Record{s.record}, nil }

func TestObserveResumesAfterTheLastDeliveredEvent(t *testing.T) {
	reader := &readerSpy{
		batches: [][]run.Event{{{Seq: 4}, {Seq: 5}}, {}, {{Seq: 6}}},
		status:  []run.State{run.StateRunning, run.StateRunning, run.StateFinished},
	}
	runs := app.NewRuns(reader, nil, 1)
	var delivered []int
	err := runs.Observe(context.Background(), "r", 3, func(event contract.Event) error {
		delivered = append(delivered, event.Seq)
		return nil
	})
	if err != nil || !reflect.DeepEqual(delivered, []int{4, 5, 6}) || !reflect.DeepEqual(reader.calls, []int{3, 5, 5}) {
		t.Fatalf("delivered %v, asked after %v, err %v", delivered, reader.calls, err)
	}
}

func TestInspectShowsTheNodeResultAsRecorded(t *testing.T) {
	cost, ms, tokens := 0.1, int64(5), int64(3)
	result := &run.Result{
		Status: run.Failed, Error: run.Fault(run.ClassBudgetExhausted, "limit"), Text: "t",
		Usage: &run.Usage{InputTokens: &tokens, ReasoningTokens: &tokens}, Cost: run.Cost{USD: &cost, Source: run.CostRuntime},
		Timing:    run.Timing{StartedAt: time.Unix(1, 0).UTC(), FinishedAt: time.Unix(2, 0).UTC(), WallMS: 1000, TurnMS: &ms, RuntimeMS: &ms},
		Artifacts: []run.Artifact{{Name: "changes.patch", Path: "artifacts/changes.patch", Digest: "sha256:x", Bytes: 1}},
		Session:   &run.Session{ProviderSessionID: "prov-1", Continues: "run-0"},
	}
	reader := &readerSpy{state: run.StateFinished, record: run.Record{ID: "r", Result: result, Turn: &run.Turn{StderrTail: "boom"}}}
	view, err := (app.NewRuns(reader, nil, 0)).Inspect(context.Background(), "r")
	if err != nil || view.State != "finished" || view.StderrTail != "boom" {
		t.Fatalf("view = %+v, %v", view, err)
	}
	// The contract carries every field of the domain result.
	want, _ := json.Marshal(result)
	got, _ := json.Marshal(view.Result)
	if string(got) != string(want) {
		t.Fatalf("contract result\n%s\nwant\n%s", got, want)
	}
}

func TestAnAbandonedRunIsALostNode(t *testing.T) {
	reader := &readerSpy{state: run.StateAbandoned, record: run.Record{ID: "r", CreatedAt: time.Unix(1, 0)}}
	view, err := (app.NewRuns(reader, nil, 0)).Inspect(context.Background(), "r")
	if err != nil || view.State != "abandoned" || view.Result == nil || view.Result.Status != "lost" || view.Result.Error.Class != "abandoned" || view.Result.Cost.Source != "unknown" {
		t.Fatalf("view = %+v, %v", view.Result, err)
	}
}

type writerSpy struct {
	writes  []string
	existed map[string]bool
}

func (s *writerSpy) Current(_ context.Context, kind definition.Kind, name string) (string, string, error) {
	key := string(kind) + "/" + name
	if s.existed[key] {
		return key, "d-" + key, nil
	}
	return key, "", nil
}

// initNow and createNow approve their own plan, as a user typing yes does.
func initNow(settings *app.Settings, overwrite bool) (contract.InitResult, error) {
	plan, err := settings.Init(context.Background(), overwrite, nil)
	if err != nil {
		return plan, err
	}
	return settings.Init(context.Background(), overwrite, &plan)
}

func createNow(settings *app.Settings, spec contract.Agent, overwrite bool) (contract.AgentWrite, error) {
	plan, err := settings.CreateAgent(context.Background(), spec, overwrite, nil)
	if err != nil {
		return plan, err
	}
	return settings.CreateAgent(context.Background(), spec, overwrite, &plan)
}

func (s *writerSpy) Write(ctx context.Context, kind definition.Kind, name string, data []byte, expected string) (string, bool, error) {
	s.writes = append(s.writes, string(kind)+"/"+name)
	key, current, _ := s.Current(ctx, kind, name)
	return key, current == expected, nil
}

func TestInitWritesEachExampleWithoutOverwriting(t *testing.T) {
	writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
	examples := fstest.MapFS{
		"service.toml":   {Data: []byte("x")},
		"agents/a.toml":  {Data: []byte("x")},
		"schemas/s.json": {Data: []byte("x")},
	}
	result, err := initNow(app.NewSettings(nil, writer, examples, nil), false)
	if err != nil {
		t.Fatal(err)
	}
	// A kept file is not written at all.
	if !reflect.DeepEqual(writer.writes, []string{"schemas/s", "service/service"}) ||
		!reflect.DeepEqual(result.Kept, []string{"agents/a"}) || len(result.Created) != 2 {
		t.Fatalf("writes %v, result %+v", writer.writes, result)
	}
}

// A dry run reports what a real run would write and writes nothing; with
// overwrite, existing files are reported as replaced, not created.
func TestInitDryRunAndReplacement(t *testing.T) {
	examples := fstest.MapFS{
		"service.toml":  {Data: []byte("x")},
		"agents/a.toml": {Data: []byte("x")},
	}
	for _, overwrite := range []bool{false, true} {
		writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
		settings := app.NewSettings(nil, writer, examples, nil)
		plan, err := settings.Init(context.Background(), overwrite, nil)
		if err != nil || len(writer.writes) != 0 {
			t.Fatalf("overwrite %v: dry run wrote %v, %v", overwrite, writer.writes, err)
		}
		result, err := settings.Init(context.Background(), overwrite, &plan)
		if err != nil || !reflect.DeepEqual(plan, result) {
			t.Fatalf("overwrite %v: plan %+v, result %+v, %v", overwrite, plan, result, err)
		}
		digests := map[string]string{"agents/a": "d-agents/a", "service/service": ""}
		sum := sha256.Sum256([]byte("x"))
		contents := map[string]string{"agents/a": hex.EncodeToString(sum[:]), "service/service": hex.EncodeToString(sum[:])}
		want := contract.InitResult{Created: []string{"service/service"}, Kept: []string{"agents/a"}, Digests: digests, Contents: contents}
		if overwrite {
			want = contract.InitResult{Created: []string{"service/service"}, Replaced: []string{"agents/a"}, Digests: digests, Contents: contents}
		}
		if !reflect.DeepEqual(result, want) {
			t.Fatalf("overwrite %v: result %+v", overwrite, result)
		}
	}
}

// A write carries the plan the user approved: a file that changed since,
// including one created since, stops it before anything is written.
func TestWritesRefuseFilesChangedSinceTheApprovedPlan(t *testing.T) {
	examples := fstest.MapFS{"service.toml": {Data: []byte("x")}, "agents/a.toml": {Data: []byte("x")}}
	writer := &writerSpy{existed: map[string]bool{}}
	settings := app.NewSettings(nil, writer, examples, nil)
	plan, err := settings.Init(context.Background(), true, nil)
	if err != nil {
		t.Fatal(err)
	}
	writer.existed["agents/a"] = true // created while the user read the plan
	var input *contract.InputError
	if _, err := settings.Init(context.Background(), true, &plan); !errors.As(err, &input) || !strings.Contains(err.Error(), "changed since you confirmed") || len(writer.writes) != 0 {
		t.Fatalf("init: %v, writes %v", err, writer.writes)
	}

	h := newHarness()
	settings = app.NewSettings(h.defs, writer, nil, nil)
	agent, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, true, nil)
	if err != nil {
		t.Fatal(err)
	}
	writer.existed["agents/b"] = true
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, true, &agent); !errors.As(err, &input) || len(writer.writes) != 0 {
		t.Fatalf("agent: %v, writes %v", err, writer.writes)
	}
}

// An approval is for the plan shown: a request that now plans something
// else, such as another agent, other content, or replacing a file shown as
// kept, writes nothing.
func TestWritesRefuseAnythingButTheApprovedPlan(t *testing.T) {
	examples := fstest.MapFS{"service.toml": {Data: []byte("x")}, "agents/a.toml": {Data: []byte("x")}}
	writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
	settings := app.NewSettings(nil, writer, examples, nil)
	keep, err := settings.Init(context.Background(), false, nil)
	if err != nil {
		t.Fatal(err)
	}
	var input *contract.InputError
	if _, err := settings.Init(context.Background(), true, &keep); !errors.As(err, &input) || !strings.Contains(err.Error(), "not the plan you confirmed, so nothing was written: agents/a") || len(writer.writes) != 0 {
		t.Fatalf("init: %v, writes %v", err, writer.writes)
	}

	examples["service.toml"] = &fstest.MapFile{Data: []byte("different")}
	create, err := settings.Init(context.Background(), false, nil)
	if err != nil {
		t.Fatal(err)
	}
	examples["service.toml"] = &fstest.MapFile{Data: []byte("changed after the preview")}
	if _, err := settings.Init(context.Background(), false, &create); !errors.As(err, &input) || !strings.Contains(err.Error(), "not the plan you confirmed, so nothing was written: service/service") || len(writer.writes) != 0 {
		t.Fatalf("init content: %v, writes %v", err, writer.writes)
	}

	h := newHarness()
	settings = app.NewSettings(h.defs, writer, nil, nil)
	plan, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, other := range []contract.Agent{{Name: "b", Runtime: "rt", Model: "other"}, {Name: "c", Runtime: "rt"}} {
		if _, err := settings.CreateAgent(context.Background(), other, false, &plan); !errors.As(err, &input) || !strings.Contains(err.Error(), "not the plan you confirmed") || len(writer.writes) != 0 {
			t.Fatalf("agent %+v: %v, writes %v", other, err, writer.writes)
		}
	}
}

func TestInitSkipsHiddenFilesAndRejectsStrayRootFiles(t *testing.T) {
	writer := &writerSpy{}
	examples := fstest.MapFS{
		".DS_Store":        {Data: []byte("Bud1")},
		"agents/.DS_Store": {Data: []byte("Bud1")},
		"agents/a.toml":    {Data: []byte("x")},
		"service.toml":     {Data: []byte("x")},
	}
	if _, err := initNow(app.NewSettings(nil, writer, examples, nil), false); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(writer.writes, []string{"agents/a", "service/service"}) {
		t.Fatalf("writes %v", writer.writes)
	}
	stray := fstest.MapFS{"notes.txt": {Data: []byte("x")}}
	if _, err := initNow(app.NewSettings(nil, &writerSpy{}, stray, nil), false); err == nil {
		t.Fatal("a stray root file was accepted")
	}
}

// A dry run validates and reports a replacement without writing; the real
// run writes and reports the same.
func TestCreateAgentDryRun(t *testing.T) {
	h := newHarness()
	writer := &writerSpy{existed: map[string]bool{"agents/b": true}}
	settings := app.NewSettings(h.defs, writer, nil, nil)
	spec := contract.Agent{Name: "b", Runtime: "rt"}
	var input *contract.InputError
	if _, err := settings.CreateAgent(context.Background(), spec, false, nil); !errors.As(err, &input) {
		t.Fatalf("existing without overwrite: %v", err)
	}
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "nope"}, true, nil); !errors.As(err, &input) {
		t.Fatalf("invalid in a dry run: %v", err)
	}
	plan, err := settings.CreateAgent(context.Background(), spec, true, nil)
	if err != nil || plan.Content == "" || plan != (contract.AgentWrite{Path: "agents/b", Replaces: true, Digest: "d-agents/b", Content: plan.Content}) || len(writer.writes) != 0 {
		t.Fatalf("plan %+v, writes %v, %v", plan, writer.writes, err)
	}
	if written, err := settings.CreateAgent(context.Background(), spec, true, &plan); err != nil || written != plan || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) {
		t.Fatalf("written %+v, writes %v, %v", written, writer.writes, err)
	}
}

// narrowRuntime is a runtime mapping an agent can use alone, but on which
// process p cannot run: its one primitive also grants a permission p's
// policy does not allow.
const narrowRuntime = `schema: agister.runtime/v1alpha1
name: narrow
adapter: spy
contract: spy/1
efforts: [high]
primitives:
  select: one
  items:
    Bash: {grants: [process.execute, repository.read], verified: ["1."]}
`

// An agent that is valid alone but breaks the settings is refused before
// anything is written or asked; problems it did not add do not block it.
func TestCreateAgentKeepsSettingsValid(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindRuntime]["narrow"] = narrowRuntime
	writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	settings := app.NewSettings(h.defs, writer, nil, []app.Scope{{Name: "global settings", Check: checker}})
	var input *contract.InputError
	for _, approved := range []*contract.AgentWrite{nil, {Path: "agents/a", Replaces: true, Digest: "d-agents/a"}} {
		// Process p uses agent a, and cannot run on runtime narrow.
		_, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "a", Runtime: "narrow"}, true, approved)
		if !errors.As(err, &input) || !strings.Contains(err.Error(), "agent a would break the global settings") || !strings.Contains(err.Error(), "cannot run on agent a's runtime narrow") {
			t.Fatalf("approved %v: %v", approved, err)
		}
	}
	if len(writer.writes) != 0 {
		t.Fatalf("writes = %v", writer.writes)
	}
	if _, err := createNow(settings, contract.Agent{Name: "a", Runtime: "rt", ModelFamily: "other"}, true); err != nil {
		t.Fatalf("valid replacement: %v", err)
	}
	h.defs.docs[definition.KindAgent]["broken"] = "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\n"
	if _, err := createNow(settings, contract.Agent{Name: "c", Runtime: "rt"}, false); err != nil {
		t.Fatalf("an existing problem blocked a valid new agent: %v", err)
	}
}

func TestCreateAgentValidatesAgainstTheRuntimeMapping(t *testing.T) {
	h := newHarness()
	writer := &writerSpy{}
	settings := app.NewSettings(h.defs, writer, nil, nil)
	var input *contract.InputError
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "nope"}, false); !errors.As(err, &input) {
		t.Fatalf("unknown runtime: %v", err)
	}
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "rt", Effort: "max"}, false); !errors.As(err, &input) {
		t.Fatalf("unsupported effort: %v", err)
	}
	if len(writer.writes) != 0 {
		t.Fatal("invalid agents were written")
	}
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "rt", Effort: "high"}, false); err != nil || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) {
		t.Fatalf("writes %v, %v", writer.writes, err)
	}
}

// A process view says where each definition comes from as data, not text.
func TestShowProcessSourcesAreStructured(t *testing.T) {
	h := newHarness()
	// The resolver behind it is given nothing that can start a turn.
	identities := struct{ app.ResolverIdentities }{h.runtimes}
	view, err := (app.NewInspection(app.NewResolver(h.defs, identities, h.validator))).ShowProcess(context.Background(), "p", "")
	if err != nil {
		t.Fatal(err)
	}
	want := contract.DefinitionOrigin{Kind: "processes", Name: "p", Layer: "global", Path: "mem/processes/p"}
	if len(view.Sources) < 2 || !reflect.DeepEqual(view.Sources[1], want) {
		t.Fatalf("sources = %+v", view.Sources)
	}
	if len(h.runtimes.asked) != 0 || len(h.runner.calls()) != 0 {
		t.Fatalf("showing a process built runners %v and ran turns %v", h.runtimes.asked, h.runner.calls())
	}
}

// proposedCheckSpy reports scripted problems and records what it was asked.
type proposedCheckSpy struct {
	added []string
	docs  []definition.Document
}

func (s *proposedCheckSpy) ProblemsAdded(_ context.Context, doc definition.Document) ([]string, error) {
	s.docs = append(s.docs, doc)
	return s.added, nil
}

// Settings asks every scope about the agent as it would be written, and the
// first scope it would break refuses the write, by name.
func TestCreateAgentAsksEveryScope(t *testing.T) {
	h := newHarness()
	writer := &writerSpy{}
	global, project := &proposedCheckSpy{}, &proposedCheckSpy{added: []string{"agent b: bad"}}
	settings := app.NewSettings(h.defs, writer, nil, []app.Scope{{Name: "global settings", Check: global}, {Name: "project settings", Check: project}})
	var input *contract.InputError
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, false, nil); !errors.As(err, &input) || !strings.Contains(err.Error(), "agent b would break the project settings") || !strings.Contains(err.Error(), "agent b: bad") {
		t.Fatalf("err = %v", err)
	}
	for _, spy := range []*proposedCheckSpy{global, project} {
		if len(spy.docs) != 1 || spy.docs[0].Source.Kind != definition.KindAgent || spy.docs[0].Source.Name != "b" || spy.docs[0].Source.Path != "agents/b" || !strings.Contains(string(spy.docs[0].Bytes), `name = "b"`) {
			t.Fatalf("asked about %+v", spy.docs)
		}
	}
	project.added = nil
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "rt"}, false); err != nil || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) {
		t.Fatalf("writes %v, %v", writer.writes, err)
	}
}
