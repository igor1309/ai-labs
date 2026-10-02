package claudecode_test

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	supervisor "github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
)

// The fakes this package builds are removed when its tests end.
func TestMain(m *testing.M) { os.Exit(runtimetest.Run(m)) }

const session = "5145d89d-470e-4b56-a78c-da035d5de49b"

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

func TestConformance(t *testing.T) {
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return composition.AdaptClaudeCode(&claudecode.Runner{Transport: composition.ClaudeCodeTransport{Supervisor: supervisor.Runtime{}}, Command: command, KillGrace: 200 * time.Millisecond})
		},
		Fake:      runtimetest.Binary(t, "fakeclaude"),
		Contract:  claudecode.Contract,
		ToolCalls: true,
		Request:   request,
	})
}
