package claudecode_test

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// reported is a tool call as a turn reported it, and how many lines the
// supervisor had begun to give by then.
type reported struct {
	tool claudecode.Tool
	read int
}

// reports runs a turn over spy and gives what it reported, and its reply.
func reports(t *testing.T, spy *supervisorSpy) ([]reported, claudecode.Reply) {
	t.Helper()
	var got []reported
	result, err := wrapper(t, spy).Run(context.Background(), claudecode.Turn{Message: "m"}, func(tool claudecode.Tool) {
		got = append(got, reported{tool: tool, read: spy.given})
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

const doneLine = `{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"s1"}`

// activity.feature, "Each tool_use block is reported, its name and its
// input".
func TestEachToolUseBlockIsReportedItsNameAndItsInput(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{
		toolUse(`{"type":"text","text":"x"}`, `{"type":"tool_use","id":"t1","name":"Bash","input":{ "command" : "ls" }}`),
		toolUse(`{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"a.go"}}`),
		doneLine,
	}}
	got, reply := reports(t, spy)
	want := []reported{
		{tool: claudecode.Tool{Name: "Bash", Input: `{"command":"ls"}`}, read: 1},
		{tool: claudecode.Tool{Name: "Read", Input: `{"file_path":"a.go"}`}, read: 2},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("reported %+v, want %+v", got, want)
	}
	if want := (claudecode.Reply{Text: "done", Session: "s1"}); !reflect.DeepEqual(reply, want) {
		t.Errorf("reply %+v, want %+v", reply, want)
	}
}

// activity.feature, "A turn with no tool call reports nothing".
func TestATurnWithNoToolCallReportsNothing(t *testing.T) {
	t.Parallel()
	got, _ := reports(t, &supervisorSpy{lines: []string{initLine, assistant("x"), toolDoneLine, notJSONLine, doneLine}})
	if len(got) > 0 {
		t.Errorf("reported %+v, want nothing", got)
	}
}

// A tool call's input is reported short: at most 300 bytes of it, cut at
// the start of a character and marked where it was cut; one that fits is
// whole.
func TestAToolCallsInputIsReportedShort(t *testing.T) {
	t.Parallel()
	for _, n := range []int{10, 149, 150, 400} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			t.Parallel()
			input := fmt.Sprintf(`{"text":%q}`, strings.Repeat("é", n))
			got, _ := reports(t, &supervisorSpy{lines: []string{toolUse(`{"type":"tool_use","name":"Write","input":` + input + `}`), doneLine}})
			if len(got) != 1 {
				t.Fatalf("reported %+v, want one call", got)
			}
			text := got[0].tool.Input
			if len(input) <= 300 {
				if text != input {
					t.Errorf("reported %q, want it whole, %q", text, input)
				}
				return
			}
			cut, marked := strings.CutSuffix(text, "…")
			if !marked || !strings.HasPrefix(input, cut) || len(cut) > 300 || len(cut) < 299 || !utf8.ValidString(cut) {
				t.Errorf("reported %q, want at most 300 bytes of %q, whole characters, then …", text, input)
			}
		})
	}
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
