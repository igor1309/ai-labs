// Command fakecodex stands in for `codex exec --json`, including the
// non-terminal error events observed from the real CLI. The scenario is
// chosen by a SCENARIO:<name> marker in the prompt (stdin).
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
			version = "0.158.0"
		}
		fmt.Printf("codex-cli %s\n", version)
		return
	}
	var schema any
	for i, arg := range args {
		if arg == "--output-schema" && i+1 < len(args) {
			if data, err := os.ReadFile(args[i+1]); err == nil {
				_ = json.Unmarshal(data, &schema)
			}
		}
	}
	input, _ := io.ReadAll(os.Stdin)
	prompt := string(input)
	scenario := "approve"
	if match := regexp.MustCompile(`SCENARIO:([a-z_]+)`).FindStringSubmatch(prompt); match != nil {
		scenario = match[1]
	}
	emit := func(message any) {
		data, _ := json.Marshal(message)
		fmt.Println(string(data))
	}
	cwd, _ := os.Getwd()
	emit(map[string]any{"type": "thread.started", "thread_id": "01a0e850-b808-71c2-8401-53ba16d8ae18", "argv": args, "cwd": cwd, "prompt": prompt, "schema": schema})
	if scenario == "no_result" {
		return
	}
	emit(map[string]any{"type": "turn.started"})
	emit(map[string]any{"type": "error", "message": "Reconnecting... 2/5 (stream disconnected before completion)"})
	emit(map[string]any{"type": "item.completed", "item": map[string]any{"id": "item_0", "type": "error", "message": "Falling back from WebSockets to HTTPS transport."}})

	switch scenario {
	case "hang":
		time.Sleep(50 * time.Second)
		return
	case "exit_nonzero":
		emit(map[string]any{"type": "error", "message": "unexpected status 401 Unauthorized"})
		fmt.Fprintln(os.Stderr, "Error: unauthorized")
		os.Exit(1)
	case "error_result":
		emit(map[string]any{"type": "turn.failed", "error": map[string]any{"message": "model stream ended unexpectedly"}})
		return
	}
	emit(map[string]any{"type": "item.started", "item": map[string]any{"id": "item_1", "type": "command_execution", "command": "git diff --stat", "status": "in_progress"}})
	emit(map[string]any{"type": "item.completed", "item": map[string]any{"id": "item_1", "type": "command_execution", "command": "git diff --stat", "exit_code": 0, "status": "completed"}})
	text := "All good."
	if schema != nil {
		output := map[string]any{"verdict": "approve", "summary": "Looks fine.", "findings": []any{}}
		if scenario == "request_changes" {
			output = map[string]any{"verdict": "request_changes", "summary": "A real bug.", "findings": []any{map[string]any{"severity": "major", "file": "a.txt", "line": 2, "title": "Off by one", "detail": "Loop bound is wrong."}}}
		}
		data, _ := json.Marshal(output)
		text = string(data)
	}
	if scenario == "not_json" {
		text = "Here is my answer: looks fine"
	}
	emit(map[string]any{"type": "item.completed", "item": map[string]any{"id": "item_2", "type": "agent_message", "text": text}})
	emit(map[string]any{"type": "turn.completed", "usage": map[string]any{"input_tokens": 1200, "output_tokens": 80}})
}
