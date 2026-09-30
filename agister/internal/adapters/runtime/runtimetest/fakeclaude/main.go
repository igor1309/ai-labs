// Command fakeclaude stands in for `claude -p --output-format stream-json`.
// The scenario is chosen by a SCENARIO:<name> marker in the prompt (stdin).
// Its first line echoes argv, cwd and prompt for tests.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"time"
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
	if match := regexp.MustCompile(`SCENARIO:([a-z_]+)`).FindStringSubmatch(prompt); match != nil {
		scenario = match[1]
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
		time.Sleep(50 * time.Second)
		return
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
	result := map[string]any{"type": "result", "subtype": "success", "is_error": false, "session_id": session, "result": "All good.", "num_turns": 2, "total_cost_usd": 0.0123, "duration_ms": 3400, "permission_denials": []any{map[string]any{"tool_name": "Edit"}},
		"usage": map[string]any{"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 10, "cache_creation_input_tokens": 5}}
	if flag("--json-schema") != "" && scenario != "no_structured_output" {
		result["structured_output"] = outputs(scenario)
	}
	emit(result)
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
