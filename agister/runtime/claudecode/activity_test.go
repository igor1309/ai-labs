package claudecode_test

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// reported is a line as a turn reported it, and how many lines the
// supervisor had begun to give by then.
type reported struct {
	report claudecode.Report
	read   int
}

// reports runs a turn over spy and gives what it reported, and its reply.
func reports(t *testing.T, spy *supervisorSpy) ([]reported, claudecode.Reply) {
	t.Helper()
	var got []reported
	result, err := wrapper(t, spy).Run(context.Background(), claudecode.Turn{Message: "m"}, func(r claudecode.Report) {
		got = append(got, reported{report: r, read: spy.given})
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Reply == nil {
		t.Fatal("no reply")
	}
	return got, *result.Reply
}

// toolUse is an assistant event's line, of the blocks given, each JSON.
func toolUse(blocks ...string) string {
	return `{"type":"assistant","message":{"content":[` + strings.Join(blocks, ",") + `]},"session_id":"s1"}`
}

// tool is the report of a tool call of name, given input.
func tool(name, input string) claudecode.Report {
	return claudecode.Report{Tool: &claudecode.Tool{Name: name, Input: input}}
}

// line is the report of a line that makes no tool call.
var line = claudecode.Report{}

const doneLine = `{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"s1"}`

// activity.feature, "Each tool_use block is reported, its name and its
// input", the result's line reported as a line.
func TestEachToolUseBlockIsReportedItsNameAndItsInput(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{
		toolUse(`{"type":"text","text":"x"}`, `{"type":"tool_use","id":"t1","name":"Bash","input":{ "command" : "ls" }}`),
		toolUse(`{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"a.go"}}`),
		doneLine,
	}}
	got, reply := reports(t, spy)
	want := []reported{
		{report: tool("Bash", `{"command":"ls"}`), read: 1},
		{report: tool("Read", `{"file_path":"a.go"}`), read: 2},
		{report: line, read: 3},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %s, want %s", shown(got), shown(want))
	}
	if want := (claudecode.Reply{Text: "done", Session: "s1"}); !reflect.DeepEqual(reply, want) {
		t.Errorf("reply %+v, want %+v", reply, want)
	}
}

// activity.feature, "A turn with no tool call reports nothing": no tool
// call, each of its lines a line, as "Every other line is reported as a
// line" has it, one that is not JSON among them.
func TestATurnWithNoToolCallReportsNothing(t *testing.T) {
	t.Parallel()
	lines := []string{initLine, assistant("x"), toolDoneLine, notJSONLine, doneLine}
	got, _ := reports(t, &supervisorSpy{lines: lines})
	var want []reported
	for i := range lines {
		want = append(want, reported{report: line, read: i + 1})
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %s, want %s", shown(got), shown(want))
	}
}

// activity.feature, "Every other line is reported as a line, a tool call
// whole": an input of 500 bytes, as JSON on one line.
func TestEveryOtherLineIsReportedAsALineAToolCallWhole(t *testing.T) {
	t.Parallel()
	input := fmt.Sprintf(`{"text":%q}`, strings.Repeat("é", 244)+"a")
	if len(input) != 500 {
		t.Fatalf("the input is %d bytes, want 500", len(input))
	}
	got, _ := reports(t, &supervisorSpy{lines: []string{
		initLine, toolUse(`{"type":"tool_use","name":"Write","input":` + input + `}`), toolDoneLine, doneLine,
	}})
	want := []reported{{report: line, read: 1}, {report: tool("Write", input), read: 2}, {report: line, read: 3}, {report: line, read: 4}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %s, want %s", shown(got), shown(want))
	}
}

// shown is what a turn reported, as a test reads it: each tool call its
// name and input, each other line "a line", and the lines read by then.
func shown(reports []reported) string {
	var parts []string
	for _, r := range reports {
		what := "a line"
		if tool := r.report.Tool; tool != nil {
			what = fmt.Sprintf("%s %s", tool.Name, tool.Input)
		}
		parts = append(parts, fmt.Sprintf("%s (read %d)", what, r.read))
	}
	return "[" + strings.Join(parts, "; ") + "]"
}

// A turn is given its report: one given none is an error before anything
// starts.
func TestATurnGivenNoReportIsAnError(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{}
	if _, err := wrapper(t, spy).Run(context.Background(), claudecode.Turn{Message: "m"}, nil); err == nil || err.Error() != "claude-code: no report" {
		t.Errorf("error %v, want claude-code: no report", err)
	}
	if len(spy.asked) > 0 {
		t.Errorf("asked %+v, want nothing", spy.asked)
	}
}
