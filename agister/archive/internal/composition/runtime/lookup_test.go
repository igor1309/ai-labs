package runtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// The Codex runner as wired runs its ccusage lookup through the production
// translator, which hands the supervisor what is left of the turn's
// timeout, not the whole of it.
func TestCodexTransportForwardsWhatIsLeftOfTheTurnsTimeout(t *testing.T) {
	t.Parallel()
	const fake = "codex"
	var specs []supervisor.Spec
	transport := CodexTransport{Supervisor: supervisorStandIn{run: func(ctx context.Context, spec supervisor.Spec, sink supervisor.Sink, onLine func(string)) supervisor.Evidence {
		specs = append(specs, spec)
		if spec.Command == fake {
			return supervisor.Runtime{Starter: runtimetest.InProcess{Groups: supervisortest.NewGroups()}, Timer: clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)).Timer}.Run(ctx, spec, sink, onLine)
		}
		// The lookup never runs: it is ended by its timeout.
		return supervisor.Evidence{TimedOut: true}
	}}}
	runner := codex.New(fake, transport)
	start := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	readings := 0
	// The first reading starts the turn; by any later one only a moment of
	// its minute is left.
	runner.Now = func() time.Time {
		readings++
		if readings == 1 {
			return start
		}
		return start.Add(time.Minute - 100*time.Millisecond)
	}
	turn := domain.Own(AdaptCodex(runner).RunTurn(context.Background(), app.TurnRequest{
		Prompt:       "SCENARIO:approve",
		Instruction:  "Do the thing.",
		Primitives:   []string{"read-only"},
		Model:        "gpt-5.5",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}, &runtimetest.Recorder{}), false)
	if turn.Status != domain.Completed || turn.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
	if len(specs) != 2 || specs[0].Timeout != time.Minute {
		t.Fatalf("specs = %+v", specs)
	}
	if lookup := specs[1]; lookup.Command != "ccusage" || lookup.Timeout != 100*time.Millisecond {
		t.Fatalf("the lookup was handed %+v, not what is left of the turn's timeout", lookup)
	}
}
