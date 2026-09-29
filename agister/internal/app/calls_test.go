package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/constraint"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const schema = `{"type":"object"}`

func settingsDocs() map[definition.Kind]map[string]string {
	return map[definition.Kind]map[string]string{
		definition.KindService: {"service": `schema = "agister.service/v1alpha1"
max_timeout = "1h"
permissions = ["repository.read", "repository.search", "repository.diff", "process.execute", "host.read"]
writing = []
state_reaching = ["host.read"]
`},
		definition.KindRuntime: {"rt": `schema: agister.runtime/v1alpha1
name: rt
adapter: spy
contract: spy/1
efforts: [high]
primitives:
  select: any
  items:
    Read: {grants: [repository.read], verified: ["1."]}
    Grep: {grants: [repository.search], verified: ["1."]}
    Bash: {grants: [process.execute, repository.read, repository.search, repository.diff, host.read], verified: ["1."]}
`},
		definition.KindAgent: {"a": `schema = "agister.agent/v1alpha1"
name = "a"
runtime = "rt"
model = "m1"
model_family = "fam"
effort = "high"
command = "/bin/spy"
`},
		definition.KindPolicy: {"pol": `schema: agister.process-policy/v1alpha1
name: pol
timeout: 20m
tools: {allow: [repository.read, repository.search, repository.diff]}
workspace: {access: read-only, scope: candidate}
constraints:
  agent.model_family:
    not_equal: evidence.candidate(input.candidate_revision).provenance.writer.model_family
    on_unsatisfied: fail
    on_unknown: pass
`},
		definition.KindProcess: {"p": `schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
policy: process-policy:pol
input:
  instruction: Inspect the change.
  params:
    base: {default: main}
    candidate: {default: HEAD}
  values:
    candidate_revision: {source: git.revision, rev: "${param.candidate}"}
    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}
workspace:
  checkout: candidate_revision
output:
  format: json
  schema: s
  require_valid: true
`},
		definition.KindSchema: {"s": schema},
	}
}

type harness struct {
	calls      *app.Calls
	runs       *runsSpy
	defs       *definitionsSpy
	runner     *runnerSpy
	runtimes   *runtimesSpy
	inputs     *inputsSpy
	workspaces *workspacesSpy
	provenance *provenanceSpy
	validator  *validatorSpy
	recorder   *recorderSpy
}

func newHarness() *harness {
	h := &harness{
		defs: &definitionsSpy{docs: settingsDocs()},
		runner: &runnerSpy{
			identity: app.RuntimeIdentity{Contract: "spy/1", Version: "1.2.3", PresetSessionID: true, Resume: true, CostLimit: true},
			turn:     run.Turn{Status: run.Completed, Output: json.RawMessage(`{"outcome":"no"}`), ProviderSessionID: "prov-1"},
		},
		workspaces: &workspacesSpy{root: "/repo", dir: "/work/checkout"},
		provenance: &provenanceSpy{},
		validator:  &validatorSpy{},
		recorder:   newRecorderSpy(),
	}
	h.runtimes = &runtimesSpy{runner: h.runner}
	h.runs = &runsSpy{records: map[string]run.Record{}, states: map[string]run.State{}}
	h.inputs = &inputsSpy{respond: func(spec app.InputSpec) (app.Resolved, error) {
		switch spec.Source {
		case "git.revision":
			return app.Resolved{Value: "sha-" + spec.Args["rev"], Identity: "sha-" + spec.Args["rev"], Revision: true}, nil
		default:
			return app.Resolved{Value: "line one\nline two", Identity: "sha256:d"}, nil
		}
	}}
	h.calls = &app.Calls{
		Definitions: h.defs,
		Runtimes:    h.runtimes,
		Inputs:      map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs},
		Workspaces:  h.workspaces,
		Provenance:  h.provenance,
		Validator:   h.validator,
		Recorder:    h.recorder,
		Runs:        h.runs,
		Clock:       fixedClock{},
		IDs:         fixedIDs{},
		StateDir:    "/state",
		Hosted:      app.NewHosted(),
	}
	return h
}

func (h *harness) call(t *testing.T, request contract.CallRequest) run.Record {
	t.Helper()
	if request.Process == "" {
		request.Process = "p"
	}
	if request.Cwd == "" {
		request.Cwd = "/repo"
	}
	id, err := h.calls.Submit(context.Background(), request)
	if err != nil || id != "run-1" {
		t.Fatalf("submit = %q, %v", id, err)
	}
	return h.recorder.wait(t)
}

// class is a finished record's failure class, empty when it completed.
func class(record run.Record) run.Class {
	if record.Result == nil || record.Result.Error == nil {
		return ""
	}
	return record.Result.Error.Class
}

func message(record run.Record) string {
	if record.Result == nil || record.Result.Error == nil {
		return ""
	}
	return record.Result.Error.Message
}

func TestCompletedCallSendsTheComposedPayloads(t *testing.T) {
	h := newHarness()
	record := h.call(t, contract.CallRequest{Params: map[string]string{"base": "trunk"}})

	// Whatever the output says, it is the output of a completed node.
	if record.Result.Status != run.Completed || record.Result.Error != nil || string(record.Result.Output) != `{"outcome":"no"}` {
		t.Fatalf("result = %+v", record.Result)
	}
	// The runtime was asked for by the mapping's adapter and the agent's command.
	if !reflect.DeepEqual(h.runtimes.asked, []string{"spy|/bin/spy"}) {
		t.Fatalf("runtimes asked = %v", h.runtimes.asked)
	}
	// Inputs were resolved with bound params, defaults included.
	gotArgs := []map[string]string{h.inputs.specs[0].Args, h.inputs.specs[1].Args}
	wantArgs := []map[string]string{{"rev": "HEAD"}, {"base": "trunk", "head": "HEAD"}}
	if !reflect.DeepEqual(gotArgs, wantArgs) || h.inputs.specs[0].Cwd != "/repo" {
		t.Fatalf("input specs = %+v", h.inputs.specs)
	}
	// Constraint looked up the candidate's resolved identity.
	if !reflect.DeepEqual(h.provenance.revisions, []string{"sha-HEAD"}) {
		t.Fatalf("provenance asked for %v", h.provenance.revisions)
	}
	// The checkout is of the resolved revision, and released once.
	if !reflect.DeepEqual(h.workspaces.checkouts, [][2]string{{"/repo", "sha-HEAD"}}) || h.workspaces.releases() != 1 {
		t.Fatalf("checkouts %v, released %d", h.workspaces.checkouts, h.workspaces.releases())
	}
	// The turn request carries primitives, not permissions.
	requests := h.runner.calls()
	if len(requests) != 1 {
		t.Fatalf("runner called %d times", len(requests))
	}
	got := requests[0]
	if !reflect.DeepEqual(got.Primitives, []string{"Read", "Grep"}) ||
		got.Cwd != "/work/checkout" || got.Model != "m1" || got.Effort != "high" ||
		got.Timeout != 20*time.Minute || got.SessionID != "session-1" || string(got.OutputSchema) != schema {
		t.Fatalf("turn request = %+v", got)
	}
	if got.Instruction != "Inspect the change.\n\nGranted permissions: repository.read, repository.search\nWithheld permissions: repository.diff" {
		t.Fatalf("instruction = %q", got.Instruction)
	}
	if got.Prompt != "## candidate_revision\n\nsha-HEAD\n\n## diff\n\n```\nline one\nline two\n```" {
		t.Fatalf("prompt = %q", got.Prompt)
	}
	// The schema was compiled before the call and the output validated after.
	if len(h.validator.compiled) != 1 || string(h.validator.validated[0]) != `{"outcome":"no"}` {
		t.Fatalf("validator: compiled %d, validated %v", len(h.validator.compiled), h.validator.validated)
	}
	// Evidence: definitions with digests, plan, inputs, identities.
	var kinds []string
	for _, source := range record.Definitions {
		kinds = append(kinds, string(source.Kind)+"/"+source.Name)
		if len(source.SHA256) != 64 {
			t.Fatalf("source without digest: %+v", source)
		}
	}
	if strings.Join(kinds, ",") != "service/service,processes/p,policies/pol,agents/a,runtimes/rt,schemas/s" {
		t.Fatalf("definitions = %v", kinds)
	}
	if record.Plan == nil || !reflect.DeepEqual(record.Plan.Withheld, []string{"repository.diff"}) || record.RequestedSessionID != "session-1" ||
		record.Runtime.Version != "1.2.3" || record.Inputs[0].Identity != "sha-HEAD" || !record.Inputs[0].Revision {
		t.Fatalf("record = %+v", record)
	}
	order := strings.Join(h.recorder.kinds(), " ")
	if order != "CALL_SUBMITTED PLANNED PERMISSIONS_WITHHELD CONSTRAINT_CHECKED PROCESS_STARTED CALL_FINISHED" {
		t.Fatalf("events = %s", order)
	}
	if !reflect.DeepEqual(h.recorder.raw, []string{`{"raw":true}`}) {
		t.Fatalf("raw = %v", h.recorder.raw)
	}
}

func TestNodeStatusFollowsTheResponses(t *testing.T) {
	cases := []struct {
		name        string
		turn        run.Turn
		validateErr error
		status      run.Status
		class       run.Class
		validated   int
	}{
		{"runtime failure keeps its class", run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429")}, nil, run.Failed, run.ClassRateLimited, 0},
		{"lost turn", run.Turn{Status: run.Lost, Error: run.Fault(run.ClassNoResult, "")}, nil, run.Lost, run.ClassNoResult, 0},
		{"timeout", run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "")}, nil, run.Interrupted, run.ClassTimeout, 0},
		{"invalid output", run.Turn{Status: run.Completed, Output: json.RawMessage(`{}`)}, errors.New("missing outcome"), run.Failed, run.ClassInvalidOutput, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			h.runner.turn = c.turn
			h.validator.validateErr = c.validateErr
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != c.status || class(record) != c.class {
				t.Fatalf("result %s/%s, want %s/%s", record.Result.Status, class(record), c.status, c.class)
			}
			if len(h.validator.validated) != c.validated {
				t.Fatalf("validated %d times", len(h.validator.validated))
			}
			if record.Result.Output != nil {
				t.Fatalf("output recorded for a node that did not complete: %s", record.Result.Output)
			}
			if h.workspaces.releases() != 1 {
				t.Fatalf("released %d times", h.workspaces.releases())
			}
		})
	}
}

func TestResultCarriesUsageCostTimingAndSession(t *testing.T) {
	h := newHarness()
	clock := &steppingClock{now: time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)}
	h.calls.Clock = clock
	tokens, cost, runtimeMS := int64(7), 0.25, int64(900)
	h.runner.turn = run.Turn{Status: run.Completed, Output: json.RawMessage(`{}`), ProviderSessionID: "prov-1", CostUSD: &cost, RuntimeMS: &runtimeMS, Usage: &run.Usage{InputTokens: &tokens}}
	record := h.call(t, contract.CallRequest{})
	result := record.Result
	if result.Cost.Source != run.CostRuntime || *result.Cost.USD != 0.25 || *result.Usage.InputTokens != 7 {
		t.Fatalf("cost %+v, usage %+v", result.Cost, result.Usage)
	}
	// Agister measures its own clock: the call from submission to finish,
	// the turn within it. The runtime's figure is kept beside them.
	timing := result.Timing
	if !timing.StartedAt.Equal(record.CreatedAt) || timing.WallMS != timing.FinishedAt.Sub(record.CreatedAt).Milliseconds() ||
		*timing.TurnMS <= 0 || *timing.TurnMS >= timing.WallMS || *timing.RuntimeMS != 900 {
		t.Fatalf("timing = %+v", result.Timing)
	}
	if result.Session == nil || result.Session.ProviderSessionID != "prov-1" || result.Session.Continues != "" {
		t.Fatalf("session = %+v", result.Session)
	}

	// A runtime that reports no cost leaves it unknown, never zero.
	h = newHarness()
	if record := h.call(t, contract.CallRequest{}); record.Result.Cost.Source != run.CostUnknown || record.Result.Cost.USD != nil {
		t.Fatalf("cost = %+v", record.Result.Cost)
	}
}

func TestCostLimitReachesTheRuntimeOrRefuses(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindPolicy]["pol"] += "max_cost_usd: 2\n"
	limit := 0.5
	record := h.call(t, contract.CallRequest{MaxCostUSD: &limit})
	if got := h.runner.calls()[0].MaxCostUSD; got == nil || *got != 0.5 || *record.Effective.MaxCostUSD != 0.5 {
		t.Fatalf("limit sent %v, effective %v", got, record.Effective.MaxCostUSD)
	}

	h = newHarness()
	h.defs.docs[definition.KindPolicy]["pol"] += "max_cost_usd: 2\n"
	h.runner.identity.CostLimit = false
	if record := h.call(t, contract.CallRequest{}); class(record) != run.ClassRefused || !strings.Contains(message(record), "cannot enforce the cost limit 2") {
		t.Fatalf("result = %+v", record.Result)
	}
}

func TestContinuationResumesAFinishedRunsSession(t *testing.T) {
	resumable := func(h *harness) {
		h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	}
	earlier := run.Record{ID: "run-0", Agent: "a", Runtime: &run.Runtime{Adapter: "spy"}, Result: &run.Result{Status: run.Interrupted, Session: &run.Session{ProviderSessionID: "prov-0"}}}

	h := newHarness()
	resumable(h)
	h.runs.records["run-0"], h.runs.states["run-0"] = earlier, run.StateFinished
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	got := h.runner.calls()[0]
	// The earlier session is continued in a new one.
	if got.ResumeSessionID != "prov-0" || got.SessionID != "session-1" || record.Result.Session.Continues != "run-0" || record.Request.Continue != "run-0" {
		t.Fatalf("request %+v, session %+v", got, record.Result.Session)
	}

	for _, c := range []struct {
		name    string
		arrange func(*harness)
		reason  string
	}{
		{"fresh-only agent", func(h *harness) {}, "agent a is fresh-only; it cannot continue run run-0"},
		{"runtime cannot resume", func(h *harness) { resumable(h); h.runner.identity.Resume = false }, "runtime rt cannot continue sessions"},
		{"unknown run", func(h *harness) { resumable(h); delete(h.runs.records, "run-0") }, "run run-0: not found"},
		{"run still running", func(h *harness) { resumable(h); h.runs.states["run-0"] = run.StateRunning }, "run run-0 is running, not finished"},
		{"another agent's run", func(h *harness) {
			resumable(h)
			other := earlier
			other.Agent = "b"
			h.runs.records["run-0"] = other
		}, "run run-0 ran agent b"},
		{"run without a session", func(h *harness) {
			resumable(h)
			bare := earlier
			bare.Result = &run.Result{Status: run.Failed}
			h.runs.records["run-0"] = bare
		}, "run run-0 has no provider session"},
	} {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			h.runs.records["run-0"], h.runs.states["run-0"] = earlier, run.StateFinished
			c.arrange(h)
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.reason) {
				t.Fatalf("result %+v, want refusal %q", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
				t.Fatal("effects before the refusal")
			}
		})
	}
}

func TestWorkspaceChangesBecomeArtifacts(t *testing.T) {
	h := newHarness()
	h.workspaces.changes = []byte("diff --git a/x b/x\n")
	h.recorder.onFinish = func() int { return h.workspaces.releases() }
	record := h.call(t, contract.CallRequest{})
	if !reflect.DeepEqual(h.workspaces.changed, [][2]string{{"/work/checkout", "sha-HEAD"}}) || string(h.recorder.artifacts["changes.patch"]) != "diff --git a/x b/x\n" {
		t.Fatalf("changes asked %v, stored %v", h.workspaces.changed, h.recorder.artifacts)
	}
	if len(record.Result.Artifacts) != 1 || record.Result.Artifacts[0].Path != "artifacts/changes.patch" || !contains(h.recorder.kinds(), "ARTIFACT_STORED") {
		t.Fatalf("artifacts = %+v", record.Result.Artifacts)
	}

	// Nothing changed: no artifact. A failure to collect is recorded and
	// does not change the node status.
	h = newHarness()
	if record := h.call(t, contract.CallRequest{}); len(record.Result.Artifacts) != 0 || len(h.recorder.artifacts) != 0 {
		t.Fatalf("artifacts = %+v", record.Result.Artifacts)
	}
	h = newHarness()
	h.workspaces.changeErr = errors.New("git broke")
	if record := h.call(t, contract.CallRequest{}); record.Result.Status != run.Completed || !contains(h.recorder.kinds(), "ARTIFACT_FAILED") {
		t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
	}

	// A workspace the call does not own is the caller's; its changes are not taken.
	h = newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "workspace:\n  checkout: candidate_revision\n", "", 1)
	h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "scope: candidate", "scope: repository", 1)
	h.workspaces.changes = []byte("x")
	if record := h.call(t, contract.CallRequest{}); record.Result.Status != run.Completed || len(h.workspaces.changed) != 0 {
		t.Fatalf("result %+v, changes asked %v", record.Result, h.workspaces.changed)
	}
}

// A panic while collecting changes finishes the record as internal and
// still releases the workspace; collection is not retried.
func TestPanicInChangeCollectionFinishesTheRecord(t *testing.T) {
	h := newHarness()
	h.workspaces.panics = true
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassInternal || !strings.Contains(message(record), "changes exploded") {
		t.Fatalf("result = %+v", record.Result.Error)
	}
	if len(h.workspaces.changed) != 1 || h.workspaces.releases() != 1 {
		t.Fatalf("changes asked %d times, released %d", len(h.workspaces.changed), h.workspaces.releases())
	}
}

// Each refusal is recorded, and nothing after the refusing check happens.
func TestRefusalsComeBeforeEffects(t *testing.T) {
	cases := []struct {
		name     string
		arrange  func(*harness)
		request  contract.CallRequest
		reason   string
		checkout bool // whether a checkout may already have happened
	}{
		{"missing definition", func(h *harness) { delete(h.defs.docs[definition.KindPolicy], "pol") }, contract.CallRequest{}, `policy "pol": not found`, false},
		{"invalid definition", func(h *harness) { h.defs.docs[definition.KindProcess]["p"] += "surprise: 1\n" }, contract.CallRequest{}, "surprise: unknown field", false},
		{"schema does not compile", func(h *harness) { h.validator.compileErr = errors.New("bad schema") }, contract.CallRequest{}, `schema "s": bad schema`, false},
		{"runtime unavailable", func(h *harness) { h.runner.identityErr = errors.New("no binary") }, contract.CallRequest{}, "runtime rt is unavailable: no binary", false},
		{"adapter contract mismatch", func(h *harness) { h.runner.identity.Contract = "spy/2" }, contract.CallRequest{}, "describes adapter contract spy/1, but the adapter implements spy/2", false},
		{"unverified version", func(h *harness) { h.runner.identity.Version = "2.0.0" }, contract.CallRequest{}, "verifies no primitive for spy version 2.0.0", false},
		{"caller widens timeout", nil, contract.CallRequest{Timeout: "2h"}, "caller timeout 2h0m0s widens the effective 20m0s", false},
		{"unknown param", nil, contract.CallRequest{Params: map[string]string{"focus": "x"}}, "takes no params: focus", false},
		{"input fails", func(h *harness) {
			h.inputs.respond = func(app.InputSpec) (app.Resolved, error) { return app.Resolved{}, errors.New("not a commit") }
		}, contract.CallRequest{}, "input candidate_revision: not a commit", false},
		{"same model family wrote the candidate", func(h *harness) {
			h.provenance.writer = &constraint.Writer{Agent: "w", ModelFamily: "fam", RunID: "r0"}
		}, contract.CallRequest{}, "constraint agent.model_family unsatisfied: agent family fam, writer family fam (run r0)", false},
		{"workspace overlaps state", func(h *harness) { h.workspaces.root = "/state/repo" }, contract.CallRequest{}, "workspace /state/repo overlaps Agister's state /state", false},
		{"constraint on an input that is not a revision", func(h *harness) {
			h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "{source: git.revision,", "{source: git.diff,", 1)
		}, contract.CallRequest{}, "constraint agent.model_family: input candidate_revision is not a revision", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			if c.arrange != nil {
				c.arrange(h)
			}
			record := h.call(t, c.request)
			if record.Result.Status != run.Failed || class(record) != run.ClassRefused || !strings.Contains(message(record), c.reason) {
				t.Fatalf("result %+v, want refused (%s)", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 {
				t.Fatal("the runtime ran after a refusal")
			}
			if !c.checkout && len(h.workspaces.checkouts) != 0 {
				t.Fatal("a workspace was checked out before the refusal")
			}
			if kinds := h.recorder.kinds(); !contains(kinds, "REFUSED") || kinds[len(kinds)-1] != "CALL_FINISHED" {
				t.Fatalf("events = %v", kinds)
			}
		})
	}
}

func TestStateReachingPrimitivesAreNeverGranted(t *testing.T) {
	h := newHarness()
	policy := h.defs.docs[definition.KindPolicy]["pol"]
	h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(policy, "repository.diff]", "repository.diff, process.execute, host.read]", 1)
	h.call(t, contract.CallRequest{})
	if primitives := h.runner.calls()[0].Primitives; contains(primitives, "Bash") {
		t.Fatalf("Bash reaches host.read but was granted: %v", primitives)
	}
}

// A primitive whose grants were never checked against the runtime's version
// is not granted, even when everything it declares is allowed.
func TestUnverifiedPrimitivesAreNeverGranted(t *testing.T) {
	h := newHarness()
	mapping := h.defs.docs[definition.KindRuntime]["rt"]
	h.defs.docs[definition.KindRuntime]["rt"] = strings.Replace(mapping, "  items:\n", `  items:
    Glob: {grants: [repository.read]}
    Diff: {grants: [repository.diff], verified: ["2."]}
`, 1)
	h.call(t, contract.CallRequest{})
	if primitives := h.runner.calls()[0].Primitives; !reflect.DeepEqual(primitives, []string{"Read", "Grep"}) {
		t.Fatalf("primitives = %v, want only the ones verified for 1.2.3", primitives)
	}

	// Requiring what only an unverified primitive provides refuses, and says why.
	h = newHarness()
	h.defs.docs[definition.KindRuntime]["rt"] = strings.Replace(mapping, "  items:\n", "  items:\n    Diff: {grants: [repository.diff], verified: [\"2.\"]}\n", 1)
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "uses: agent:a\n", "uses: agent:a\ntools: {require: [repository.diff]}\n", 1)
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "required permissions would be withheld: repository.diff (not verified for version 1.2.3: Diff)") {
		t.Fatalf("result %+v", record.Result.Error)
	}
	if len(h.runner.calls()) != 0 {
		t.Fatal("the runtime ran after a refusal")
	}
}

func TestCancelInterruptsAndReleases(t *testing.T) {
	h := newHarness()
	h.runner.block = true
	h.runner.started = make(chan struct{})
	runs := &app.Runs{Hosted: h.calls.Hosted}
	if _, err := h.calls.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	<-h.runner.started
	if err := runs.Cancel(context.Background(), "run-1"); err != nil {
		t.Fatal(err)
	}
	record := h.recorder.wait(t)
	if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled || h.workspaces.releases() != 1 {
		t.Fatalf("result = %+v, released %d", record.Result, h.workspaces.releases())
	}
	var input *contract.InputError
	if err := runs.Cancel(context.Background(), "run-1"); !errors.As(err, &input) {
		t.Fatalf("cancelling a finished run: %v", err)
	}
}

// Cancelling before the runtime starts makes git and the version probe
// fail; the call is cancelled, not refused.
func TestCancelBeforeTheTurnIsCancelled(t *testing.T) {
	h := newHarness()
	runs := &app.Runs{Hosted: h.calls.Hosted}
	h.inputs.respond = func(app.InputSpec) (app.Resolved, error) {
		if err := runs.Cancel(context.Background(), "run-1"); err != nil {
			t.Error(err)
		}
		return app.Resolved{}, errors.New("signal: killed")
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled || !strings.Contains(message(record), "signal: killed") {
		t.Fatalf("result = %+v", record.Result.Error)
	}
	if kinds := h.recorder.kinds(); contains(kinds, "REFUSED") {
		t.Fatalf("events = %v", kinds)
	}
	if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
		t.Fatal("the call went on after the cancel")
	}
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// The workspace is released before the record is finished, so a finished
// run never has a live workspace.
func TestWorkspaceIsReleasedBeforeTheRunFinishes(t *testing.T) {
	h := newHarness()
	h.recorder.onFinish = func() int {
		h.workspaces.mu.Lock()
		defer h.workspaces.mu.Unlock()
		return h.workspaces.released
	}
	h.call(t, contract.CallRequest{})
	if h.recorder.releasedAtFinish != 1 {
		t.Fatalf("released %d times when the run finished", h.recorder.releasedAtFinish)
	}
}
