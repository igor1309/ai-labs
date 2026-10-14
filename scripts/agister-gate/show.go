package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

// show prints the trail at path, an events.jsonl or the out dir that holds
// one, for a person to read: each step the gate started, with its options,
// then what it did, in order, and why it stopped. A run's output and
// standard error are counted, not shown, unless full: the trail keeps them,
// and each run's own record holds what it did.
func show(path string, full bool, stdout io.Writer) error {
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		path = filepath.Join(path, trailFile)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if _, err := whole(data); err != nil {
		return fmt.Errorf("trail %s is damaged: %w", path, err)
	}
	var b strings.Builder
	running := map[string]time.Time{}
	steps := 0
	for line := range strings.Lines(string(data)) {
		var e event
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			return err
		}
		d := e.Data
		at := e.At.Local().Format("15:04:05")
		switch e.Kind {
		case "GATE_STARTED":
			steps++
			if steps > 1 {
				b.WriteString("\n")
			}
			fmt.Fprintf(&b, "Step %d, started %s at %s, %v review(s) counted\n", steps,
				e.At.Local().Format("2006-01-02 15:04:05"), d["from"], d["reviews"])
			fmt.Fprintf(&b, "  title      %v\n", d["title"])
			for _, k := range []string{"issue", "constraints", "base", "implement", "review", "advisor", "decisions",
				"message", "dir", "out", "reviewed"} {
				if v, ok := d[k]; ok && v != "" {
					fmt.Fprintf(&b, "  %-10s %v\n", k, v)
				}
			}
			if d["minors"] == true {
				b.WriteString("  minors     fixed with the majors\n")
			}
			b.WriteString("\n")
		case "BASE_PINNED":
			fmt.Fprintf(&b, "%s  base pinned at %v\n", at, d["base"])
		case "COMMAND_STARTED":
			running[strings.Join(strs(d["command"]), "\x00")] = e.At
			fmt.Fprintf(&b, "%s  ran %s\n", at, quoted(strs(d["command"])))
		case "COMMAND_FINISHED":
			result := "ok"
			if msg, ok := d["error"].(string); ok {
				result = "failed: " + msg
			}
			key := strings.Join(strs(d["command"]), "\x00")
			if began, ok := running[key]; ok {
				result += ", " + e.At.Sub(began).Round(time.Second).String()
				delete(running, key)
			}
			fmt.Fprintf(&b, "%s    %s\n", at, result)
			output, _ := d["output"].(string)
			stderr, _ := d["stderr"].(string)
			if full {
				block(&b, "output", output)
				block(&b, "stderr", stderr)
				break
			}
			switch out := strings.TrimSpace(output); {
			case runOf(output) != "":
				fmt.Fprintf(&b, "          %s\n", runOf(output))
			case out != "" && !strings.Contains(out, "\n") && len(out) <= 100:
				fmt.Fprintf(&b, "          output: %s\n", out)
			case out != "":
				fmt.Fprintf(&b, "          output: %d line(s)\n", strings.Count(out, "\n")+1)
			}
			if n := strings.Count(strings.TrimSpace(stderr), "\n"); stderr != "" {
				fmt.Fprintf(&b, "          stderr: %d line(s)\n", n+1)
			}
		case "FILE_READ":
			fmt.Fprintf(&b, "%s  read %v %v (%v bytes, sha256 %s)\n", at, d["what"], d["path"], d["bytes"], short(d["sha256"]))
		case "FILE_WRITTEN":
			fmt.Fprintf(&b, "%s  wrote %v %v (%v bytes, sha256 %s)\n", at, d["what"], d["path"], d["bytes"], short(d["sha256"]))
			from, _ := d["from"].(map[string]any)
			for _, k := range sorted(from) {
				if k == "items" {
					continue
				}
				if v := from[k]; v != "" && v != nil {
					fmt.Fprintf(&b, "          from %s: %v\n", k, v)
				}
			}
			for _, it := range maps(from["items"]) {
				fmt.Fprintf(&b, "          acts on: %v (%s)\n", it["title"], strings.Join(strs(it["sources"]), ", "))
			}
		case "RULINGS_READ":
			fmt.Fprintf(&b, "%s  review %v, run %v: the judge's rulings\n", at, d["review"], d["run_id"])
			for _, it := range maps(d["items"]) {
				fmt.Fprintf(&b, "          - [%v %v] %v\n", it["severity"], it["ruling"], it["title"])
				fmt.Fprintf(&b, "              gate: %v\n", it["gate"])
			}
		case "COMMITTED":
			fmt.Fprintf(&b, "%s  committed %v: %v\n", at, d["commit"], d["message"])
			for _, f := range strs(d["files"]) {
				fmt.Fprintf(&b, "          %s\n", f)
			}
			from, _ := d["from"].(map[string]any)
			for _, k := range sorted(from) {
				fmt.Fprintf(&b, "          from %s: %v\n", k, from[k])
			}
		case "STOPPED":
			fmt.Fprintf(&b, "%s  stopped, %v (exit %v): %v\n", at, d["status"], d["exit"], d["reason"])
		default:
			fmt.Fprintf(&b, "%s  %s %v\n", at, e.Kind, d)
		}
	}
	_, err = io.WriteString(stdout, b.String())
	return err
}

// runOf is what an agister run's JSON result says of the run: its id and
// status, or "" when output is not one.
func runOf(output string) string {
	var r struct {
		RunID  string `json:"run_id"`
		Status string `json:"status"`
	}
	if json.Unmarshal([]byte(output), &r) != nil || r.RunID == "" {
		return ""
	}
	return fmt.Sprintf("run %s %s", r.RunID, r.Status)
}

func block(b *strings.Builder, name, text string) {
	if strings.TrimSpace(text) == "" {
		return
	}
	fmt.Fprintf(b, "          %s:\n", name)
	for line := range strings.Lines(text) {
		fmt.Fprintf(b, "            %s\n", strings.TrimRight(line, "\n"))
	}
}

// quoted is command as a shell would take it: an argument with a space, a
// quote or nothing in it is quoted.
func quoted(command []string) string {
	args := make([]string, len(command))
	for i, arg := range command {
		args[i] = arg
		if arg == "" || strings.ContainsAny(arg, " \t\n'\"\\") {
			args[i] = strconv.Quote(arg)
		}
	}
	return strings.Join(args, " ")
}

// short is the first 12 hex digits of a digest.
func short(v any) string {
	s, _ := v.(string)
	s = strings.TrimPrefix(s, "sha256:")
	return s[:min(len(s), 12)]
}

func strs(v any) []string {
	list, _ := v.([]any)
	out := make([]string, len(list))
	for i, s := range list {
		out[i], _ = s.(string)
	}
	return out
}

func maps(v any) []map[string]any {
	var out []map[string]any
	list, _ := v.([]any)
	for _, x := range list {
		if m, ok := x.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func sorted(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}
