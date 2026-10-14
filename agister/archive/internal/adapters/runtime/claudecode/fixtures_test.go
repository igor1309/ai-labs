package claudecode_test

import (
	"encoding/json"
	"fmt"
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
func (*sink) ToolFinished(claudecode.ToolResult)   {}

func (*sink) PermissionDenied(claudecode.PermissionDenial) {}

// told is a sink that keeps, in the order a turn reported them, each tool
// call started with the paths it writes and each permission denial.
type told struct {
	sink
	reports []string
}

func (s *told) ToolStarted(call claudecode.ToolCall) {
	s.reports = append(s.reports, fmt.Sprintf("started %s %s writes %q", call.ID, call.Name, call.Writes))
}

func (s *told) PermissionDenied(denial claudecode.PermissionDenial) {
	s.reports = append(s.reports, fmt.Sprintf("denied %s %s", denial.Tool, denial.Input))
}

const session = "5145d89d-470e-4b56-a78c-da035d5de49b"
