// Command fakeclaude stands in for `claude -p --output-format stream-json`.
// The scenario is chosen by a SCENARIO:<name> marker in the prompt (stdin).
// Its first line echoes argv, cwd and prompt for tests. Every turn costs
// turnCost; with $FAKE_CLAUDE_CONFIG_DIR set, it keeps each session's cost
// in a transcript there as Claude Code does in its configuration
// directory, and reports the session's total.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeoutput"
)

func main() {
	args := os.Args[1:]
	if len(args) == 1 && args[0] == "--version" {
		version := os.Getenv("FAKE_VERSION")
		if version == "" {
			version = "2.1.283"
		}
		fmt.Printf("%s (Claude Code)\n", version)
		return
	}
	flag := func(name string) string {
		for i, arg := range args {
			if arg == name && i+1 < len(args) {
				return args[i+1]
			}
		}
		return ""
	}
	input, _ := io.ReadAll(os.Stdin)
	prompt := string(input)
	scenario := "approve"
	fromSchema := fakeoutput.Enabled(os.Getenv)
	if match := regexp.MustCompile(`SCENARIO:([a-z_]+)`).FindStringSubmatch(prompt); match != nil {
		scenario = match[1]
	}
	if fromSchema {
		// The prompt carries real files then: no marker in them is a scenario.
		scenario = "approve"
	}
	// A resumed session keeps its ID; a fresh one gets the runtime's own.
	session := flag("--resume")
	if scenario == "mismatch" || session == "" {
		session = "00000000-0000-4000-8000-000000000000"
	}
	emit := func(message any) {
		data, _ := json.Marshal(message)
		fmt.Println(string(data))
	}
	cwd, _ := os.Getwd()
	emit(map[string]any{"type": "system", "subtype": "init", "session_id": session, "model": "fake-model", "tools": []string{"Read"}, "cwd": cwd, "argv": args, "prompt": prompt})

	switch scenario {
	case "hang":
		// Never ends on its own: only a kill ends it.
		for {
			time.Sleep(time.Hour)
		}
	case "exit_nonzero":
		fmt.Fprintln(os.Stderr, "fatal: provider exploded")
		os.Exit(3)
	case "no_result":
		return
	case "edit":
		os.WriteFile("written-by-agent.txt", []byte("hello\n"), 0o600)
	}
	emit(map[string]any{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "tool_use", "id": "toolu_1", "name": "Read", "input": map[string]any{"file_path": "a.txt"}}}}})
	emit(map[string]any{"type": "user", "message": map[string]any{"content": []any{map[string]any{"type": "tool_result", "tool_use_id": "toolu_1", "content": "ok"}}}})
	emit(map[string]any{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "text", "text": "Done looking."}}}})
	fmt.Println("{broken")

	if scenario == "error_result" {
		emit(map[string]any{"type": "result", "subtype": "error_during_execution", "is_error": true, "session_id": session, "errors": []string{"tool crashed"}})
		return
	}
	result := map[string]any{"type": "result", "subtype": "success", "is_error": false, "session_id": session, "result": "All good.", "num_turns": 2, "total_cost_usd": sessionCost(session, cwd), "duration_ms": 3400, "permission_denials": []any{map[string]any{"tool_name": "Edit"}},
		"usage": map[string]any{"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 10, "cache_creation_input_tokens": 5}}
	if flag("--json-schema") != "" && scenario != "no_structured_output" {
		result["structured_output"] = outputs(scenario)
		if fromSchema {
			var schema any
			_ = json.Unmarshal([]byte(flag("--json-schema")), &schema)
			result["structured_output"] = fakeoutput.Instance(schema)
		}
	}
	emit(result)
}

const turnCost = 0.0123

// sessionCost is the session's cost with this turn's: kept, as Claude Code
// keeps it, as a cost-state entry appended to the session's transcript,
// projects/<cwd>/<session>.jsonl, wherever the session started. Without
// $FAKE_CLAUDE_CONFIG_DIR, only this turn's: the fake never writes to a
// real configuration directory.
func sessionCost(session, cwd string) float64 {
	dir := os.Getenv("FAKE_CLAUDE_CONFIG_DIR")
	if dir == "" {
		return turnCost
	}
	path := filepath.Join(dir, "projects", regexp.MustCompile(`[^A-Za-z0-9]`).ReplaceAllString(cwd, "-"), session+".jsonl")
	if found, _ := filepath.Glob(filepath.Join(dir, "projects", "*", session+".jsonl")); len(found) == 1 {
		path = found[0]
	}
	total := turnCost
	if data, err := os.ReadFile(path); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			var entry struct {
				Type         string  `json:"type"`
				TotalCostUSD float64 `json:"totalCostUSD"`
			}
			if json.Unmarshal([]byte(line), &entry) == nil && entry.Type == "cost-state" {
				total = entry.TotalCostUSD + turnCost
			}
		}
	}
	entry, _ := json.Marshal(map[string]any{"type": "cost-state", "sessionId": session, "totalCostUSD": total})
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err == nil {
		fmt.Fprintln(file, string(entry))
		file.Close()
	}
	return total
}

func outputs(scenario string) any {
	switch scenario {
	case "request_changes":
		return map[string]any{"verdict": "request_changes", "summary": "A real bug.", "findings": []any{map[string]any{"severity": "major", "file": "a.txt", "line": 2, "title": "Off by one", "detail": "Loop bound is wrong."}}}
	case "invalid_output":
		return map[string]any{"verdict": "maybe", "summary": 1, "findings": "none"}
	default:
		return map[string]any{"verdict": "approve", "summary": "Looks fine.", "findings": []any{map[string]any{"severity": "nit", "file": "a.txt", "line": nil, "title": "Wording", "detail": "Consider rewording."}}}
	}
}
