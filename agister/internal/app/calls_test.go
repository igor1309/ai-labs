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
state_reaching = ["host.read"]
`},
		definition.KindRuntime: {"rt": `schema: agister.runtime/v1alpha1
name: rt
adapter: spy
contract: spy/1
verified_versions: ["1."]
efforts: [high]
primitives:
  select: any
  items:
    Read: {grants: [repository.read]}
    Grep: {grants: [repository.search]}
    Bash: {grants: [process.execute, repository.read, repository.search, repository.diff, host.read]}
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
  result: {field: outcome, reject: [no]}
`},
		definition.KindSchema: {"s": schema},
	}
}

type harness struct {
	calls      *app.Calls
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
		defs:       &definitionsSpy{docs: settingsDocs()},
		runner:     &runnerSpy{identity: app.RuntimeIdentity{Contract: "spy/1", Version: "1.2.3", PresetSessionID: true}, turn: run.Turn{Outcome: run.TurnCompleted, Output: json.RawMessage(`{"outcome":"yes"}`), ProviderSessionID: "prov-1"}},
		workspaces: &workspacesSpy{root: "/repo", dir: "/work/checkout"},
		provenance: &provenanceSpy{},
		validator:  &validatorSpy{},
		recorder:   newRecorderSpy(),
	}
	h.runtimes = &runtimesSpy{runner: h.runner}
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

func TestAcceptedCallSendsTheComposedPayloads(t *testing.T) {
	h := newHarness()
	record := h.call(t, contract.CallRequest{Params: map[string]string{"base": "trunk"}})

	if record.Outcome != run.CallAccepted || string(record.Output) != `{"outcome":"yes"}` {
		t.Fatalf("record = %+v", record)
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
	if len(h.validator.compiled) != 1 || string(h.validator.validated[0]) != `{"outcome":"yes"}` {
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

func TestCallOutcomeFollowsTheResponses(t *testing.T) {
	cases := []struct {
		name        string
		turn        run.Turn
		validateErr error
		outcome     run.CallOutcome
		reason      string
		validated   int
	}{
		{"runtime failure", run.Turn{Outcome: run.TurnFailed, Reason: "exit code 3"}, nil, run.CallFailed, "failed: exit code 3", 0},
		{"lost turn", run.Turn{Outcome: run.TurnLost, Reason: "exited without a result"}, nil, run.CallFailed, "lost: exited without a result", 0},
		{"invalid output", run.Turn{Outcome: run.TurnCompleted, Output: json.RawMessage(`{}`)}, errors.New("missing outcome"), run.CallFailed, "invalid output: missing outcome", 1},
		{"rejecting output", run.Turn{Outcome: run.TurnCompleted, Output: json.RawMessage(`{"outcome":"no"}`)}, nil, run.CallRejected, "outcome is no", 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			h.runner.turn = c.turn
			h.validator.validateErr = c.validateErr
			record := h.call(t, contract.CallRequest{})
			if record.Outcome != c.outcome || record.Reason != c.reason {
				t.Fatalf("outcome %s (%s), want %s (%s)", record.Outcome, record.Reason, c.outcome, c.reason)
			}
			if len(h.validator.validated) != c.validated {
				t.Fatalf("validated %d times", len(h.validator.validated))
			}
			if record.Outcome != run.CallAccepted && record.Outcome != run.CallRejected && record.Output != nil {
				t.Fatalf("output recorded for a failed call: %s", record.Output)
			}
			if h.workspaces.releases() != 1 {
				t.Fatalf("released %d times", h.workspaces.releases())
			}
		})
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
		{"unverified version", func(h *harness) { h.runner.identity.Version = "2.0.0" }, contract.CallRequest{}, "is not verified for spy version 2.0.0", false},
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
			if record.Outcome != run.CallRefused || !strings.Contains(record.Reason, c.reason) {
				t.Fatalf("outcome %s (%s), want refused (%s)", record.Outcome, record.Reason, c.reason)
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
	if record.Outcome != run.CallFailed || record.Reason != "interrupted: cancelled" || h.workspaces.releases() != 1 {
		t.Fatalf("record = %s (%s), released %d", record.Outcome, record.Reason, h.workspaces.releases())
	}
	var input *contract.InputError
	if err := runs.Cancel(context.Background(), "run-1"); !errors.As(err, &input) {
		t.Fatalf("cancelling a finished run: %v", err)
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
