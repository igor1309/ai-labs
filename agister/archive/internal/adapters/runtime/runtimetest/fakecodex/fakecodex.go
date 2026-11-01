// Package fakecodex stands in for `codex exec --json` and `codex exec
// resume --json`, including the non-terminal error events observed from the
// real CLI. The scenario is chosen by a SCENARIO:<name> marker in the
// prompt (stdin). Its first event, thread.started, echoes what it was given:
// its argv, working directory, prompt and schema, its CODEX_HOME (empty
// when unset), the names under that home's skills/, and the regular files
// under it, the skills written there, by the folder.
package fakecodex

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeoutput"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeskills"
	"github.com/igor1309/ai-labs/gokit/fakeproc"
)

// Main is the fake as the process p; it returns the code it exits with.
func Main(p fakeproc.Process) int {
	args := p.Args
	if len(args) == 1 && args[0] == "--version" {
		version := p.Getenv("FAKE_VERSION")
		if version == "" {
			version = "0.158.0"
		}
		fmt.Fprintf(p.Stdout, "codex-cli %s\n", version)
		return 0
	}
	var schema any
	for i, arg := range args {
		if arg == "--output-schema" && i+1 < len(args) {
			if data, err := os.ReadFile(p.Path(args[i+1])); err == nil {
				_ = json.Unmarshal(data, &schema)
			}
		}
	}
	input, _ := io.ReadAll(p.Stdin)
	prompt := string(input)
	scenario := "approve"
	if match := regexp.MustCompile(`SCENARIO:([a-z_]+)`).FindStringSubmatch(prompt); match != nil {
		scenario = match[1]
	}
	fromSchema := fakeoutput.Enabled(p.Getenv)
	if fromSchema {
		// The prompt carries real files then: no marker in them is a scenario.
		scenario = "approve"
	}
	emit := func(message any) {
		data, _ := json.Marshal(message)
		fmt.Fprintln(p.Stdout, string(data))
	}
	// `exec resume <thread_id>` keeps the thread; a fresh one gets its own.
	thread := "01a0e850-b808-71c2-8401-53ba16d8ae18"
	if len(args) > 2 && args[0] == "exec" && args[1] == "resume" && scenario != "mismatch" {
		thread = args[2]
	}
	cwd := p.Dir
	// The home's skills, read while the fake runs: none without a home.
	home := p.Getenv("CODEX_HOME")
	names, skills := []string{}, map[string]map[string]string{}
	if home != "" {
		dir := filepath.Join(p.Path(home), "skills")
		entries, _ := os.ReadDir(dir)
		for _, entry := range entries {
			names = append(names, entry.Name())
		}
		skills = fakeskills.Given([]string{dir})
	}
	emit(map[string]any{"type": "thread.started", "thread_id": thread, "argv": args, "cwd": cwd, "prompt": prompt, "schema": schema, "codex_home": home, "skill_names": names, "skills": skills})
	switch scenario {
	case "no_result":
		return 0
	case "input_too_large":
		// As codex-cli 0.159.2 fails a prompt over its limit: the reason on
		// stderr only, none in the stream.
		fmt.Fprintln(p.Stderr, `Error: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters. (code -32602), data: {"input_error_code":"input_too_large","max_chars":1048576,"actual_chars":1100001}`)
		return 1
	case "exit_silent":
		return 1
	case "exit_flooded":
		// More stderr than any bound keeps, then the reason.
		fmt.Fprintln(p.Stderr, strings.Repeat("noise ", 4000))
		fmt.Fprintln(p.Stderr, "Error: unauthorized")
		return 1
	}
	emit(map[string]any{"type": "turn.started"})
	emit(map[string]any{"type": "error", "message": "Reconnecting... 2/5 (stream disconnected before completion)"})
	emit(map[string]any{"type": "item.completed", "item": map[string]any{"id": "item_0", "type": "error", "message": "Falling back from WebSockets to HTTPS transport."}})

	switch scenario {
	case "hang":
		// Never ends on its own: only a kill ends it.
		return p.Block()
	case "exit_nonzero":
		emit(map[string]any{"type": "error", "message": "unexpected status 401 Unauthorized"})
		fmt.Fprintln(p.Stderr, "Error: unauthorized")
		return 1
	case "error_result":
		emit(map[string]any{"type": "turn.failed", "error": map[string]any{"message": "model stream ended unexpectedly"}})
		return 0
	}
	emit(map[string]any{"type": "item.started", "item": map[string]any{"id": "item_1", "type": "command_execution", "command": "git diff --stat", "status": "in_progress"}})
	emit(map[string]any{"type": "item.completed", "item": map[string]any{"id": "item_1", "type": "command_execution", "command": "git diff --stat", "aggregated_output": " a.txt | 1 +\n", "exit_code": 0, "status": "completed"}})
	text := "All good."
	if schema != nil {
		output := map[string]any{"verdict": "approve", "summary": "Looks fine.", "findings": []any{}}
		if scenario == "request_changes" {
			output = map[string]any{"verdict": "request_changes", "summary": "A real bug.", "findings": []any{map[string]any{"severity": "major", "file": "a.txt", "line": 2, "title": "Off by one", "detail": "Loop bound is wrong."}}}
		}
		data, _ := json.Marshal(output)
		if fromSchema {
			data, _ = json.Marshal(fakeoutput.Instance(schema))
		}
		text = string(data)
	}
	if scenario == "not_json" {
		text = "Here is my answer: looks fine"
	}
	emit(map[string]any{"type": "item.completed", "item": map[string]any{"id": "item_2", "type": "agent_message", "text": text}})
	emit(map[string]any{"type": "turn.completed", "usage": map[string]any{"input_tokens": 1200, "output_tokens": 80}})
	return 0
}
