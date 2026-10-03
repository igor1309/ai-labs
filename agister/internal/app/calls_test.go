package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/prompt"
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
	hosted     *app.Hosted
	clock      app.CallClock
	timer      app.CallTimer
	runs       *runsSpy
	defs       *definitionsSpy
	runner     *runnerSpy
	runtimes   *runtimesSpy
	inputs     *inputsSpy
	workspaces *workspacesSpy
	changes    *changesSpy
	copies     *copiesSpy
	// setup runs the checkout's setup commands; commands the
	// verification's.
	setup     *setupCommandsSpy
	commands  *commandsSpy
	validator *validatorSpy
	recorder  *recorderSpy
}

func newHarness() *harness {
	h := &harness{
		defs: &definitionsSpy{docs: settingsDocs()},
		runner: &runnerSpy{
			identity: app.RuntimeIdentity{Contract: "spy/1", Version: "1.2.3", Resume: true, CostLimit: true},
			turn:     run.Turn{Status: run.Completed, Output: json.RawMessage(`{"outcome":"no"}`), ProviderSessionID: "prov-1"},
		},
		workspaces: &workspacesSpy{root: "/repo", dir: "/work/checkout"},
		changes:    &changesSpy{},
		copies:     &copiesSpy{},
		setup:      &setupCommandsSpy{},
		commands:   &commandsSpy{},
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
	h.hosted = app.NewHosted()
	h.clock = fixedClock{}
	h.timer = unfired
	h.calls = h.callsOn(h.defs)
	return h
}

// callsOn is the harness's Calls reading its definitions from src.
func (h *harness) callsOn(src app.ResolverDefinitions) *app.Calls {
	return h.callsWith(src, h.workspaces, h.changes, h.runs)
}

func (h *harness) callsWith(src app.ResolverDefinitions, workspaces app.CallWorkspaces, changes app.CallChanges, runs app.CallRuns) *app.Calls {
	return h.callsRecordedWith(src, workspaces, changes, runs, h.recorder, fixedIDs{})
}

func (h *harness) callsRecordedWith(src app.ResolverDefinitions, workspaces app.CallWorkspaces, changes app.CallChanges, runs app.CallRuns, recorder app.RunRecorder, ids app.IDs) *app.Calls {
	return app.NewCalls(
		app.NewResolver(src, h.runtimes, h.validator, resolverCheckStub{}),
		h.runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs, "git.changed_files": h.inputs, "file": h.inputs, "param": h.inputs},
		workspaces, changes, app.NewPreparer(changes, h.setup, h.clock), app.NewVerifier(changes, h.copies, h.commands, h.clock), h.validator, recorder, runs,
		h.clock, h.timer, ids, "/state", h.hosted,
	)
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
	t.Parallel()
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
	// The checkout is of the resolved revision, and released once.
	if !reflect.DeepEqual(h.workspaces.checkouts, [][2]string{{"/repo", "sha-HEAD"}}) || h.workspaces.releases() != 1 {
		t.Fatalf("checkouts %v, released %d", h.workspaces.checkouts, h.workspaces.releases())
	}
	// The turn request carries primitives, not permissions, and a fresh
	// call names no session: the runtime reports the one it starts.
	requests := h.runner.calls()
	if len(requests) != 1 {
		t.Fatalf("runner called %d times", len(requests))
	}
	got := requests[0]
	if !reflect.DeepEqual(got.Primitives, []string{"Read", "Grep"}) ||
		got.Cwd != "/work/checkout" || got.Model != "m1" || got.Effort != "high" ||
		got.Timeout != 20*time.Minute || got.ResumeSessionID != "" || string(got.OutputSchema) != schema {
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
	if record.Plan == nil || !reflect.DeepEqual(record.Plan.Withheld, []string{"repository.diff"}) ||
		record.Runtime.Version != "1.2.3" || record.Inputs[0].Identity != "sha-HEAD" || !record.Inputs[0].Revision {
		t.Fatalf("record = %+v", record)
	}
	// The agent profile the call ran as: what the agent asked for, kept
	// apart from the model the runtime reports.
	if record.Profile == nil || *record.Profile != (run.Profile{Model: "m1", Effort: "high", Session: definition.SessionFresh}) {
		t.Fatalf("profile = %+v", record.Profile)
	}
	order := strings.Join(h.recorder.kinds(), " ")
	if order != "CALL_SUBMITTED PLANNED PERMISSIONS_WITHHELD PROCESS_STARTED CALL_FINISHED" {
		t.Fatalf("events = %s", order)
	}
	if !reflect.DeepEqual(h.recorder.raw, []string{`{"raw":true}`}) {
		t.Fatalf("raw = %v", h.recorder.raw)
	}
}

func TestNodeStatusFollowsTheResponses(t *testing.T) {
	t.Parallel()
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
			t.Parallel()
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
	t.Parallel()
	h := newHarness()
	clock := &steppingClock{now: time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)}
	h.clock = clock
	h.calls = h.callsOn(h.defs)
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
	t.Parallel()
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

// The shipped ask, review and implement processes and their read-only,
// static-review and implement policies set no cost limit, so a runtime that
// cannot enforce one runs them.
func TestShippedProcessesRunOnARuntimeWithoutACostLimit(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		process, policy, agent string
		params                 map[string]string
		output                 string
	}{
		{"ask", "read-only", "assistant", map[string]string{"question": "What is a.txt?"}, `"an answer"`},
		{"adversarial_review", "static-review", "reviewer", nil, `{"outcome":"no"}`},
		{"architecture_review", "static-review", "reviewer", map[string]string{"architecture": "docs/architecture.md"}, `{"outcome":"no"}`},
		{"implement", "implement", "assistant", map[string]string{"brief": "brief.md"}, `"done"`},
	} {
		t.Run(c.process, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			for kind, name := range map[definition.Kind]string{definition.KindProcess: c.process, definition.KindPolicy: c.policy} {
				data, err := fs.ReadFile(examples.Settings(), string(kind)+"/"+name+".yaml")
				if err != nil {
					t.Fatal(err)
				}
				h.defs.docs[kind][name] = string(data)
			}
			service, err := fs.ReadFile(examples.Settings(), "service.toml")
			if err != nil {
				t.Fatal(err)
			}
			h.defs.docs[definition.KindService]["service"] = string(service)
			h.defs.docs[definition.KindAgent][c.agent] = strings.Replace(h.defs.docs[definition.KindAgent]["a"], `name = "a"`, `name = "`+c.agent+`"`, 1)
			if c.agent == "assistant" {
				// Resumable, as the shipped assistant is: implement's
				// verification repairs in the call's session.
				h.defs.docs[definition.KindAgent][c.agent] += "session = \"resumable\"\n"
			}
			h.defs.docs[definition.KindSchema]["review-result"] = schema
			// The verification the shipped implement names.
			repo, err := fs.ReadFile(examples.Settings(), "verifies/repo.yaml")
			if err != nil {
				t.Fatal(err)
			}
			h.defs.docs[definition.KindVerify] = map[string]string{"repo": string(repo)}
			h.runner.identity.CostLimit = false
			h.runner.turn.Output = json.RawMessage(c.output)
			record := h.call(t, contract.CallRequest{Process: c.process, Params: c.params})
			if record.Result.Status != run.Completed || record.Effective.MaxCostUSD != nil || h.runner.calls()[0].MaxCostUSD != nil {
				t.Fatalf("result %+v, effective cost limit %v", record.Result, record.Effective.MaxCostUSD)
			}
		})
	}
}

// The shipped read-only policy allows everything Codex's read-only sandbox
// grants under contract codex/2, but the shipped service treats reading the
// host as state-reaching, so the shipped ask is refused on a Codex agent,
// naming host.read. A service configured to accept host reads, as a
// repository that runs Codex must, lets it complete.
func TestShippedAskRunsOnACodexRuntime(t *testing.T) {
	t.Parallel()
	const shipped = `state_reaching = ["host.read", "host.write"]`

	t.Run("shipped service", func(t *testing.T) {
		t.Parallel()
		h, record := askOnCodex(t, func(service string) string {
			if !strings.Contains(service, shipped) {
				t.Fatal("the shipped service's state_reaching line was not found")
			}
			return service
		})
		if record.Result.Status != run.Failed || class(record) != run.ClassRefused || !strings.Contains(message(record), "host.read") {
			t.Fatalf("result = %+v, error %q", record.Result, message(record))
		}
		if calls := h.runner.calls(); len(calls) != 0 {
			t.Fatalf("the runtime was called: %+v", calls)
		}
	})

	t.Run("configured service", func(t *testing.T) {
		t.Parallel()
		h, record := askOnCodex(t, func(service string) string {
			accepting := strings.Replace(service, shipped, `state_reaching = []`, 1)
			if accepting == service {
				t.Fatal("the shipped service's state_reaching line was not found")
			}
			return accepting
		})
		if record.Result.Status != run.Completed {
			t.Fatalf("result = %+v, error %q", record.Result, message(record))
		}
		if !reflect.DeepEqual(h.runtimes.asked, []string{"spy|/bin/codex"}) {
			t.Fatalf("runtimes asked = %v", h.runtimes.asked)
		}
		if got := h.runner.calls()[0].Primitives; !reflect.DeepEqual(got, []string{"read-only"}) {
			t.Fatalf("primitives = %v", got)
		}
		if len(record.Plan.Withheld) != 0 {
			t.Fatalf("withheld = %v", record.Plan.Withheld)
		}
	})
}

// askOnCodex runs the shipped ask under the shipped read-only policy on a
// Codex agent, with the shipped service as configure returns it, and
// returns the harness and the call's record.
func askOnCodex(t *testing.T, configure func(service string) string) (*harness, run.Record) {
	t.Helper()
	h := newHarness()
	for kind, name := range map[definition.Kind]string{definition.KindProcess: "ask", definition.KindPolicy: "read-only"} {
		data, err := fs.ReadFile(examples.Settings(), string(kind)+"/"+name+".yaml")
		if err != nil {
			t.Fatal(err)
		}
		h.defs.docs[kind][name] = string(data)
	}
	service, err := fs.ReadFile(examples.Settings(), "service.toml")
	if err != nil {
		t.Fatal(err)
	}
	h.defs.docs[definition.KindService]["service"] = configure(string(service))
	h.defs.docs[definition.KindRuntime]["codex"] = `schema: agister.runtime/v1alpha1
name: codex
adapter: spy
contract: codex/2
efforts: [high]
primitives:
  select: one
  items:
    read-only:
      grants: [repository.read, repository.search, repository.diff, repository.history.read, process.execute, host.read]
      verified: ["0.159."]
    workspace-write:
      grants: [repository.read, repository.search, repository.diff, repository.history.read, process.execute, host.read,
               repository.write, host.write]
      verified: ["0.159."]
`
	h.defs.docs[definition.KindAgent]["codex-agent"] = `schema = "agister.agent/v1alpha1"
name = "codex-agent"
runtime = "codex"
model = "m1"
model_family = "openai"
effort = "high"
command = "/bin/codex"
`
	h.runner.identity = app.RuntimeIdentity{Contract: "codex/2", Version: "0.159.2", Resume: true}
	h.runner.turn.Output = json.RawMessage(`"an answer"`)

	return h, h.call(t, contract.CallRequest{Process: "ask", Agent: "codex-agent", Params: map[string]string{"question": "What is a.txt?"}})
}

// The example Codex review's sandboxed-review policy allows everything
// Codex's read-only sandbox grants under contract codex/2, so, as with the
// shipped ask, the shipped service refuses it on the example agent, naming
// host.read, and a service that opts in to host reads, as its README
// documents, lets it complete in the read-only sandbox.
func TestExampleCodexReviewRunsOnACodexRuntime(t *testing.T) {
	t.Parallel()
	const shipped = `state_reaching = ["host.read", "host.write"]`

	t.Run("shipped service", func(t *testing.T) {
		t.Parallel()
		h, record := reviewOnCodex(t, func(service string) string {
			if !strings.Contains(service, shipped) {
				t.Fatal("the shipped service's state_reaching line was not found")
			}
			return service
		})
		if record.Result.Status != run.Failed || class(record) != run.ClassRefused || !strings.Contains(message(record), "host.read") {
			t.Fatalf("result = %+v, error %q", record.Result, message(record))
		}
		if calls := h.runner.calls(); len(calls) != 0 {
			t.Fatalf("the runtime was called: %+v", calls)
		}
	})

	t.Run("opted-in service", func(t *testing.T) {
		t.Parallel()
		h, record := reviewOnCodex(t, func(service string) string {
			accepting := strings.Replace(service, shipped, `state_reaching = []`, 1)
			if accepting == service {
				t.Fatal("the shipped service's state_reaching line was not found")
			}
			return accepting
		})
		if record.Result.Status != run.Completed {
			t.Fatalf("result = %+v, error %q", record.Result, message(record))
		}
		if got := h.runner.calls()[0].Primitives; !reflect.DeepEqual(got, []string{"read-only"}) {
			t.Fatalf("primitives = %v", got)
		}
		if len(record.Plan.Withheld) != 0 {
			t.Fatalf("withheld = %v", record.Plan.Withheld)
		}
	})
}

// reviewOnCodex runs the example adversarial_review_sandboxed with its
// policy, agent and runtime from examples/codex, the runtime on the spy
// adapter and verified for the spy's version, under the shipped service as
// configure returns it, and returns the harness and the call's record.
func reviewOnCodex(t *testing.T, configure func(service string) string) (*harness, run.Record) {
	t.Helper()
	h := newHarness()
	codex := os.DirFS("../../examples/codex")
	read := func(files fs.FS, path string) string {
		data, err := fs.ReadFile(files, path)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	h.defs.docs[definition.KindProcess]["adversarial_review_sandboxed"] = read(codex, "processes/adversarial_review_sandboxed.yaml")
	h.defs.docs[definition.KindPolicy]["sandboxed-review"] = read(codex, "policies/sandboxed-review.yaml")
	h.defs.docs[definition.KindAgent]["codex-reviewer"] = read(codex, "agents/codex-reviewer.toml")
	h.defs.docs[definition.KindSchema]["review-result"] = schema
	h.defs.docs[definition.KindService]["service"] = configure(read(examples.Settings(), "service.toml"))

	runtime := read(codex, "runtimes/codex.yaml")
	for _, edit := range [][2]string{
		{"adapter: codex\n", "adapter: spy\n"},
		{"\n    workspace-write:", "\n      verified: [\"0.159.\"]\n    workspace-write:"},
	} {
		if !strings.Contains(runtime, edit[0]) {
			t.Fatalf("%q was not found in the example runtime", edit[0])
		}
		runtime = strings.Replace(runtime, edit[0], edit[1], 1)
	}
	h.defs.docs[definition.KindRuntime]["codex"] = runtime + "      verified: [\"0.159.\"]\n"

	h.runner.identity = app.RuntimeIdentity{Contract: "codex/2", Version: "0.159.2", Resume: true}
	return h, h.call(t, contract.CallRequest{Process: "adversarial_review_sandboxed"})
}

func TestContinuationResumesAFinishedRunsSession(t *testing.T) {
	t.Parallel()
	resumable := func(h *harness) {
		h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	}
	finished := time.Date(2026, 9, 28, 11, 0, 0, 0, time.UTC)
	earlier := run.Record{ID: "run-0", Agent: "a", Runtime: &run.Runtime{Adapter: "spy"}, FinishedAt: &finished,
		Result: &run.Result{Status: run.Interrupted, Session: &run.Session{ProviderSessionID: "prov-0"}}}

	h := newHarness()
	resumable(h)
	h.runs.records["run-0"], h.runs.states["run-0"] = earlier, run.StateFinished
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if len(h.runner.calls()) != 1 {
		t.Fatalf("result %+v", record.Result.Error)
	}
	got := h.runner.calls()[0]
	// The earlier session is resumed in place, by the ID it reported.
	if got.ResumeSessionID != "prov-0" || record.Result.Session.Continues != "run-0" || record.Request.Continue != "run-0" {
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
			t.Parallel()
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

// A runtime that resumes a session only in the directory it ran in cannot
// continue a run anywhere else: not in a checkout made for the call, nor
// from another directory. Each is refused before any workspace is made;
// from the directory the run worked in, the session is resumed there.
func TestContinuationWhereTheSessionDidNotRunIsRefused(t *testing.T) {
	t.Parallel()
	// run-0 left its session's evidence: it worked in checkout A.
	ended := fixedClock{}.Now()
	earlier := run.Record{ID: "run-0", Agent: "a", Runtime: &run.Runtime{Adapter: "spy"}, Workspace: "/work/checkout-a",
		FinishedAt: &ended, Turn: &run.Turn{ProviderSessionID: "prov-0"},
		Result: &run.Result{Status: run.Completed, Session: &run.Session{ProviderSessionID: "prov-0"}}}
	arrange := func(workspace string, checkout bool) *harness {
		h := newHarness()
		h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
		h.runner.identity.ResumeWhereItRan = true
		if !checkout {
			h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "workspace:\n  checkout: candidate_revision\n", "", 1)
			h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "scope: candidate", "scope: repository", 1)
		}
		prior := earlier
		prior.Workspace = workspace
		h.runs.records["run-0"], h.runs.states["run-0"] = prior, run.StateFinished
		return h
	}
	for _, c := range []struct {
		name      string
		workspace string
		checkout  bool
		reason    string
	}{
		{"a checkout of its own", "/work/checkout-a", true, "runtime rt resumes a session only in the directory it ran in, and process p works in a checkout of its own; it cannot continue run run-0"},
		{"another directory", "/elsewhere", false, "runtime rt resumes a session only in the directory it ran in: run run-0 worked in /elsewhere, not /repo"},
		{"no directory recorded", "", false, "run run-0 recorded none"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := arrange(c.workspace, c.checkout)
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.reason) {
				t.Fatalf("result %+v, want refusal %q", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
				t.Fatalf("turns %d, checkouts %v before the refusal", len(h.runner.calls()), h.workspaces.checkouts)
			}
		})
	}

	h := arrange("/repo", false)
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if len(h.runner.calls()) != 1 {
		t.Fatalf("result %+v", record.Result.Error)
	}
	if got := h.runner.calls()[0]; got.ResumeSessionID != "prov-0" || got.Cwd != "/repo" || len(h.workspaces.checkouts) != 0 {
		t.Fatalf("request %+v, checkouts %v", got, h.workspaces.checkouts)
	}
}

// A continuation's turn costs and uses what it added to its session's
// totals: the totals less those of the session's latest turn Agister
// recorded on any run, a later continuation of the run continued included.
// Unknown when Agister recorded no totals for the session, or when a later
// continuation started its runtime process and was reaped before its turn
// was saved; a refused continuation leaves them as they were.
func TestAContinuationCostsWhatItAddedToItsSession(t *testing.T) {
	t.Parallel()
	usd := func(v float64) *float64 { return &v }
	n := func(v int64) *int64 { return &v }
	at := func(minute int) *time.Time {
		moment := time.Date(2026, 9, 28, 11, minute, 0, 0, time.UTC)
		return &moment
	}
	// run-0 started prov-0; run-0b continued it, after it.
	recorded := func(id, continues string, created, finished int, totals *run.SessionTotals) run.Record {
		return run.Record{ID: id, Agent: "a", Runtime: &run.Runtime{Adapter: "spy"}, Request: run.Request{Continue: continues},
			CreatedAt: *at(created), FinishedAt: at(finished), Turn: &run.Turn{ProviderSessionID: "prov-0", Session: totals},
			Result: &run.Result{Status: run.Completed, Session: &run.Session{ProviderSessionID: "prov-0", Continues: continues}}}
	}
	// run-0b continued run-0; it ran no turn, and either started its
	// runtime process and was reaped, or was refused before it.
	unturned := func(process bool) run.Record {
		record := run.Record{ID: "run-0b", Agent: "a", Runtime: &run.Runtime{Adapter: "spy"}, Request: run.Request{Continue: "run-0"},
			CreatedAt: *at(2), FinishedAt: at(3), Result: &run.Result{Status: run.Failed}}
		if process {
			result := run.AbandonedResult(record.CreatedAt)
			record.Effects, record.Result = &run.Effects{Process: &run.Process{Ref: "ref-0b"}}, &result
		}
		return record
	}
	cases := []struct {
		name    string
		records []run.Record
		before  *run.SessionTotals // recorded as the session's before the turn
		want    *run.SessionTotals // the turn's own; nil: unknown
	}{
		{"continued run's own totals", []run.Record{
			recorded("run-0", "", 0, 1, &run.SessionTotals{CostUSD: usd(7.75), Usage: &run.Usage{InputTokens: n(100)}}),
		}, &run.SessionTotals{CostUSD: usd(7.75), Usage: &run.Usage{InputTokens: n(100)}},
			&run.SessionTotals{CostUSD: usd(4.75), Usage: &run.Usage{InputTokens: n(150)}}},
		{"a later continuation's totals", []run.Record{
			recorded("run-0", "", 0, 1, &run.SessionTotals{CostUSD: usd(7.75), Usage: &run.Usage{InputTokens: n(100)}}),
			recorded("run-0b", "run-0", 2, 3, &run.SessionTotals{CostUSD: usd(11.5), Usage: &run.Usage{InputTokens: n(200)}}),
		}, &run.SessionTotals{CostUSD: usd(11.5), Usage: &run.Usage{InputTokens: n(200)}},
			&run.SessionTotals{CostUSD: usd(1), Usage: &run.Usage{InputTokens: n(50)}}},
		{"no recorded totals", []run.Record{recorded("run-0", "", 0, 1, nil)}, nil, nil},
		{"a refused continuation", []run.Record{
			recorded("run-0", "", 0, 1, &run.SessionTotals{CostUSD: usd(7.75), Usage: &run.Usage{InputTokens: n(100)}}),
			unturned(false),
		}, &run.SessionTotals{CostUSD: usd(7.75), Usage: &run.Usage{InputTokens: n(100)}},
			&run.SessionTotals{CostUSD: usd(4.75), Usage: &run.Usage{InputTokens: n(150)}}},
		{"a continuation reaped before its turn was saved", []run.Record{
			recorded("run-0", "", 0, 1, &run.SessionTotals{CostUSD: usd(7.75), Usage: &run.Usage{InputTokens: n(100)}}),
			unturned(true),
		}, nil, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
			for _, record := range c.records {
				h.runs.records[record.ID], h.runs.states[record.ID] = record, run.StateFinished
			}
			h.runner.turn = run.Turn{Status: run.Completed, Output: json.RawMessage(`{}`), ProviderSessionID: "prov-0",
				Session: &run.SessionTotals{CostUSD: usd(12.5), Usage: &run.Usage{InputTokens: n(250)}}}
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if record.Result.Status != run.Completed || *record.Turn.Session.CostUSD != 12.5 || !reflect.DeepEqual(record.Turn.SessionBefore, c.before) {
				t.Fatalf("result %+v, turn %+v", record.Result, record.Turn)
			}
			if c.want == nil {
				if record.Turn.CostUSD != nil || record.Turn.Usage.InputTokens != nil || record.Result.Cost.Source != run.CostUnknown || record.Result.Cost.USD != nil {
					t.Fatalf("turn cost %v, usage %+v, call cost %+v", record.Turn.CostUSD, record.Turn.Usage, record.Result.Cost)
				}
				return
			}
			if *record.Turn.CostUSD != *c.want.CostUSD || *record.Turn.Usage.InputTokens != *c.want.Usage.InputTokens ||
				record.Result.Cost.Source != run.CostRuntime || *record.Result.Cost.USD != *c.want.CostUSD || *record.Result.Usage.InputTokens != *c.want.Usage.InputTokens {
				t.Fatalf("turn cost %v, usage %+v, call cost %+v", *record.Turn.CostUSD, record.Turn.Usage, record.Result.Cost)
			}
		})
	}
}

// carrying is a harness whose agent resumes sessions and whose process p
// runs a setup in its checkout, with an empty order of what happened.
func carrying() (*harness, *[]string) {
	h := newHarness()
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	ownSetup(h)
	order := new([]string)
	h.changes.applying = func(check bool) error {
		*order = append(*order, map[bool]string{true: "check", false: "apply"}[check])
		return nil
	}
	h.setup.running = func(app.SetupCommandRequest) { *order = append(*order, "setup") }
	h.runner.during = func(app.TurnRequest) { *order = append(*order, "turn") }
	return h, order
}

// patchedRun records a finished run of p in session prov-0, created and
// finished at those minutes, that hit a rate limit in a checkout of /repo
// at sha-HEAD and kept patch as its changes; none when patch is empty.
func patchedRun(h *harness, id, continues string, created, finished int, patch string) run.Record {
	at := func(minute int) time.Time { return time.Date(2026, 9, 28, 11, minute, 0, 0, time.UTC) }
	end := at(finished)
	record := run.Record{ID: id, Process: "p", Agent: "a", Runtime: &run.Runtime{Adapter: "spy"},
		Request:   run.Request{Process: "p", Continue: continues, Cwd: "/repo"},
		CreatedAt: at(created), FinishedAt: &end,
		Inputs:  []run.Input{{Name: "candidate_revision", Source: "git.revision", Identity: "sha-HEAD", Revision: true}},
		Effects: &run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: "/work/checkout-" + id, Revision: "sha-HEAD"}},
		Turn:    &run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"), ProviderSessionID: "prov-0"},
		Result: &run.Result{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"),
			Session: &run.Session{ProviderSessionID: "prov-0", Continues: continues}},
	}
	record.Definitions = []run.DefinitionSource{{Kind: string(definition.KindProcess), Name: "p", SHA256: sha(h.defs.docs[definition.KindProcess]["p"])}}
	if patch != "" {
		record.Result.Artifacts = []run.Artifact{h.runs.store(id, "changes.patch", []byte(patch))}
	}
	h.runs.records[id], h.runs.states[id] = record, run.StateFinished
	return record
}

// A continuation with a checkout carries the changes.patch of its session's
// latest run (ADR-013): checked before the setup, applied after it, before
// the first turn, whose prompt says so; the run's events record it. The
// call's own patch is still from the revision.
func TestAContinuationCarriesTheLatestRunsChanges(t *testing.T) {
	t.Parallel()
	h, order := carrying()
	patchedRun(h, "run-0", "", 0, 1, "diff A\n")
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 {
		t.Fatalf("result %+v", record.Result)
	}
	if want := []string{"check", "setup", "apply", "turn"}; !reflect.DeepEqual(*order, want) {
		t.Fatalf("order %v, want %v", *order, want)
	}
	if want := []appliedPatch{{"/work/checkout", "diff A\n", true}, {"/work/checkout", "diff A\n", false}}; !reflect.DeepEqual(h.changes.applies(), want) {
		t.Fatalf("applied %+v", h.changes.applies())
	}
	got := h.runner.calls()[0]
	notice := prompt.Continues("run-0", "run-0", "/work/checkout", "sha-HEAD")
	if got.ResumeSessionID != "prov-0" || !strings.HasPrefix(got.Prompt, notice+"\n\n## candidate_revision") || strings.Contains(got.Instruction, "continues") {
		t.Fatalf("request %+v", got)
	}
	var carried *run.Event
	for i, event := range h.recorder.events {
		if event.Kind == "CHANGES_CARRIED" {
			carried = &h.recorder.events[i]
		}
	}
	artifact := h.runs.records["run-0"].Result.Artifacts[0]
	if carried == nil || carried.Data["run"] != "run-0" || carried.Data["digest"] != artifact.Digest || carried.Data["bytes"] != artifact.Bytes {
		t.Fatalf("events %+v", h.recorder.events)
	}
	// The call's own changes, asked last, after the setup's, are from the
	// revision: they hold the carried ones once.
	if changed := h.changes.changed; changed[len(changed)-1] != [2]string{"/work/checkout", "sha-HEAD"} {
		t.Fatalf("changes asked %v", changed)
	}

	// An older record names no revision: the input its process checked out
	// does, when it ran the same process.
	h, order = carrying()
	legacy := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
	legacy.Effects.Checkout.Revision = ""
	h.runs.records["run-0"] = legacy
	if record := h.call(t, contract.CallRequest{Continue: "run-0"}); record.Result.Status != run.Completed || len(h.changes.applies()) != 2 {
		t.Fatalf("result %+v, applied %+v", record.Result, h.changes.applies())
	}
}

// A continuation keeps the changes of its session so far: the patch it
// stores, from the revision, holds the carried changes and its turn's,
// each once.
func TestAContinuationStoresItsChangesWithTheCarriedOnes(t *testing.T) {
	t.Parallel()
	h, _ := carrying()
	patchedRun(h, "run-0", "", 0, 1, "+A\n")
	// The checkout holds what was applied to it and what the turn added,
	// and its content is named apart at each step: the revision's, the
	// carried changes', the turn's.
	var content string
	var carried, turned bool
	ordered := h.changes.applying
	h.changes.applying = func(check bool) error {
		carried = carried || !check
		return ordered(check)
	}
	h.runner.during = func(app.TurnRequest) {
		for _, applied := range h.changes.applies() {
			if !applied.check {
				content += applied.patch
			}
		}
		content += "+B\n"
		turned = true
	}
	h.changes.identify = func() string {
		switch {
		case turned:
			return "tree-turned"
		case carried:
			return "tree-carried"
		}
		return "tree"
	}
	// Only the revision against the content the turn left is the
	// cumulative patch; a snapshot taken before the turn is not.
	h.changes.patch = func(from, to string) []byte {
		switch {
		case from == "sha-HEAD" && to == "tree":
			return nil
		case from == "sha-HEAD" && to == "tree-turned":
			return []byte(content)
		}
		return []byte("from " + from + " to " + to)
	}
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	stored := string(h.recorder.artifacts["changes.patch"])
	if record.Result.Status != run.Completed || stored != "+A\n+B\n" {
		t.Fatalf("result %+v, patch %q", record.Result, stored)
	}
	if artifacts := record.Result.Artifacts; len(artifacts) != 1 || artifacts[0].Name != "changes.patch" || artifacts[0].Bytes != int64(len(stored)) {
		t.Fatalf("artifacts %+v", artifacts)
	}
}

// The changes carried are the session's latest run's: continuing a
// continuation carries that run's patch alone, which holds the earlier
// one's; continuing the first run again, after the session moved on,
// carries the later run's too (D-6).
func TestAContinuationCarriesTheSessionsLatestPatch(t *testing.T) {
	t.Parallel()
	for _, continued := range []string{"run-0b", "run-0"} {
		t.Run(continued, func(t *testing.T) {
			t.Parallel()
			h, _ := carrying()
			patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			patchedRun(h, "run-0b", "run-0", 2, 3, "diff AB\n")
			record := h.call(t, contract.CallRequest{Continue: continued})
			if record.Result.Status != run.Completed {
				t.Fatalf("result %+v", record.Result)
			}
			if want := []appliedPatch{{"/work/checkout", "diff AB\n", true}, {"/work/checkout", "diff AB\n", false}}; !reflect.DeepEqual(h.changes.applies(), want) {
				t.Fatalf("applied %+v", h.changes.applies())
			}
			if !reflect.DeepEqual(h.runs.read, []string{"run-0b/artifacts/changes.patch"}) {
				t.Fatalf("read %v", h.runs.read)
			}
			if notice := prompt.Continues(continued, "run-0b", "/work/checkout", "sha-HEAD"); !strings.HasPrefix(h.runner.calls()[0].Prompt, notice) {
				t.Fatalf("prompt %q", h.runner.calls()[0].Prompt)
			}
		})
	}
}

// A latest run that worked in no checkout, or kept no patch, carries
// nothing: the call runs on the revision, and is told so.
func TestAContinuationWithNothingToCarryRuns(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name    string
		arrange func(*harness)
	}{
		{"no checkout", func(h *harness) {
			prior := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			prior.Effects = nil
			h.runs.records["run-0"] = prior
		}},
		{"no patch", func(h *harness) { patchedRun(h, "run-0", "", 0, 1, "") }},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, order := carrying()
			c.arrange(h)
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if record.Result.Status != run.Completed || len(h.changes.applies()) != 0 || !reflect.DeepEqual(*order, []string{"setup", "turn"}) {
				t.Fatalf("result %+v, applied %+v, order %v", record.Result, h.changes.applies(), *order)
			}
			if notice := prompt.Continues("run-0", "", "/work/checkout", "sha-HEAD"); !strings.HasPrefix(h.runner.calls()[0].Prompt, notice) {
				t.Fatalf("prompt %q", h.runner.calls()[0].Prompt)
			}
			if contains(h.recorder.kinds(), "CHANGES_CARRIED") {
				t.Fatalf("events %v", h.recorder.kinds())
			}
		})
	}
}

// Changes that cannot be carried refuse the call before any turn, and
// before the checkout is made where that can be told without it; a patch
// that does not apply costs no setup. The checkout is released either way.
func TestAContinuationWhoseChangesCannotBeCarriedIsRefused(t *testing.T) {
	t.Parallel()
	failing := func(when bool) func(*harness) {
		return func(h *harness) {
			patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			applying := h.changes.applying
			h.changes.applying = func(check bool) error {
				if err := applying(check); err != nil || check != when {
					return err
				}
				return errors.New("patch failed: a.txt:1")
			}
		}
	}
	prior := func(change func(*run.Record)) func(*harness) {
		return func(h *harness) {
			record := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			change(&record)
			h.runs.records["run-0"] = record
		}
	}
	for _, c := range []struct {
		name    string
		arrange func(*harness)
		reason  string
		order   []string // what happened; a checkout was made when set
	}{
		{"a patch that does not apply", failing(true),
			"run run-0's changes do not apply to revision sha-HEAD: patch failed: a.txt:1", []string{"check"}},
		{"a patch that fails to apply", failing(false),
			"run run-0's changes could not be applied to revision sha-HEAD: patch failed: a.txt:1", []string{"check", "setup", "apply"}},
		{"another revision", prior(func(r *run.Record) { r.Effects.Checkout.Revision = "sha-other" }),
			"run run-0's changes are from revision sha-other, not sha-HEAD", nil},
		{"another repository", prior(func(r *run.Record) { r.Effects.Checkout.Repository = "/other" }),
			"run run-0's changes are of repository /other, not /repo; a continuation carries them only into the same repository", nil},
		{"another stored repository identity", prior(func(r *run.Record) { r.Effects.Checkout.RepositoryIdentity = "/other" }),
			"run run-0's changes are of repository /other, not /repo; a continuation carries them only into the same repository", nil},
		{"an older record of another process", prior(func(r *run.Record) {
			r.Effects.Checkout.Revision, r.Request.Process, r.Process = "", "q", "q"
		}), "the revision run run-0 worked on is unknown", nil},
		{"a patch whose digest does not match", prior(func(r *run.Record) { r.Result.Artifacts[0].Digest = "sha256:recorded" }),
			"run run-0's changes.patch is sha256:" + sha("diff A\n") + ", not sha256:recorded as recorded", nil},
		{"a patch that cannot be read", prior(func(r *run.Record) { r.Result.Artifacts[0].Path = "artifacts/gone.patch" }),
			"run run-0's changes.patch cannot be read: no artifact artifacts/gone.patch", nil},
		{"latest run has another revision", func(h *harness) {
			patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			later := patchedRun(h, "run-0b", "run-0", 2, 3, "diff AB\n")
			later.Effects.Checkout.Revision = "sha-other"
			h.runs.records[later.ID] = later
		}, "run run-0b's changes are from revision sha-other, not sha-HEAD", nil},
		{"latest run has another repository", func(h *harness) {
			patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			later := patchedRun(h, "run-0b", "run-0", 2, 3, "diff AB\n")
			later.Effects.Checkout.Repository = "/other"
			h.runs.records[later.ID] = later
		}, "run run-0b's changes are of repository /other, not /repo; a continuation carries them only into the same repository", nil},
		{"overlapping finished runs", func(h *harness) {
			patchedRun(h, "run-0", "", 0, 3, "diff A\n")
			patchedRun(h, "run-0b", "run-0", 2, 4, "diff AB\n")
		}, "the latest run of run run-0's session is unknown", nil},
		{"a run of the session still running", func(h *harness) {
			patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			later := patchedRun(h, "run-0b", "run-0", 2, 3, "diff AB\n")
			later.FinishedAt, later.Result = nil, nil
			h.runs.records["run-0b"], h.runs.states["run-0b"] = later, run.StateRunning
		}, "the latest run of run run-0's session is unknown", nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, order := carrying()
			c.arrange(h)
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.reason) || !contains(h.recorder.kinds(), "REFUSED") {
				t.Fatalf("result %+v, want refusal %q", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 || !reflect.DeepEqual(*order, c.order) {
				t.Fatalf("turns %d, order %v, want %v", len(h.runner.calls()), *order, c.order)
			}
			if checkouts := len(h.workspaces.checkouts); checkouts != h.workspaces.releases() || (checkouts == 1) != (c.order != nil) {
				t.Fatalf("checkouts %v, released %d", h.workspaces.checkouts, h.workspaces.releases())
			}
			if c.order == nil && (len(h.workspaces.checkouts) != 0 || len(h.setup.runs()) != 0 || len(h.changes.applies()) != 0 || record.Effects != nil) {
				t.Fatalf("checkouts %v, setup %v, applied %v, effects %+v", h.workspaces.checkouts, h.setup.runs(), h.changes.applies(), record.Effects)
			}
			if len(record.Result.Artifacts) != 0 || contains(h.recorder.kinds(), "CHANGES_CARRIED") {
				t.Fatalf("artifacts %+v, events %v", record.Result.Artifacts, h.recorder.kinds())
			}
		})
	}
}

func TestWorkspaceChangesBecomeArtifacts(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.changes.changes = []byte("diff --git a/x b/x\n")
	h.recorder.onFinish = func() int { return h.workspaces.releases() }
	record := h.call(t, contract.CallRequest{})
	if !reflect.DeepEqual(h.changes.changed, [][2]string{{"/work/checkout", "sha-HEAD"}}) || string(h.recorder.artifacts["changes.patch"]) != "diff --git a/x b/x\n" {
		t.Fatalf("changes asked %v, stored %v", h.changes.changed, h.recorder.artifacts)
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
	h.changes.changeErr = errors.New("git broke")
	if record := h.call(t, contract.CallRequest{}); record.Result.Status != run.Completed || !contains(h.recorder.kinds(), "ARTIFACT_FAILED") {
		t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
	}

	// A workspace the call does not own is the caller's; its changes are not taken.
	h = newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "workspace:\n  checkout: candidate_revision\n", "", 1)
	h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "scope: candidate", "scope: repository", 1)
	h.changes.changes = []byte("x")
	if record := h.call(t, contract.CallRequest{}); record.Result.Status != run.Completed || len(h.changes.changed) != 0 {
		t.Fatalf("result %+v, changes asked %v", record.Result, h.changes.changed)
	}
}

// A panic while collecting changes finishes the record as internal and
// still releases the workspace; collection is not retried.
func TestPanicInChangeCollectionFinishesTheRecord(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.changes.panics = true
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassInternal || !strings.Contains(message(record), "changes exploded") {
		t.Fatalf("result = %+v", record.Result.Error)
	}
	if len(h.changes.changed) != 1 || h.workspaces.releases() != 1 {
		t.Fatalf("changes asked %d times, released %d", len(h.changes.changed), h.workspaces.releases())
	}
}

// A call is resolved through the resolution role it declares, not through
// the concrete Resolver: a double that is no Resolver stands in for it, is
// snapshotted once, at submit, and resolves the call from that snapshot. A
// refusal it gives is recorded and no runtime is asked for.
func TestCallsResolveThroughTheResolutionTheyDeclare(t *testing.T) {
	t.Parallel()
	h := newHarness()
	double := &snapshotCounter{reason: "the double refuses"}
	h.calls = app.NewCalls(
		double, h.runtimes, map[string]app.InputProvider{}, h.workspaces, h.changes, app.NewPreparer(h.changes, h.setup, h.clock), app.NewVerifier(h.changes, h.copies, h.commands, h.clock),
		h.validator, h.recorder, h.runs, h.clock, h.timer, fixedIDs{}, "/state", h.hosted,
	)
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || message(record) != "the double refuses" {
		t.Fatalf("result %+v", record.Result)
	}
	if snapshots, resolved := double.count(); snapshots != 1 || !reflect.DeepEqual(resolved, []string{"p"}) {
		t.Fatalf("snapshots %d, resolved %v", snapshots, resolved)
	}
	if len(h.runtimes.asked) != 0 || len(h.defs.reads) != 0 {
		t.Fatalf("runtimes asked %v, definitions read %v", h.runtimes.asked, h.defs.reads)
	}
}

// snapshotCounter is a CallResolver that is not a Resolver: it resolves
// every call to a refusal, and counts the snapshots it was asked for and the
// resolutions made from them.
type snapshotCounter struct {
	mu        sync.Mutex
	reason    string
	snapshots int
	resolved  []string // process names
}

func (c *snapshotCounter) Snapshot(context.Context) app.CallResolution {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.snapshots++
	return counted{c}
}

// count returns the snapshots taken and the processes resolved.
func (c *snapshotCounter) count() (int, []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.snapshots, append([]string(nil), c.resolved...)
}

type counted struct{ counter *snapshotCounter }

func (r counted) Resolve(_ context.Context, request app.CallResolveRequest) (*app.ResolvedCall, error) {
	r.counter.mu.Lock()
	defer r.counter.mu.Unlock()
	r.counter.resolved = append(r.counter.resolved, request.Process)
	return &app.ResolvedCall{}, &app.Refusal{Reason: r.counter.reason}
}

// Workflow finds none: every name is a process's.
func (r counted) Workflow(context.Context, string) (*app.ResolvedWorkflow, bool, error) {
	return nil, false, nil
}

// The runtime a call is resolved on is checked through the identity of its
// adapter and command, and the runner for the same adapter and command is
// asked for only when the call executes.
func TestCallChecksAndRunsTheRuntimeOfItsAgent(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.call(t, contract.CallRequest{})
	if want := []string{"spy|/bin/spy"}; !reflect.DeepEqual(h.runtimes.identified, want) || !reflect.DeepEqual(h.runtimes.asked, want) {
		t.Fatalf("identified %v, runner built for %v, want %v", h.runtimes.identified, h.runtimes.asked, want)
	}
}

// Each refusal is recorded, and nothing after the refusing check happens.
func TestRefusalsComeBeforeEffects(t *testing.T) {
	t.Parallel()
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
		{"runner cannot be built", func(h *harness) { h.runtimes.runnerErr = errors.New("no such command") }, contract.CallRequest{}, "runtime mapping rt: no such command", false},
		{"adapter contract mismatch", func(h *harness) { h.runner.identity.Contract = "spy/2" }, contract.CallRequest{}, "describes adapter contract spy/1, but the adapter implements spy/2", false},
		{"unverified version", func(h *harness) { h.runner.identity.Version = "2.0.0" }, contract.CallRequest{}, "verifies no primitive for spy version 2.0.0", false},
		{"caller widens timeout", nil, contract.CallRequest{Timeout: "2h"}, "caller timeout 2h0m0s widens the effective 20m0s", false},
		{"unknown param", nil, contract.CallRequest{Params: map[string]string{"focus": "x"}}, "takes no params: focus", false},
		{"input fails", func(h *harness) {
			h.inputs.respond = func(app.InputSpec) (app.Resolved, error) { return app.Resolved{}, errors.New("not a commit") }
		}, contract.CallRequest{}, "input candidate_revision: not a commit", false},
		{"workspace overlaps state", func(h *harness) { h.workspaces.root = "/state/repo" }, contract.CallRequest{}, "workspace /state/repo overlaps Agister's state /state", false},
		{"input uses a value with no text", func(h *harness) {
			h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], `head: "${param.candidate}"`, `head: "${value.candidate_revision}"`, 1)
			h.inputs.respond = func(app.InputSpec) (app.Resolved, error) {
				return app.Resolved{Value: []string{"a.go"}, Identity: "sha-x", Revision: true}, nil
			}
		}, contract.CallRequest{}, "input diff: refers to ${value.candidate_revision}, which has no text value", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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

// A runtime that reads skills only with some primitives refuses, before any
// effect, a call whose plan grants none of them, and says why each is
// missing (ADR-006).
func TestACallThatCannotReadASkillIsRefused(t *testing.T) {
	t.Parallel()
	widen := func(h *harness) {
		policy := h.defs.docs[definition.KindPolicy]["pol"]
		h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(policy, "repository.diff]", "repository.diff, process.execute, host.read]", 1)
	}
	unverified := func(h *harness) {
		mapping := h.defs.docs[definition.KindRuntime]["rt"]
		h.defs.docs[definition.KindRuntime]["rt"] = strings.Replace(mapping, "  items:\n", "  items:\n    Cat: {grants: [repository.read], verified: [\"2.\"]}\n", 1)
	}
	cases := []struct {
		name    string
		arrange func(*harness)
		tools   []string
		reason  string
	}{
		{"not allowed", nil, []string{"Bash"},
			"process p: runtime rt needs Bash to use the repository's skills (ADR-006), and the plan grants no such tool: Bash needs process.execute, host.read, which the effective permissions do not allow"},
		{"withheld", widen, []string{"Bash"},
			"process p: runtime rt needs Bash to use the repository's skills (ADR-006), and the plan grants no such tool: Bash needs host.read, which the plan withholds"},
		{"unverified or unknown", unverified, []string{"Cat", "Bash", "Head"},
			"process p: runtime rt needs Cat or Bash or Head to use the repository's skills (ADR-006), and the plan grants no such tool: " +
				"Cat is not verified for version 1.2.3; Bash needs process.execute, host.read, which the effective permissions do not allow; runtime mapping rt has no Head"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			if c.arrange != nil {
				c.arrange(h)
			}
			h.runner.identity.SkillTools = c.tools
			record := h.call(t, contract.CallRequest{})
			if class(record) != run.ClassRefused || message(record) != c.reason {
				t.Fatalf("result %+v\nwant refused: %s", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
				t.Fatal("the call went on after the refusal")
			}
			if kinds := h.recorder.kinds(); !contains(kinds, "REFUSED") {
				t.Fatalf("events = %v", kinds)
			}
		})
	}

	// One of them granted is enough.
	h := newHarness()
	h.runner.identity.SkillTools = []string{"Read", "Bash"}
	if record := h.call(t, contract.CallRequest{}); record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
}

func TestCancelInterruptsAndReleases(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.runner.block = true
	h.runner.started = make(chan struct{})
	runs := app.NewRuns(nil, nil, h.hosted, nil, 0)
	if _, err := h.calls.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	// However the test ends, the blocked turn does not outlive it.
	t.Cleanup(func() { _ = runs.Cancel(context.Background(), "run-1") })
	select {
	case <-h.runner.started:
	case record := <-h.recorder.finished:
		t.Fatalf("the call ended before its turn started: %+v", record.Result)
	}
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
	t.Parallel()
	h := newHarness()
	runs := app.NewRuns(nil, nil, h.hosted, nil, 0)
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

// Calls hold each running call's cancellation in the CallCancels they
// declare: the cancel added for a call cancels it, and a call that ended is
// no longer held.
func TestCallsCancelThroughTheCancelsTheyDeclare(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.runner.block = true
	h.runner.started = make(chan struct{})
	cancels := &cancelsSpy{held: map[string]func() bool{}, ended: make(chan string, 1)}
	h.calls = app.NewCalls(
		app.NewResolver(h.defs, h.runtimes, h.validator, resolverCheckStub{}), h.runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs},
		h.workspaces, h.changes, app.NewPreparer(h.changes, h.setup, h.clock), app.NewVerifier(h.changes, h.copies, h.commands, h.clock), h.validator, h.recorder, h.runs,
		h.clock, h.timer, fixedIDs{}, "/state", cancels,
	)
	// However the test ends, the blocked turn is released and the call
	// joined, even when no cancel was added for it.
	release := make(chan struct{})
	h.runner.release = release
	joined := false
	t.Cleanup(func() {
		close(release)
		if !joined {
			h.recorder.wait(t)
		}
	})
	if _, err := h.calls.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		joined = true // nothing was started
		t.Fatal(err)
	}
	cancel := cancels.cancel("run-1")
	if cancel == nil {
		t.Fatal("the call added no cancel")
	}
	select {
	case <-h.runner.started:
	case record := <-h.recorder.finished:
		joined = true
		t.Fatalf("the call ended before its turn started: %+v", record.Result)
	}
	if !cancel() {
		t.Fatal("the call's cancel did not take effect")
	}
	record := h.recorder.wait(t)
	joined = true
	if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled {
		t.Fatalf("result = %+v", record.Result)
	}
	if cancels.cancel("run-1") != nil || !contains(cancels.removals(), "run-1") {
		t.Fatalf("the ended call is still held; removed %v", cancels.removals())
	}
	if ended := <-cancels.ended; ended != "run-1" {
		t.Fatalf("ended %s", ended)
	}
}

// Done closes once a hosted call has finished: its record is finished and
// its cleanup attempted, a release that failed recorded on the run. It is
// not closed before, not even as the record is finished. Done of a call
// not running here is closed already.
func TestHostedDoneClosesOnceTheCallHasFinished(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.workspaces.releaseErr = errors.New("worktree busy")
	released := make(chan struct{})
	release := sync.OnceFunc(func() { close(released) })
	h.runner.block, h.runner.release, h.runner.started = true, released, make(chan struct{})
	doneAtFinish := true
	h.recorder.onFinish = func() int {
		doneAtFinish = isClosed(h.hosted.Done("run-1"))
		return h.workspaces.releases()
	}
	id, err := h.calls.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"})
	if err != nil {
		t.Fatal(err)
	}
	// However the test ends, the blocked turn is released and the call
	// joined: on its finished record, not on the Done the test is about.
	t.Cleanup(func() {
		release()
		if h.recorder.running() {
			h.recorder.wait(t)
		}
	})
	done := h.hosted.Done(id)
	<-h.runner.started
	if isClosed(done) {
		t.Fatal("done while the turn runs")
	}
	release()
	<-done
	record := h.recorder.wait(t)
	if doneAtFinish {
		t.Fatal("done before the record was finished")
	}
	if h.workspaces.releases() != 1 || !contains(h.recorder.kinds(), "WORKSPACE_RELEASE_FAILED") || record.Effects == nil || record.Effects.Unreleased == nil {
		t.Fatalf("released %d, events %v, effects %+v", h.workspaces.releases(), h.recorder.kinds(), record.Effects)
	}
	if !isClosed(h.hosted.Done(id)) || !isClosed(h.hosted.Done("never-hosted")) {
		t.Fatal("Done of a call not running here is not closed")
	}
}

// isClosed says whether ch is closed now, without waiting.
func isClosed(ch <-chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}

// cancelsSpy is a CallCancels that is not Hosted: it holds the cancel each
// call adds until the call removes it, and records the removals.
type cancelsSpy struct {
	mu      sync.Mutex
	held    map[string]func() bool
	removed []string
	// ended receives each call that ends.
	ended chan string
}

func (s *cancelsSpy) Add(id string, cancel func() bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.held[id] = cancel
}

func (s *cancelsSpy) Remove(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.held, id)
	s.removed = append(s.removed, id)
}

func (s *cancelsSpy) End(id string) { s.ended <- id }

// cancel is the cancel held for id; nil when none is.
func (s *cancelsSpy) cancel(id string) func() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.held[id]
}

func (s *cancelsSpy) removals() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.removed...)
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
	t.Parallel()
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

// The call's settings are read before its run is recorded, and the call,
// which resolves later in its own goroutine, uses exactly those: an edit
// after Submit returns changes nothing, and the live source is not read again.
func TestCallResolvesFromTheSettingsReadBeforeItsRunWasRecorded(t *testing.T) {
	t.Parallel()
	h := newHarness()
	readsAtCreate := -1
	h.recorder.onCreate = func() { readsAtCreate = h.defs.readCount() }
	h.recorder.hold = make(chan struct{})
	if _, err := h.calls.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	if readsAtCreate <= 0 {
		t.Fatalf("settings were not read before the run was recorded (%d reads)", readsAtCreate)
	}
	readsAtSubmit := h.defs.readCount()
	h.defs.set(definition.KindAgent, "a", strings.Replace(settingsDocs()[definition.KindAgent]["a"], "m1", "m2", 1))
	h.defs.set(definition.KindProcess, "p", "not a process")
	close(h.recorder.hold)
	record := h.recorder.wait(t)
	if class(record) != "" {
		t.Fatalf("call failed: %s", message(record))
	}
	if got := h.defs.readCount(); got != readsAtSubmit {
		t.Fatalf("the call read the live settings %d more times", got-readsAtSubmit)
	}
	want := sha(settingsDocs()[definition.KindAgent]["a"])
	for _, source := range record.Definitions {
		if source.Kind == string(definition.KindAgent) && source.SHA256 != want {
			t.Errorf("agent recorded %s, want %s", source.SHA256, want)
		}
	}
}

// A value's arguments may use the text of the values resolved before it:
// the diff is taken between the very commits the call resolved, one of
// which it checks out, not between names that could move meanwhile.
func TestInputsUseTheValuesResolvedBeforeThem(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`,
		`    base_revision: {source: git.revision, rev: "${param.base}"}
    diff: {source: git.diff, base: "${value.base_revision}", head: "${value.candidate_revision}"}`, 1)
	record := h.call(t, contract.CallRequest{Params: map[string]string{"base": "trunk"}})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	var gotArgs []map[string]string
	for _, spec := range h.inputs.specs {
		gotArgs = append(gotArgs, spec.Args)
	}
	wantArgs := []map[string]string{{"rev": "HEAD"}, {"rev": "trunk"}, {"base": "sha-trunk", "head": "sha-HEAD"}}
	if !reflect.DeepEqual(gotArgs, wantArgs) {
		t.Fatalf("input args = %v", gotArgs)
	}
	if !reflect.DeepEqual(h.workspaces.checkouts, [][2]string{{"/repo", "sha-HEAD"}}) {
		t.Fatalf("checkouts = %v", h.workspaces.checkouts)
	}
}

// What a call resolved is recorded under the record's own types, field for
// field: the definitions, the effective limits, the required permissions
// among them, and the plan.
func TestCallRecordsWhatItResolvedUnderTheRecordsOwnTypes(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "uses: agent:a\n", "uses: agent:a\ntools: {require: [repository.read]}\n", 1)
	record := h.call(t, contract.CallRequest{})
	encode := func(v any) string {
		data, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	wantService := `{"kind":"service","name":"service","path":"mem/service/service","sha256":"` + sha(settingsDocs()[definition.KindService]["service"]) + `"}`
	if len(record.Definitions) != 6 || encode(record.Definitions[0]) != wantService {
		t.Errorf("definitions = %s", encode(record.Definitions))
	}
	wantEffective := `{"timeout":1200000000000,"max_attempts":1,` +
		`"allow":["repository.read","repository.search","repository.diff"],"deny":[],` +
		`"permissions":["repository.read","repository.search","repository.diff"],"require":["repository.read"],` +
		`"access":"read-only","scope":"candidate"}`
	if got := encode(record.Effective); got != wantEffective {
		t.Errorf("effective\n got %s\nwant %s", got, wantEffective)
	}
	wantPlan := `{"primitives":["Read","Grep"],"granted":["repository.read","repository.search"],"withheld":["repository.diff"]}`
	if got := encode(record.Plan); got != wantPlan {
		t.Errorf("plan\n got %s\nwant %s", got, wantPlan)
	}
}
