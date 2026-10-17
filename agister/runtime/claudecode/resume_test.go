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
