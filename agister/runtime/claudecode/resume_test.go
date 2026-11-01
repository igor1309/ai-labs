package claudecode_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// resume.feature, "A turn given a session resumes it": --resume and the
// session last, after what the turn gives besides.
func TestATurnGivenASessionResumesIt(t *testing.T) {
	t.Parallel()
	head := []string{"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"}
	args := func(more ...string) []string { return append(append([]string{}, head...), more...) }
	for _, c := range []struct {
		name string
		turn claudecode.Turn
		want claudecode.Program
	}{
		{
			name: "nothing else given",
			turn: claudecode.Turn{Message: "m", Session: "s1"},
			want: claudecode.Program{Name: "claude", Stdin: "m", Args: args(
				"--tools=Skill", "--allowedTools=Skill", "--strict-mcp-config", "--resume", "s1")},
		},
		{
			name: "all given",
			turn: claudecode.Turn{Message: "m", Dir: "/r", Instruction: "i", Model: "opus", Effort: "high",
				Options: []string{"Read"}, Schema: []byte("{}"), Session: "s1"},
			want: claudecode.Program{Name: "claude", Dir: "/r", Stdin: "m", Args: args(
				"--tools=Read,Skill", "--allowedTools=Read,Skill", "--strict-mcp-config",
				"--model", "opus", "--effort", "high", "--append-system-prompt", "i", "--json-schema", "{}", "--resume", "s1")},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &supervisorSpy{}
			if _, err := wrapper(t, spy).Run(context.Background(), c.turn, discard); err != nil {
				t.Fatal(err)
			}
			if want := []claudecode.Program{c.want}; !reflect.DeepEqual(spy.asked, want) {
				t.Errorf("asked\n got %+v\nwant %+v", spy.asked, want)
			}
		})
	}
}

// resume.feature, "A turn a signal ended gives the session it read": the
// session of the first line that names one, whatever its type, a line
// before it naming none; the reply's the same.
func TestATurnASignalEndedGivesTheSessionItRead(t *testing.T) {
	t.Parallel()
	terminated := claudecode.Ended{Signal: "terminated"}
	other := `{"type":"assistant","message":{"content":[{"type":"text","text":"x"}]},"session_id":"s2"}`
	for _, c := range []struct {
		name  string
		lines []string
	}{
		{"the init event", []string{initLine, other}},
		{"a tool call", []string{notJSONLine, `{"type":"system","subtype":"hook_started"}`, toolUseLine, other}},
		{"a rate limit event", []string{allowedLine, other}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, err := wrapper(t, &supervisorSpy{lines: c.lines, result: terminated}).Run(context.Background(), claudecode.Turn{Message: "m"}, discard)
			if err != nil {
				t.Fatal(err)
			}
			if want := (claudecode.Result{Ended: terminated, Session: "s1"}); !reflect.DeepEqual(got, want) {
				t.Errorf("turn gave %+v, want %+v", got, want)
			}
			exited := &supervisorSpy{lines: c.lines}
			if got := reply(t, exited, nil); got.Session != "s1" {
				t.Errorf("the reply of a turn that exited: session %q, want s1", got.Session)
			}
		})
	}
}
