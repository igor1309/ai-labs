package app_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

type verifierStandIn struct {
	ctx   context.Context
	call  app.VerificationCall
	name  string
	fault *run.Error
}

func (s *verifierStandIn) Verify(ctx context.Context, call app.VerificationCall) (string, *run.Error) {
	s.ctx, s.call = ctx, call
	return s.name, s.fault
}

// CallsVerifier translates Calls' request and its owned command values into
// the verifier's request while preserving the other call seams.
func TestCallsVerifierTranslatesItsRequest(t *testing.T) {
	t.Parallel()
	ctx := context.WithValue(context.Background(), struct{}{}, "context")
	record := &run.Record{ID: "run-1"}
	result := &run.Result{}
	var events, updates, artifacts, takes, concludes int
	update := func(run.Record) error { updates++; return nil }
	artifact := func(string, []byte) (run.Artifact, error) { artifacts++; return run.Artifact{}, nil }
	event := func(string, string, map[string]any) { events++ }
	take := func(app.TurnRequest, *run.SessionTotals) run.Turn { takes++; return run.Turn{} }
	conclude := func(run.Turn) *run.Error { concludes++; return nil }
	call := app.VerifyCall{
		Record: record, Result: result, Event: event, Update: update, Artifact: artifact,
		Verify: app.CallVerify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "Fix it."},
		Limit:  func() *float64 { n := 2.5; return &n }(), Deadline: time.Date(2026, 10, 13, 5, 0, 0, 0, time.UTC),
		NoOutput: 30 * time.Second, Dir: "/repo", Base: "sha-HEAD", Request: app.TurnRequest{Prompt: "run"}, Session: "session-1",
		Take: take, Conclude: conclude,
	}
	standIn := &verifierStandIn{name: "tree", fault: run.Fault(run.ClassTimeout, "stopped")}
	got, fault := (app.CallsVerifier{Verifier: standIn}).Verify(ctx, call)

	if standIn.ctx != ctx || got != standIn.name || fault != standIn.fault {
		t.Fatalf("adapter context/result = %v, %q, %v", standIn.ctx == ctx, got, fault)
	}
	asked := standIn.call
	if asked.Record != record || asked.Result != result || asked.Limit != call.Limit || asked.Deadline != call.Deadline || asked.NoOutput != call.NoOutput || asked.Dir != call.Dir || asked.Base != call.Base || !reflect.DeepEqual(asked.Request, call.Request) || asked.Session != call.Session {
		t.Fatalf("translated request = %+v", asked)
	}
	if want := (app.VerifyCommand{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "Fix it."}); !reflect.DeepEqual(asked.Verify, want) {
		t.Fatalf("translated command = %+v, want %+v", asked.Verify, want)
	}
	asked.Event("source", "kind", nil)
	if err := asked.Update(run.Record{}); err != nil {
		t.Fatalf("translated update = %v", err)
	}
	if _, err := asked.Artifact("artifact", nil); err != nil {
		t.Fatalf("translated artifact = %v", err)
	}
	asked.Take(app.TurnRequest{}, nil)
	asked.Conclude(run.Turn{})
	if events != 1 || updates != 1 || artifacts != 1 || takes != 1 || concludes != 1 {
		t.Fatalf("translated seams called %d events, %d updates, %d artifacts, %d takes, %d concludes", events, updates, artifacts, takes, concludes)
	}
}
