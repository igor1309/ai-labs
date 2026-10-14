package runtime

import (
	"context"
	"errors"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"reflect"
	"testing"
	"time"
)

type supervisorStandIn struct {
	run     func(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence
	version func(context.Context, string) (string, error)
}

func (s supervisorStandIn) Run(ctx context.Context, spec supervisor.Spec, sink supervisor.Sink, line func(string)) supervisor.Evidence {
	return s.run(ctx, spec, sink, line)
}
func (s supervisorStandIn) Version(ctx context.Context, command string) (string, error) {
	return s.version(ctx, command)
}

type commandStandIn struct {
	request     supervisor.CommandRequest
	result      supervisor.CommandResult
	ctx         context.Context
	recordError error
}

func (s *commandStandIn) Run(ctx context.Context, request supervisor.CommandRequest, started func(string) error) supervisor.CommandResult {
	s.ctx = ctx
	s.request = request
	s.recordError = started("pgid:42")
	return s.result
}

type processStandIn struct {
	ctx    context.Context
	ref    string
	result supervisor.Reaping
	err    error
}

func (s *processStandIn) Reap(ctx context.Context, ref string) (supervisor.Reaping, error) {
	s.ctx = ctx
	s.ref = ref
	return s.result, s.err
}
func TestCommandAdapter(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	code := 7
	refusal := errors.New("disk full")
	var ref string
	stub := &commandStandIn{result: supervisor.CommandResult{ExitCode: &code, Signal: "killed", TimedOut: true, Cancelled: true, Stale: true, Error: "record failed", Head: []byte("head"), Tail: []byte("tail"), Bytes: 100, SHA256: "digest"}}
	result := (Commands{Supervisor: stub}).Run(ctx, app.CommandRequest{Command: "go test", Dir: "/checkout", Timeout: time.Minute, NoOutput: time.Second, Bound: 64}, func(r string) error { ref = r; return refusal })
	wantRequest := supervisor.CommandRequest{Command: "go test", Dir: "/checkout", Timeout: time.Minute, NoOutput: time.Second, Bound: 64}
	want := app.CommandResult{ExitCode: &code, Signal: "killed", TimedOut: true, Cancelled: true, Stale: true, Error: "record failed", Head: []byte("head"), Tail: []byte("tail"), Bytes: 100, SHA256: "digest"}
	if stub.ctx != ctx || !reflect.DeepEqual(stub.request, wantRequest) || !reflect.DeepEqual(result, want) || ref != "pgid:42" || stub.recordError != refusal {
		t.Fatalf("stub %+v, result %+v, ref %q", stub, result, ref)
	}
}
func TestProcessAdapter(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	failure := errors.New("unknown reference")
	for _, result := range []supervisor.Reaping{supervisor.ReapGone, supervisor.ReapKilled, supervisor.ReapLeft} {
		stub := &processStandIn{result: result, err: failure}
		got, err := (Processes{Supervisor: stub}).Reap(ctx, "pgid:42:token")
		if stub.ctx != ctx || stub.ref != "pgid:42:token" || string(got) != string(result) || err != failure {
			t.Fatalf("stub %+v, result %s, err %v", stub, got, err)
		}
	}
}

func TestHoldProcessAdapter(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	failure := errors.New("unknown reference")
	for result, want := range map[supervisor.Reaping]app.HoldReaping{
		supervisor.ReapGone: app.HoldReapGone, supervisor.ReapKilled: app.HoldReapKilled, supervisor.ReapLeft: app.HoldReapLeft,
	} {
		stub := &processStandIn{result: result, err: failure}
		got, err := (HoldProcesses{Supervisor: stub}).Reap(ctx, "pgid:42:token")
		if stub.ctx != ctx || stub.ref != "pgid:42:token" || got != want || err != failure {
			t.Fatalf("stub %+v, result %s, want %s, err %v", stub, got, want, err)
		}
	}
}

// recorder is the app side of the shipped adapters.
var _ app.EventSink = (*runtimetest.Recorder)(nil)

// Each transport passes the supervisor's own decisions to its adapter's
// sink as Agister's, so the stale watch does not take them for the runtime
// moving, and the process's events as the process's.
func TestTransportsRecordTheSupervisorsDecisionsAsAgisters(t *testing.T) {
	t.Parallel()
	standIn := supervisorStandIn{run: func(_ context.Context, _ supervisor.Spec, s supervisor.Sink, _ func(string)) supervisor.Evidence {
		s.Event(supervisor.SourceProcess, "PROCESS_STARTED", nil)
		s.Event(supervisor.SourceSupervisor, "TIMEOUT", nil)
		return supervisor.Evidence{}
	}}
	for name, turn := range map[string]func(*runtimetest.Recorder){
		"claude code": func(sink *runtimetest.Recorder) {
			ClaudeCodeTransport{Supervisor: standIn}.Run(context.Background(), claudecode.Spec{}, sink, func(string) {})
		},
		"codex": func(sink *runtimetest.Recorder) {
			CodexTransport{Supervisor: standIn}.Run(context.Background(), codex.Spec{}, sink, func(string) {})
		},
		"opencode": func(sink *runtimetest.Recorder) {
			OpenCodeTransport{Supervisor: standIn}.Run(context.Background(), opencode.Spec{}, sink, func(string) {})
		},
		"pi": func(sink *runtimetest.Recorder) {
			PiTransport{Supervisor: standIn}.Run(context.Background(), pi.Spec{}, sink, func(string) {})
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			sink := &runtimetest.Recorder{}
			turn(sink)
			var sources []string
			for _, event := range sink.Events {
				sources = append(sources, event.Kind+" "+event.Source)
			}
			if want := []string{"PROCESS_STARTED " + run.SourceProcess, "TIMEOUT " + run.SourceAgister}; !reflect.DeepEqual(sources, want) {
				t.Fatalf("events %q, want %q", sources, want)
			}
		})
	}
}
