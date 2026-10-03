// Package fakepi stands in for `pi -p --mode json`, writing the event
// stream Pi documents (docs/json.md): the session header, then agent,
// turn, message and tool execution events. It keeps sessions as Pi does,
// one JSONL file per session under --session-dir whose first line is the
// header, and resumes one by --session <id> only from the directory it
// ran in. As Pi does at startup, unless it is offline (--offline or
// PI_OFFLINE), it installs each npm package the working directory's
// .pi/settings.json lists and .pi/npm lacks: it reports the `npm install`
// it would run as a point and leaves the package's directory. The scenario
// is chosen by a SCENARIO:<name> marker in the prompt (stdin).
package fakepi

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeoutput"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeproc"
)

// FreshSession is the ID of every session the fake starts.
const FreshSession = "3b0c9a52-6f1e-4d8a-9c47-0e2f5d8b1a63"

// otherSession is the session a mismatch scenario reports on resume.
const otherSession = "9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4"

// Main is the fake as the process p; it returns the code it exits with.
func Main(p fakeproc.Process) int {
	args := p.Args
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-v") {
		version := p.Getenv("FAKE_VERSION")
		if version == "" {
			version = "0.85.1"
		}
		fmt.Fprintln(p.Stdout, version)
		return 0
	}
	flags := map[string]string{}
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--session-dir", "--session", "--model", "--thinking", "--tools", "--append-system-prompt", "--mode":
			if i+1 < len(args) {
				flags[args[i]] = args[i+1]
				i++
			}
		}
	}
	// As Pi does, the system prompt addition is a file's text when it
	// names one.
	system := flags["--append-system-prompt"]
	if data, err := os.ReadFile(p.Path(system)); system != "" && err == nil {
		system = string(data)
	}
	var schema any
	if match := regexp.MustCompile(`(?s)<output-schema>\n(.*)\n</output-schema>`).FindStringSubmatch(system); match != nil {
		_ = json.Unmarshal([]byte(match[1]), &schema)
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

	cwd := p.Dir
	offline := slices.Contains(args, "--offline") || slices.Contains([]string{"1", "true", "yes"}, strings.ToLower(p.Getenv("PI_OFFLINE")))
	if !offline {
		installPackages(p)
	}
	dir := flags["--session-dir"]
	if dir != "" {
		dir = p.Path(dir)
	}
	header := map[string]any{"type": "session", "version": 3, "id": FreshSession, "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "cwd": cwd}
	if id := flags["--session"]; id != "" {
		found, ok := find(dir, id, cwd)
		if !ok {
			fmt.Fprintf(p.Stderr, "No session found matching '%s'\n", id)
			return 1
		}
		header = found
		if scenario == "mismatch" {
			// As a fork would: another session, the resumed one unchanged.
			header = map[string]any{"type": "session", "version": 3, "id": otherSession, "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "cwd": cwd}
			save(dir, header)
		}
	} else if dir != "" {
		save(dir, header)
	}
	// The fake's echo: what it was given, beside the header's own fields.
	echo := map[string]any{"argv": args, "prompt": prompt, "system": system}
	for key, value := range header {
		echo[key] = value
	}
	emit(echo)
	model := p.Getenv("FAKE_MODEL")
	if model == "" {
		model = "minimax-m3"
	}

	switch scenario {
	case "no_result":
		return 0
	case "exit_silent":
		return 1
	case "exit_flooded":
		// More stderr than any bound keeps, then the reason.
		fmt.Fprintln(p.Stderr, strings.Repeat("noise ", 4000))
		fmt.Fprintln(p.Stderr, "Error: No API key found for opencode-go")
		return 1
	}
	emit(map[string]any{"type": "agent_start"})
	emit(map[string]any{"type": "turn_start"})
	emit(map[string]any{"type": "message_start", "message": map[string]any{"role": "user", "content": prompt}})
	emit(map[string]any{"type": "message_end", "message": map[string]any{"role": "user", "content": prompt}})

	switch scenario {
	case "hang":
		// Never ends on its own: only a kill ends it.
		return p.Block()
	case "exit_nonzero":
		fmt.Fprintln(p.Stderr, "Error: 401 Unauthorized")
		return 1
	case "error_result":
		failed := assistant(model, "", "error", 900, 0, 0.0009)
		failed["errorMessage"] = "terminated: model stream ended unexpectedly"
		emit(map[string]any{"type": "message_end", "message": failed})
		emit(map[string]any{"type": "turn_end", "message": failed, "toolResults": []any{}})
		emit(map[string]any{"type": "agent_end", "messages": []any{failed}, "willRetry": false})
		return 0
	}

	call := map[string]any{"type": "toolCall", "id": "call_1", "name": "bash", "arguments": map[string]any{"command": "git diff --stat"}}
	first := assistant(model, "", "toolUse", 1000, 40, 0.0012)
	first["content"] = []any{call}
	emit(map[string]any{"type": "message_end", "message": first})
	emit(map[string]any{"type": "tool_execution_start", "toolCallId": "call_1", "toolName": "bash", "args": call["arguments"]})
	emit(map[string]any{"type": "tool_execution_end", "toolCallId": "call_1", "toolName": "bash", "result": map[string]any{"content": []any{map[string]any{"type": "text", "text": " a.txt | 1 +"}}}, "isError": false})
	result := map[string]any{"role": "toolResult", "toolCallId": "call_1", "toolName": "bash", "content": []any{map[string]any{"type": "text", "text": " a.txt | 1 +"}}, "isError": false}
	emit(map[string]any{"type": "message_end", "message": result})
	emit(map[string]any{"type": "turn_end", "message": first, "toolResults": []any{result}})

	text := "All good."
	if schema != nil {
		data, _ := json.Marshal(map[string]any{"verdict": "approve", "summary": "Looks fine.", "findings": []any{}})
		if fromSchema {
			data, _ = json.Marshal(fakeoutput.Instance(schema))
		}
		text = string(data)
	}
	if scenario == "not_json" {
		text = "Here is my answer: looks fine"
	}
	emit(map[string]any{"type": "turn_start"})
	final := assistant(model, text, "stop", 1200, 80, 0.0021)
	emit(map[string]any{"type": "message_end", "message": final})
	emit(map[string]any{"type": "turn_end", "message": final, "toolResults": []any{}})
	emit(map[string]any{"type": "agent_end", "messages": []any{first, result, final}, "willRetry": false})
	return 0
}

// assistant is an assistant message of model as message_end carries it,
// with its usage and cost.
func assistant(model, text, stopReason string, input, output int, cost float64) map[string]any {
	content := []any{}
	if text != "" {
		content = append(content, map[string]any{"type": "text", "text": text})
	}
	return map[string]any{
		"role": "assistant", "content": content, "api": "openai-completions", "provider": "opencode-go", "model": model,
		"usage": map[string]any{
			"input": input, "output": output, "cacheRead": 0, "cacheWrite": 0, "totalTokens": input + output,
			"cost": map[string]any{"input": cost / 2, "output": cost / 2, "cacheRead": 0, "cacheWrite": 0, "total": cost},
		},
		"stopReason": stopReason, "timestamp": time.Now().UnixMilli(),
	}
}

// save writes a session's file under dir, its header the first line.
func save(dir string, header map[string]any) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return
	}
	data, _ := json.Marshal(header)
	name := strings.NewReplacer(":", "-", ".", "-").Replace(header["timestamp"].(string)) + "_" + header["id"].(string) + ".jsonl"
	_ = os.WriteFile(filepath.Join(dir, name), append(data, '\n'), 0o600)
}

// installPackages installs, as Pi's package manager does, each npm
// package of the project's settings that is not installed yet: it reports
// the command Pi would run and leaves the package's directory.
func installPackages(p fakeproc.Process) {
	cwd := p.Dir
	data, err := os.ReadFile(filepath.Join(cwd, ".pi", "settings.json"))
	if err != nil {
		return
	}
	var settings struct{ Packages []json.RawMessage }
	_ = json.Unmarshal(data, &settings)
	root := filepath.Join(cwd, ".pi", "npm")
	for _, raw := range settings.Packages {
		var source string
		if json.Unmarshal(raw, &source) != nil {
			var object struct{ Source string }
			_ = json.Unmarshal(raw, &object)
			source = object.Source
		}
		spec, ok := strings.CutPrefix(source, "npm:")
		if !ok {
			continue
		}
		if _, err := os.Stat(filepath.Join(root, "node_modules", spec)); err == nil {
			continue
		}
		p.Report("npm install " + spec)
		_ = os.MkdirAll(filepath.Join(root, "node_modules", spec), 0o700)
	}
}

// find is the header of session id under dir, when it ran in cwd. dir is
// a literal path, whatever it holds.
func find(dir, id, cwd string) (map[string]any, bool) {
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".jsonl" {
			continue
		}
		file, err := os.Open(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(file)
		var header map[string]any
		if scanner.Scan() {
			_ = json.Unmarshal(scanner.Bytes(), &header)
		}
		file.Close()
		if header["id"] == id && header["cwd"] == cwd {
			return header, true
		}
	}
	return nil, false
}
