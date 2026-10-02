package opencode_test

import (
	"encoding/json"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"time"
)

func request(prompt string) opencode.TurnRequest {
	return opencode.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read", "skill", "bash"},
		Model:        "opencode-go/minimax-m3",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

type sink struct{}

func (*sink) Event(string, string, map[string]any) {}
func (*sink) Raw(string)                           {}
func (*sink) ProcessStarted(string) error          { return nil }
func (*sink) ToolStarted(opencode.ToolCall)        {}
func (*sink) ToolFinished(string)                  {}

const fresh = "ses_f06fe64c3ffeLyBkwYK7e1GfJs"

func follows(args []string, flag, value string) bool {
	for i := range args[:len(args)-1] {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}
