package codex_test

import (
	"encoding/json"
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
func (*sink) ToolFinished(string)                  {}

const fakeThread = "thread-1"

func listingJSON(cost string) string {
	return `{"sessions":[{"sessionId":"rollout-` + fakeThread + `","costUSD":` + cost + `}]}`
}
