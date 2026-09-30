package run_test

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestConclude(t *testing.T) {
	jsonOutput := definition.Output{Format: "json"}
	text := definition.Output{Format: "text"}
	completed := run.Turn{Status: run.Completed, Output: []byte(`{"verdict":"request_changes"}`)}
	cases := []struct {
		name       string
		turn       run.Turn
		output     definition.Output
		validation error
		status     run.Status
		class      run.Class
	}{
		// A domain result is output of a completed node, whatever it says.
		{"verdict is output", completed, jsonOutput, nil, run.Completed, ""},
		{"invalid output", completed, jsonOutput, errors.New("bad"), run.Failed, run.ClassInvalidOutput},
		{"text needs no validation", run.Turn{Status: run.Completed, Text: "hi"}, text, nil, run.Completed, ""},
		{"runtime failure kept", run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "")}, jsonOutput, nil, run.Failed, run.ClassRateLimited},
		{"interruption kept", run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "")}, text, nil, run.Interrupted, run.ClassTimeout},
		{"a failure without a reason still has a class", run.Turn{Status: run.Lost}, text, nil, run.Lost, run.ClassRuntimeError},
	}
	for _, c := range cases {
		status, fault := run.Conclude(c.turn, c.output, c.validation)
		class := run.Class("")
		if fault != nil {
			class = fault.Class
		}
		if status != c.status || class != c.class {
			t.Errorf("%s: %s/%s, want %s/%s", c.name, status, class, c.status, c.class)
		}
	}
}

func TestEveryClassBelongsToOneStatus(t *testing.T) {
	want := map[run.Class]run.Status{
		run.ClassRefused: run.Failed, run.ClassInvalidOutput: run.Failed, run.ClassBudgetExhausted: run.Failed,
		run.ClassRateLimited: run.Failed, run.ClassAuth: run.Failed, run.ClassContextOverflow: run.Failed,
		run.ClassRuntimeError: run.Failed, run.ClassRuntimeUnavailable: run.Failed, run.ClassInternal: run.Failed,
		run.ClassTimeout: run.Interrupted, run.ClassCancelled: run.Interrupted,
		run.ClassNoResult: run.Lost, run.ClassKilled: run.Lost, run.ClassAbandoned: run.Lost,
	}
	for class, status := range want {
		if got := run.StatusOf(class); got != status {
			t.Errorf("%s: %s, want %s", class, got, status)
		}
	}
}

// The record is evidence under a versioned schema: what it writes for the
// definitions, the effective limits and the plan is fixed here, whatever
// the packages that decide them do with their own types.
func TestRecordJSONForDefinitionsPolicyAndPlanIsFixed(t *testing.T) {
	cost := 0.5
	record := run.Record{
		Schema: run.RecordSchema,
		ID:     "r",
		Definitions: []run.DefinitionSource{
			{Kind: "processes", Name: "p", Path: "/home/.agister/processes/p.yaml", SHA256: "abc"},
			{Kind: "agents", Name: "a", Path: "/repo/.agister/agents/a.toml", SHA256: "def", Project: true, Overrides: "/home/.agister/agents/a.toml"},
		},
		Effective: &run.EffectivePolicy{
			Timeout:     20 * time.Minute,
			MaxAttempts: 1,
			MaxCostUSD:  &cost,
			Allow:       []string{"repository.read"},
			Deny:        []string{},
			Permissions: []string{"repository.read"},
			Require:     []string{"repository.read"},
			Access:      "read-only",
			Scope:       "candidate",
		},
		Plan: &run.Plan{Primitives: []string{"Read"}, Granted: []string{"repository.read"}, Withheld: []string{"repository.diff"}},
	}
	data, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"definitions": `[{"kind":"processes","name":"p","path":"/home/.agister/processes/p.yaml","sha256":"abc"},` +
			`{"kind":"agents","name":"a","path":"/repo/.agister/agents/a.toml","sha256":"def","project":true,"overrides":"/home/.agister/agents/a.toml"}]`,
		"effective": `{"timeout":1200000000000,"max_attempts":1,"max_cost_usd":0.5,"allow":["repository.read"],"deny":[],` +
			`"permissions":["repository.read"],"require":["repository.read"],"access":"read-only","scope":"candidate"}`,
		"plan": `{"primitives":["Read"],"granted":["repository.read"],"withheld":["repository.diff"]}`,
	}
	for field, text := range want {
		if string(got[field]) != text {
			t.Errorf("%s\n got %s\nwant %s", field, got[field], text)
		}
	}
	// A record written so reads back as it was.
	var back run.Record
	if err := json.Unmarshal(data, &back); err != nil || !reflect.DeepEqual(back, record) {
		t.Errorf("read back %+v, %v", back, err)
	}
}

// A record written while policies could declare constraints still reads:
// the constraints it recorded are ignored, and everything else is kept.
func TestRecordWithConstraintsStillReads(t *testing.T) {
	data := `{"id":"run-0","effective":{"timeout":1200000000000,"max_attempts":1,"allow":["repository.read"],"deny":[],` +
		`"permissions":["repository.read"],"access":"read-only","scope":"candidate",` +
		`"constraints":[{"subject":"agent.model_family","candidate_input":"candidate","on_unknown":"fail"}]}}`
	var record run.Record
	if err := json.Unmarshal([]byte(data), &record); err != nil {
		t.Fatal(err)
	}
	want := run.EffectivePolicy{Timeout: 20 * time.Minute, MaxAttempts: 1, Allow: []string{"repository.read"}, Deny: []string{},
		Permissions: []string{"repository.read"}, Access: "read-only", Scope: "candidate"}
	if record.ID != "run-0" || record.Effective == nil || !reflect.DeepEqual(*record.Effective, want) {
		t.Fatalf("record = %+v, effective %+v", record, record.Effective)
	}
}
