package app_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A workflow of one call (ADR-030 rule 6) is that call's run: its params
// are its process's, its run is one record, and it may be continued where
// its process is resumable.

// callDoc is workflow c, one call: node work binds the harness's process p
// to agent b.
const callDoc = `schema: agister.workflow/v1alpha1
name: c
type: workflow
call: {node: work, uses: process:p, agent: b}
`

// calling gives the harness workflow c and agent b, agent a but for its
// name and its model, m2.
func calling(h *harness) {
	h.defs.docs[definition.KindAgent]["b"] = strings.NewReplacer(`name = "a"`, `name = "b"`, `model = "m1"`, `model = "m2"`).Replace(settingsDocs()[definition.KindAgent]["a"])
	h.defs.docs[definition.KindWorkflow] = map[string]string{"c": callDoc}
}

// created are the records the harness's calls made.
func (s *recorderSpy) records() []run.Record {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]run.Record(nil), s.created...)
}

// The run of a workflow of one call is one record, made as the call's: it
// names the workflow, the call's node, process and agent, and runs the
// process on the agent the node binds, with the process's params, each
// with its default; there is no node record.
func TestAWorkflowOfOneCallIsOneRun(t *testing.T) {
	t.Parallel()
	h := newHarness()
	calling(h)
	record := h.call(t, contract.CallRequest{Process: "c", Params: map[string]string{"candidate": "feature"}})
	if record.Result.Status != run.Completed || record.Result.Error != nil {
		t.Fatalf("result %+v", record.Result)
	}
	created := h.recorder.records()
	if len(created) != 1 || created[0].Call == nil {
		t.Fatalf("created %+v, want one record that names its call from the start", created)
	}
	want := &run.Call{Node: "work", Process: "p", Agent: "b"}
	if record.Process != "c" || record.Request.Process != "c" || !reflect.DeepEqual(record.Call, want) || record.Agent != "b" {
		t.Fatalf("record of %s (asked %s), call %+v, agent %s; want workflow c, call %+v, agent b", record.Process, record.Request.Process, record.Call, record.Agent, want)
	}
	if record.Parent != nil || record.Workflow != nil {
		t.Fatalf("parent %+v, workflow %+v: want neither on a call's run", record.Parent, record.Workflow)
	}
	if turns := h.runner.calls(); len(turns) != 1 || turns[0].Model != "m2" || turns[0].Instruction == "" || !strings.HasPrefix(turns[0].Instruction, "Inspect the change.") {
		t.Fatalf("turns %+v, want one of process p on agent b's model m2", turns)
	}
	// The params are process p's: candidate as given, base its default.
	if got := diffArgs(h); got["base"] != "main" || got["head"] != "feature" {
		t.Fatalf("diff resolved with %v, want base main, head feature", got)
	}
	var sources []string
	for _, source := range record.Definitions {
		sources = append(sources, source.Kind+" "+source.Name)
	}
	if len(sources) < 2 || sources[0] != "workflows c" || !contains(sources, "processes p") || !contains(sources, "agents b") {
		t.Fatalf("definitions %v, want workflow c first, then the call's", sources)
	}
	h.recorder.mu.Lock()
	submitted := h.recorder.events[0]
	h.recorder.mu.Unlock()
	if submitted.Kind != "CALL_SUBMITTED" || submitted.Data["workflow"] != "c" || submitted.Data["process"] != "p" {
		t.Fatalf("first event %+v, want CALL_SUBMITTED of workflow c, process p", submitted)
	}
}

// diffArgs are the arguments the harness's git.diff input was resolved
// with.
func diffArgs(h *harness) map[string]string {
	h.inputs.mu.Lock()
	defer h.inputs.mu.Unlock()
	for _, spec := range h.inputs.specs {
		if spec.Source == "git.diff" {
			return spec.Args
		}
	}
	return nil
}

// A workflow of one call takes its process's params and no other, and is
// refused, naming the workflow, for what its process cannot take; it takes
// a timeout and a cost limit as its process's run did, and no agent: its
// node binds one, and a request has none to give (ADR-030 rules 5 and 6).
func TestAWorkflowOfOneCallTakesItsProcesssParamsAndLimits(t *testing.T) {
	t.Parallel()
	limit := 0.5
	t.Run("limits", func(t *testing.T) {
		t.Parallel()
		h := newHarness()
		calling(h)
		record := h.call(t, contract.CallRequest{Process: "c", Timeout: "5m", MaxCostUSD: &limit})
		if record.Result.Status != run.Completed || record.Effective == nil || record.Effective.Timeout != 5*time.Minute ||
			record.Effective.MaxCostUSD == nil || *record.Effective.MaxCostUSD != limit {
			t.Fatalf("result %+v, effective %+v, want completed within 5m and $0.5", record.Result, record.Effective)
		}
	})
	for name, c := range map[string]struct {
		request contract.CallRequest
		want    string
	}{
		"a param its process does not take": {contract.CallRequest{Params: map[string]string{"brief": "b.md"}}, "workflow c takes no params: brief"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			calling(h)
			c.request.Process = "c"
			record := h.call(t, c.request)
			if class(record) != run.ClassRefused || message(record) != c.want || len(h.runner.calls()) != 0 || len(h.recorder.records()) != 1 {
				t.Fatalf("result %+v, turns %d, want refused: %s", record.Result, len(h.runner.calls()), c.want)
			}
		})
	}
	t.Run("a param its process needs", func(t *testing.T) {
		t.Parallel()
		h := newHarness()
		calling(h)
		h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "candidate: {default: HEAD}", "candidate: {}", 1)
		record := h.call(t, contract.CallRequest{Process: "c"})
		if want := "workflow c is missing params: candidate"; class(record) != run.ClassRefused || message(record) != want {
			t.Fatalf("result %+v, want refused: %s", record.Result, want)
		}
	})
}

// A workflow of one call refused before it runs is still one record,
// which names its call.
func TestARefusedWorkflowOfOneCallNamesItsCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	calling(h)
	h.defs.docs[definition.KindWorkflow]["c"] = strings.Replace(callDoc, "agent: b", "agent: ghost", 1)
	record := h.call(t, contract.CallRequest{Process: "c"})
	if class(record) != run.ClassRefused || !strings.HasPrefix(message(record), "workflow c uses process p") || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v, want refused for agent ghost", record.Result)
	}
	if want := (&run.Call{Node: "work", Process: "p", Agent: "ghost"}); !reflect.DeepEqual(record.Call, want) || len(h.recorder.records()) != 1 {
		t.Fatalf("call %+v, records %d; want %+v, one record", record.Call, len(h.recorder.records()), want)
	}
	if len(record.Definitions) == 0 || record.Definitions[0].Kind != "workflows" || record.Definitions[0].Name != "c" {
		t.Fatalf("definitions %+v, want workflow c's", record.Definitions)
	}
}

// ADR-030 rules 3, 6 and 11: a workflow of one call continues a finished
// run of a workflow's call of the same process, on the same agent, where
// the process is resumable: the run's session is resumed in place. Where
// its process is fresh-only, or the run is not such a run, as no run made
// before ADR-030 is, it is refused.
func TestAWorkflowOfOneCallContinuesWhereItsProcessIsResumable(t *testing.T) {
	t.Parallel()
	finished := time.Date(2026, 10, 10, 11, 0, 0, 0, time.UTC)
	earlier := leftInTheWorktree(run.Record{ID: "run-0", Process: "c", Agent: "b", Call: &run.Call{Node: "work", Process: "p", Agent: "b"},
		Runtime: &run.Runtime{Adapter: "spy"}, FinishedAt: &finished,
		Result: &run.Result{Status: run.Interrupted, Session: &run.Session{ProviderSessionID: "prov-0"}}})
	arrange := func(session string, prior run.Record) *harness {
		h := newHarness()
		calling(h)
		sessioned(h, session)
		h.runs.records["run-0"], h.runs.states["run-0"] = prior, run.StateFinished
		return h
	}

	h := arrange(definition.SessionResumable, earlier)
	record := h.call(t, contract.CallRequest{Process: "c", Continue: "run-0"})
	if turns := h.runner.calls(); len(turns) != 1 || turns[0].ResumeSessionID != "prov-0" || turns[0].Model != "m2" {
		t.Fatalf("result %+v, turns %+v, want one resuming prov-0 on agent b", record.Result, turns)
	}
	if record.Result.Session == nil || record.Result.Session.Continues != "run-0" || record.Call == nil || record.Agent != "b" {
		t.Fatalf("session %+v, call %+v, agent %s", record.Result.Session, record.Call, record.Agent)
	}

	notACall := "run run-0 is not a run of a workflow's call of process p: its process and agent are not the ones the workflow binds (ADR-030 rule 11)"
	before := earlier
	before.Process, before.Call = "p", nil
	other := earlier
	other.Call = &run.Call{Node: "work", Process: "q", Agent: "b"}
	byA := earlier
	byA.Agent, byA.Call = "a", &run.Call{Node: "work", Process: "p", Agent: "a"}
	for name, c := range map[string]struct {
		session string
		prior   run.Record
		want    string
	}{
		"its process is fresh-only":            {definition.SessionFresh, earlier, "process p is fresh-only; it cannot continue run run-0"},
		"a run of the process made before":     {definition.SessionResumable, before, notACall},
		"a workflow's call of another process": {definition.SessionResumable, other, notACall},
		"a workflow's call on another agent":   {definition.SessionResumable, byA, "run run-0 ran agent a; only agent b's own runs can be continued by it"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := arrange(c.session, c.prior)
			record := h.call(t, contract.CallRequest{Process: "c", Continue: "run-0"})
			if class(record) != run.ClassRefused || message(record) != c.want || len(h.runner.calls()) != 0 {
				t.Fatalf("result %+v, want refused: %s", record.Result, c.want)
			}
		})
	}
}
