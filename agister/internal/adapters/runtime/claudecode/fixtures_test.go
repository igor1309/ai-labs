package claudecode_test

import (
	"encoding/json"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"time"
)

func request(prompt string) claudecode.TurnRequest {
	return claudecode.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"Read", "Grep"},
		Model:        "sonnet",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

type sink struct{}

func (*sink) Event(string, string, map[string]any) {}
func (*sink) Raw(string)                           {}
func (*sink) ProcessStarted(string) error          { return nil }
func (*sink) ToolStarted(claudecode.ToolCall)      {}
func (*sink) ToolFinished(string)                  {}

const session = "5145d89d-470e-4b56-a78c-da035d5de49b"
