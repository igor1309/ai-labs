package claudecode_test

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
)

func TestSkillsChangeOnlyTheirArgumentsOrConfiguration(t *testing.T) {
	t.Parallel()
	r := claudecode.TurnRequest{Primitives: []string{"Read"}}
	base, err := claudecode.Arguments(r, "/ignored")
	want := []string{"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--tools=Read,Skill", "--allowedTools=Read,Skill", "--strict-mcp-config"}
	if err != nil || !reflect.DeepEqual(base, want) {
		t.Fatalf("without skills: %q, %v", base, err)
	}
	r.Skills = []claudecode.Skill{{Name: "review"}, {Name: "style"}}
	args, err := claudecode.Arguments(r, "/plugin")
	want = append(want, "--plugin-dir", "/plugin")
	if err != nil || !reflect.DeepEqual(args, want) {
		t.Fatalf("with skills: %q, %v", args, err)
	}
}

// A filesystem write failure is returned, rather than silently losing skills.
func TestSkillsCannotBeWrittenOverAFile(t *testing.T) {
	t.Parallel()
	dir := filepath.Join(t.TempDir(), "blocked")
	if err := os.WriteFile(dir, []byte("bad input"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := claudecode.WritePlugin(dir, []claudecode.Skill{{Name: "review", Bytes: []byte("recorded")}}); err == nil {
		t.Fatal("writing skills over a regular file succeeded")
	}
}

// A skill that cannot be written fails the turn before the runtime starts,
// and the turn's own temporary folder goes with what was written into it
// before: the folder it was made in is left empty.
func TestATurnWhoseSkillCannotBeWrittenLeavesNoTemporaryFolder(t *testing.T) {
	t.Parallel()
	spy := &spyTransport{}
	temp := t.TempDir()
	runner := &claudecode.Runner{Transport: spy, Command: "claude", TempDir: temp}
	r := request("hello")
	r.Skills = []claudecode.Skill{{Name: "review", Bytes: []byte("recorded review\n")}, {Name: "../escape"}}
	turn := runner.RunTurn(context.Background(), r, &sink{})
	if turn.Status != claudecode.Failed || turn.Error == nil || turn.Error.Class != claudecode.ClassInternal || !strings.Contains(turn.Error.Message, "not a folder's name") || len(spy.Specs()) != 0 {
		t.Fatalf("turn = %+v, specs %+v", turn, spy.Specs())
	}
	if found, err := os.ReadDir(temp); err != nil || len(found) != 0 {
		t.Fatalf("the temporary folder holds %v, %v", found, err)
	}
}
