package codex_test

import (
	"encoding/json"
	"fmt"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"time"
)

func request(prompt string) codex.TurnRequest {
	return codex.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read-only"},
		Model:        "gpt-5.5",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

type sink struct{}

func (*sink) Event(string, string, map[string]any) {}
func (*sink) Raw(string)                           {}
func (*sink) ProcessStarted(string) error          { return nil }
func (*sink) ToolStarted(codex.ToolCall)           {}
func (*sink) ToolFinished(codex.ToolResult)        {}

// told is a sink that keeps, in the order a turn reported them, each tool
// call started with the paths it writes.
type told struct {
	sink
	reports []string
}

func (s *told) ToolStarted(call codex.ToolCall) {
	s.reports = append(s.reports, fmt.Sprintf("started %s %s writes %q", call.ID, call.Name, call.Writes))
}

const fakeThread = "thread-1"

func listingJSON(cost string) string {
	return `{"sessions":[{"sessionId":"rollout-` + fakeThread + `","costUSD":` + cost + `}]}`
}
