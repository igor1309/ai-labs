package claudecode_test

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	supervisor "github.com/igor1309/ai-labs/gokit/supervisor"
)

// The fake this package builds is removed when its tests end.
func TestMain(m *testing.M) { os.Exit(runtimetest.Run(m)) }

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"Read", "Grep"},
		Model:        "sonnet",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

// Contract test: the Claude Code adapter against its built fake, a real
// process under the real supervisor.
func TestConformance(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return composition.AdaptClaudeCode(&claudecode.Runner{Transport: composition.ClaudeCodeTransport{Supervisor: supervisor.Runtime{Timer: clock.Timer}}, Command: command})
		},
		Fake:      runtimetest.Binary(t, "fakeclaude"),
		Contract:  claudecode.Contract,
		ToolCalls: true,
		Request:   request,
		Clock:     clock,
	})
}
