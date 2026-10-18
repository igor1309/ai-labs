package codex_test

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// reported is a line as a turn reported it, and how many lines the
// supervisor had begun to give by then.
type reported struct {
	report codex.Report
	read   int
}

// reports runs a turn over spy and gives what it reported, and its reply.
func reports(t *testing.T, spy *supervisorSpy) ([]reported, codex.Reply) {
	t.Helper()
	var got []reported
	result, err := wrapper(t, spy, t.TempDir()).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}},
		func(r codex.Report) { got = append(got, reported{report: r, read: spy.given}) })
	if err != nil {
		t.Fatal(err)
	}
	if result.Reply == nil {
		t.Fatal("no reply")
	}
	return got, *result.Reply
}

// tools is each tool call of what a turn reported, in order.
func tools(got []reported) []codex.Tool {
	var calls []codex.Tool
	for _, r := range got {
		if r.report.Tool != nil {
			calls = append(calls, *r.report.Tool)
		}
	}
	return calls
}

// itemLine is an item event's line, kind "started" or "completed", of the
// item's fields, JSON without its braces.
func itemLine(kind, fields string) string {
	return `{"type":"item.` + kind + `","item":{` + fields + `}}`
}

// tool is the report of a tool call of name, given input.
func tool(name, input string) codex.Report {
	return codex.Report{Tool: &codex.Tool{Name: name, Input: input}}
}

// line is the report of a line that makes no tool call.
var line = codex.Report{}

// result is the report of a tool's result.
var result = codex.Report{Result: true}

// results is how many tools' results a turn reported.
func results(got []reported) int {
	n := 0
	for _, r := range got {
		if r.report.Result {
			n++
		}
	}
	return n
}

// activity.feature, "Commands and searches are reported, messages are
// not": each other line is reported as a line, and the search, reported as
// it completes, is its result too, as "A tool item's completion reports a
// tool's result" has it.
func TestCommandsAndSearchesAreReportedMessagesAreNot(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{
		threadLine,
		itemLine("started", `"id":"item_1","type":"command_execution","command":"go test","status":"in_progress"`),
		message("looking"),
		itemLine("completed", `"id":"item_2","type":"web_search","query":"q","action":{"type":"search","query":"q"}`),
		completedLine,
	}}
	got, reply := reports(t, spy)
	want := []reported{
		{report: line, read: 1},
		{report: tool("command", "go test"), read: 2},
		{report: line, read: 3},
		{report: tool("web_search", "q"), read: 4},
		{report: result, read: 4},
		{report: line, read: 5},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %s, want %s", shown(got), shown(want))
	}
	if reply.Text != "looking" || reply.Session != "t1" || reply.Failure != "" {
		t.Errorf("reply %+v, want the text looking, the session t1, no failure", reply)
	}
}

// activity.feature, "Every other line is reported as a line".
func TestEveryOtherLineIsReportedAsALine(t *testing.T) {
	t.Parallel()
	got, _ := reports(t, &supervisorSpy{lines: []string{threadLine, reasoningLine, completedLine}})
	want := []reported{{report: line, read: 1}, {report: line, read: 2}, {report: line, read: 3}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %s, want %s", shown(got), shown(want))
	}
}

// activity.feature, "A command is reported whole".
func TestACommandIsReportedWhole(t *testing.T) {
	t.Parallel()
	command := strings.Repeat("é", 249) + "ab"
	if len(command) != 500 {
		t.Fatalf("the command is %d bytes, want 500", len(command))
	}
	got, _ := reports(t, &supervisorSpy{lines: []string{
		itemLine("started", fmt.Sprintf(`"id":"item_1","type":"command_execution","command":%q`, command)), completedLine,
	}})
	if want := []codex.Tool{{Name: "command", Input: command}}; !reflect.DeepEqual(tools(got), want) {
		t.Errorf("reported %s, want the command whole", shown(got))
	}
}

// activity.feature, "A tool item's completion reports a tool's result".
func TestAToolItemsCompletionReportsAToolsResult(t *testing.T) {
	t.Parallel()
	got, _ := reports(t, &supervisorSpy{lines: []string{
		itemLine("started", `"id":"item_1","type":"command_execution","command":"go test","status":"in_progress"`),
		itemLine("completed", `"id":"item_1","type":"command_execution","command":"go test","exit_code":0`),
		message("ran"),
		itemLine("started", `"id":"item_4","type":"web_search","query":"","action":{"type":"other"}`),
		itemLine("completed", `"id":"item_4","type":"web_search","query":"q","action":{"type":"search","query":"q"}`),
		completedLine,
	}})
	want := []reported{
		{report: tool("command", "go test"), read: 1}, {report: result, read: 2}, {report: line, read: 3}, {report: line, read: 4},
		{report: tool("web_search", "q"), read: 5}, {report: result, read: 5}, {report: line, read: 6},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %s, want %s", shown(got), shown(want))
	}
}

// shown is what a turn reported, as a test reads it: each tool call its
// name and input, each tool's result "a result", each other line "a line",
// and the lines read by then.
func shown(reports []reported) string {
	var parts []string
	for _, r := range reports {
		what := "a line"
		if tool := r.report.Tool; tool != nil {
			what = fmt.Sprintf("%s %s", tool.Name, tool.Input)
		} else if r.report.Result {
			what = "a result"
		}
		parts = append(parts, fmt.Sprintf("%s (read %d)", what, r.read))
	}
	return "[" + strings.Join(parts, "; ") + "]"
}

// Each tool call codex starts is reported once, by what it was given: a
// search that starts with its query as it starts, one without as it
// completes, its action where that says more than its query; each tool
// item's completion is its result; a line that is no tool call reports
// nothing.
func TestEachToolCallIsReportedOnceByWhatItWasGiven(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name    string
		lines   []string
		want    []codex.Tool
		results int
	}{
		{"a command, as it completes too", []string{
			commandLine, itemLine("completed", `"id":"item_1","type":"command_execution","command":"ls","exit_code":0`),
		}, []codex.Tool{{Name: "command", Input: "ls"}}, 1},
		{"a file change", []string{
			itemLine("started", `"id":"item_1","type":"file_change","changes":[{"path":"a.go","kind":"update"}]`),
			itemLine("completed", `"id":"item_1","type":"file_change","changes":[{"path":"a.go","kind":"update"}],"status":"completed"`),
		}, []codex.Tool{{Name: "file_change", Input: `[{"path":"a.go","kind":"update"}]`}}, 1},
		{"an MCP tool call", []string{
			itemLine("started", `"id":"item_1","type":"mcp_tool_call","server":"docs","tool":"find","arguments":{"q":"x"}`),
			itemLine("completed", `"id":"item_1","type":"mcp_tool_call","server":"docs","tool":"find","arguments":{"q":"x"},"status":"completed"`),
		}, []codex.Tool{{Name: "mcp:docs/find", Input: `{"q":"x"}`}}, 1},
		{"a search started with its query", []string{
			itemLine("started", `"id":"item_1","type":"web_search","query":"agister"`),
			itemLine("completed", `"id":"item_1","type":"web_search","query":"agister","action":{"type":"search","query":"agister"}`),
		}, []codex.Tool{{Name: "web_search", Input: "agister"}}, 1},
		{"a search started without its query", []string{
			itemLine("started", `"id":"item_1","type":"web_search","query":"","action":{"type":"other"}`),
			itemLine("completed", `"id":"item_1","type":"web_search","query":"agister","action":{"type":"search","query":"agister"}`),
		}, []codex.Tool{{Name: "web_search", Input: "agister"}}, 1},
		{"a page opened", []string{
			itemLine("completed", `"id":"item_1","type":"web_search","query":"https://x.dev","action":{"type":"open_page","url":"https://x.dev"}`),
		}, []codex.Tool{{Name: "web_search", Input: `https://x.dev {"type":"open_page","url":"https://x.dev"}`}}, 1},
		{"no tool call", []string{threadLine, turnLine, errorLine, reasoningLine, message("x"), notJSONLine}, nil, 0},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, _ := reports(t, &supervisorSpy{lines: append(c.lines, completedLine)})
			if !reflect.DeepEqual(tools(got), c.want) {
				t.Errorf("reported %s, want %+v", shown(got), c.want)
			}
			if n := results(got); n != c.results {
				t.Errorf("reported %s, want %d results", shown(got), c.results)
			}
			// Each line is reported, in order; a search reported as it
			// completes is two reports of its one line, called and done.
			read := 0
			for _, r := range got {
				if r.read != read && r.read != read+1 {
					read = -1
					break
				}
				read = r.read
			}
			if read != len(c.lines)+1 {
				t.Errorf("reported %s, want each of %d lines reported", shown(got), len(c.lines)+1)
			}
		})
	}
}

// A turn is given its report: one given none is an error before anything
// starts.
func TestATurnGivenNoReportIsAnError(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{}
	folder := t.TempDir()
	_, err := wrapper(t, spy, folder).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}, Schema: []byte("{}")}, nil)
	if err == nil || err.Error() != "codex: no report" {
		t.Errorf("error %v, want codex: no report", err)
	}
	if len(spy.asked) > 0 {
		t.Errorf("asked %+v, want nothing", spy.asked)
	}
	empty(t, folder)
}
