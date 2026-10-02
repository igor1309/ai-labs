package pi_test

import (
	"encoding/json"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func request(prompt string) pi.TurnRequest {
	return pi.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read", "bash"},
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
func (*sink) ToolStarted(pi.ToolCall)              {}
func (*sink) ToolFinished(string)                  {}
func session(t *testing.T, root, id, cwd string) {
	t.Helper()
	dir := filepath.Join(root, id)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	header, _ := json.Marshal(map[string]any{"type": "session", "version": 3, "id": id, "timestamp": "2026-10-01T10:00:00Z", "cwd": cwd})
	if err := os.WriteFile(filepath.Join(dir, "2026-10-01T10-00-00Z_"+id+".jsonl"), append(header, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
}

const fresh = "3b0c9a52-6f1e-4d8a-9c47-0e2f5d8b1a63"
