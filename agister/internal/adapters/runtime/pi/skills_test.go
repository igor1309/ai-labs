package pi_test

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
)

func TestSkillsChangeOnlyTheirArgumentsOrConfiguration(t *testing.T) {
	t.Parallel()
	r := pi.TurnRequest{Primitives: []string{"read"}}
	base, err := pi.Arguments(r, "/sessions", "", "/ignored")
	want := []string{"-p", "--mode", "json", "--no-extensions", "--no-prompt-templates", "--no-themes", "--approve", "--offline", "--session-dir", "/sessions", "--tools", "read"}
	if err != nil || !reflect.DeepEqual(base, want) {
		t.Fatalf("without skills: %q, %v", base, err)
	}
	r.Skills = []pi.Skill{{Name: "review"}, {Name: "style"}}
	args, err := pi.Arguments(r, "/sessions", "", "/skills")
	want = append(want, "--skill", "/skills/review", "--skill", "/skills/style")
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
	if err := pi.WriteSkills(dir, []pi.Skill{{Name: "review", Bytes: []byte("recorded")}}); err == nil {
		t.Fatal("writing skills over a regular file succeeded")
	}
}
