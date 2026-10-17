package codex_test

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// reported is a tool call as a turn reported it, and how many lines the
// supervisor had begun to give by then.
type reported struct {
	tool codex.Tool
	read int
}

// reports runs a turn over spy and gives what it reported, and its reply.
func reports(t *testing.T, spy *supervisorSpy) ([]reported, codex.Reply) {
	t.Helper()
	var got []reported
	result, err := wrapper(t, spy, t.TempDir()).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}},
		func(tool codex.Tool) { got = append(got, reported{tool: tool, read: spy.given}) })
	if err != nil {
		t.Fatal(err)
	}
	if result.Reply == nil {
		t.Fatal("no reply")
	}
	return got, *result.Reply
}

// itemLine is an item event's line, kind "started" or "completed", of the
// item's fields, JSON without its braces.
func itemLine(kind, fields string) string {
	return `{"type":"item.` + kind + `","item":{` + fields + `}}`
}

// activity.feature, "Commands and searches are reported, messages are
// not".
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
		{tool: codex.Tool{Name: "command", Input: "go test"}, read: 2},
		{tool: codex.Tool{Name: "web_search", Input: "q"}, read: 4},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %+v, want %+v", got, want)
	}
	if reply.Text != "looking" || reply.Session != "t1" || reply.Failure != "" {
		t.Errorf("reply %+v, want the text looking, the session t1, no failure", reply)
	}
}

// Each tool call codex starts is reported once, by what it was given: a
// search that starts with its query as it starts, one without as it
// completes, its action where that says more than its query; a line that
// is no tool call reports nothing.
func TestEachToolCallIsReportedOnceByWhatItWasGiven(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name  string
		lines []string
		want  []codex.Tool
	}{
		{"a command, as it completes too", []string{
			commandLine, itemLine("completed", `"id":"item_1","type":"command_execution","command":"ls","exit_code":0`),
		}, []codex.Tool{{Name: "command", Input: "ls"}}},
		{"a file change", []string{
			itemLine("started", `"id":"item_1","type":"file_change","changes":[{"path":"a.go","kind":"update"}]`),
		}, []codex.Tool{{Name: "file_change", Input: `[{"path":"a.go","kind":"update"}]`}}},
		{"an MCP tool call", []string{
			itemLine("started", `"id":"item_1","type":"mcp_tool_call","server":"docs","tool":"find","arguments":{"q":"x"}`),
		}, []codex.Tool{{Name: "mcp:docs/find", Input: `{"q":"x"}`}}},
		{"a search started with its query", []string{
			itemLine("started", `"id":"item_1","type":"web_search","query":"agister"`),
			itemLine("completed", `"id":"item_1","type":"web_search","query":"agister","action":{"type":"search","query":"agister"}`),
		}, []codex.Tool{{Name: "web_search", Input: "agister"}}},
		{"a search started without its query", []string{
			itemLine("started", `"id":"item_1","type":"web_search","query":"","action":{"type":"other"}`),
			itemLine("completed", `"id":"item_1","type":"web_search","query":"agister","action":{"type":"search","query":"agister"}`),
		}, []codex.Tool{{Name: "web_search", Input: "agister"}}},
		{"a page opened", []string{
			itemLine("completed", `"id":"item_1","type":"web_search","query":"https://x.dev","action":{"type":"open_page","url":"https://x.dev"}`),
		}, []codex.Tool{{Name: "web_search", Input: `https://x.dev {"type":"open_page","url":"https://x.dev"}`}}},
		{"no tool call", []string{threadLine, turnLine, errorLine, reasoningLine, message("x"), notJSONLine}, nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, _ := reports(t, &supervisorSpy{lines: append(c.lines, completedLine)})
			var tools []codex.Tool
			for _, r := range got {
				tools = append(tools, r.tool)
			}
			if !reflect.DeepEqual(tools, c.want) {
				t.Errorf("reported %+v, want %+v", tools, c.want)
			}
		})
	}
}

// A tool call's input is reported short: at most 300 bytes of it, cut at
// the start of a character and marked where it was cut; one that fits is
// whole.
func TestAToolCallsInputIsReportedShort(t *testing.T) {
	t.Parallel()
	for _, n := range []int{10, 150, 151, 400} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			t.Parallel()
			command := strings.Repeat("é", n)
			got, _ := reports(t, &supervisorSpy{lines: []string{
				itemLine("started", fmt.Sprintf(`"id":"item_1","type":"command_execution","command":%q`, command)), completedLine,
			}})
			if len(got) != 1 {
				t.Fatalf("reported %+v, want one call", got)
			}
			text := got[0].tool.Input
			if len(command) <= 300 {
				if text != command {
					t.Errorf("reported %q, want it whole", text)
				}
				return
			}
			cut, marked := strings.CutSuffix(text, "…")
			if !marked || !strings.HasPrefix(command, cut) || len(cut) > 300 || len(cut) < 299 || !utf8.ValidString(cut) {
				t.Errorf("reported %q, want at most 300 bytes of the command, whole characters, then …", text)
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
