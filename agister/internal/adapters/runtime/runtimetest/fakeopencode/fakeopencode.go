// Package fakeopencode stands in for `opencode run --format json`, writing
// the event stream OpenCode 1.18.33 writes: step_start, tool_use, text and
// step_finish events, each with the session's ID, and error events. As
// OpenCode does, it reads the message from stdin, takes its agent from the
// inline config (OPENCODE_CONFIG_CONTENT) by --agent, falling back to its
// default agent with a warning on stderr when the config defines none of
// that name, and continues the session -s names under its ID. The scenario
// is chosen by a SCENARIO:<name> marker in the message.
package fakeopencode

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeoutput"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeproc"
)

// FreshSession is the ID of every session the fake starts.
const FreshSession = "ses_f06fe64c3ffeLyBkwYK7e1GfJs"

// otherSession is the session a mismatch scenario reports on resume.
const otherSession = "ses_f06fbff23ffeqrbS7AUw5mNrNc"

// Main is the fake as the process p; it returns the code it exits with.
func Main(p fakeproc.Process) int {
	args := p.Args
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-v") {
		version := p.Getenv("FAKE_VERSION")
		if version == "" {
			version = "1.18.33"
		}
		fmt.Fprintln(p.Stdout, version)
		return 0
	}
	flags := map[string]string{}
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--format", "--agent", "-m", "--variant", "-s":
			if i+1 < len(args) {
				flags[args[i]] = args[i+1]
				i++
			}
		}
	}
	input, _ := io.ReadAll(p.Stdin)
	prompt := string(input)
	if len(args) == 0 || args[0] != "run" || prompt == "" {
		fmt.Fprintln(p.Stderr, "Error: You must provide a message or a command")
		return 1
	}

	config := p.Getenv("OPENCODE_CONFIG_CONTENT")
	var parsed struct {
		Agent map[string]struct {
			Prompt     string
			Permission json.RawMessage
		}
	}
	_ = json.Unmarshal([]byte(config), &parsed)
	agent, defined := parsed.Agent[flags["--agent"]]
	if !defined {
		fmt.Fprintf(p.Stderr, "! agent %q not found. Falling back to default agent\n", flags["--agent"])
	}
	var schema any
	if match := regexp.MustCompile(`(?s)<output-schema>\n(.*)\n</output-schema>`).FindStringSubmatch(agent.Prompt); match != nil {
		_ = json.Unmarshal([]byte(match[1]), &schema)
	}
	scenario := "approve"
	if match := regexp.MustCompile(`SCENARIO:([a-z_]+)`).FindStringSubmatch(prompt); match != nil {
		scenario = match[1]
	}
	fromSchema := fakeoutput.Enabled(p.Getenv)
	if fromSchema {
		// The prompt carries real files then: no marker in them is a scenario.
		scenario = "approve"
	}

	session := FreshSession
	if id := flags["-s"]; id != "" {
		session = id
		if scenario == "mismatch" {
			// As a fork would: another session, the resumed one unchanged.
			session = otherSession
		}
	}
	emit := func(kind string, fields map[string]any) {
		message := map[string]any{"type": kind, "timestamp": time.Now().UnixMilli(), "sessionID": session}
		for key, value := range fields {
			message[key] = value
		}
		data, _ := json.Marshal(message)
		fmt.Fprintln(p.Stdout, string(data))
	}
	part := func(kind string, fields map[string]any) map[string]any {
		part := map[string]any{"type": kind, "sessionID": session, "messageID": "msg_0f9019b71001FYIh5VqZT5SzI1"}
		for key, value := range fields {
			part[key] = value
		}
		return map[string]any{"part": part}
	}
	finish := func(reason string, input, output int, cost float64) {
		emit("step_finish", part("step-finish", map[string]any{
			"reason": reason, "cost": cost,
			"tokens": map[string]any{"total": input + output, "input": input, "output": output, "reasoning": 0, "cache": map[string]any{"write": 0, "read": 0}},
		}))
	}

	// The fake's echo: what it was given. OpenCode writes no such line.
	cwd := p.Dir
	data, _ := json.Marshal(map[string]any{"type": "fake_echo", "argv": args, "prompt": prompt, "config": config, "system": agent.Prompt, "permission": agent.Permission, "cwd": cwd, "id": session})
	fmt.Fprintln(p.Stdout, string(data))

	switch scenario {
	case "no_result":
		return 0
	case "exit_silent":
		return 1
	case "exit_flooded":
		// More stderr than any bound keeps, then the reason.
		fmt.Fprintln(p.Stderr, strings.Repeat("noise ", 4000))
		fmt.Fprintln(p.Stderr, "Error: Session not found")
		return 1
	}
	emit("step_start", part("step-start", nil))

	switch scenario {
	case "hang":
		// Never ends on its own: only a kill ends it.
		return p.Block()
	case "exit_nonzero":
		fmt.Fprintln(p.Stderr, "Error: 401 Unauthorized")
		return 1
	case "error_result":
		// OpenCode exits 1 after an error; the fake exits 0, so only the
		// event says the turn failed.
		emit("error", map[string]any{"error": map[string]any{"name": "UnknownError", "data": map[string]any{"message": "Unexpected server error. Check server logs for details.", "ref": "err_bcdf0f96"}}})
		return 0
	}

	now := time.Now().UnixMilli()
	emit("tool_use", part("tool", map[string]any{
		"tool": "bash", "callID": "call_1",
		"state": map[string]any{
			"status": "completed", "input": map[string]any{"command": "git diff --stat", "description": "Show the diff"},
			"output": " a.txt | 1 +", "title": "Show the diff", "metadata": map[string]any{"exit": 0},
			"time": map[string]any{"start": now, "end": now + 12},
		},
	}))
	finish("tool-calls", 1000, 40, 0.0012)

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
	emit("step_start", part("step-start", nil))
	emit("text", part("text", map[string]any{"text": text, "time": map[string]any{"start": now, "end": now + 30}}))
	finish("stop", 1200, 80, 0.0021)
	return 0
}
