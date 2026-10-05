package claudecode_test

import (
	"os"
	"path/filepath"
	"reflect"
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
