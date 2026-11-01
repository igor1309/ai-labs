package opencode_test

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
)

func TestSkillsChangeOnlyTheirArgumentsOrConfiguration(t *testing.T) {
	t.Parallel()
	r := opencode.TurnRequest{Primitives: []string{"skill"}}
	wantArgs := []string{"run", "--format", "json", "--pure", "--agent", "agister-1"}
	wantConfig := `{"agent":{"agister-1":{"mode":"primary","permission":{"*":"deny","skill":"allow"}}}}`
	args, err := opencode.Arguments(r, "agister-1")
	if err != nil || !reflect.DeepEqual(args, wantArgs) || opencode.Config(r, "agister-1", "/ignored") != wantConfig {
		t.Fatalf("without skills: %q, %s, %v", args, opencode.Config(r, "agister-1", "/ignored"), err)
	}
	r.Skills = []opencode.Skill{{Name: "review"}, {Name: "style"}}
	args, err = opencode.Arguments(r, "agister-1")
	wantConfig = `{"agent":{"agister-1":{"mode":"primary","permission":{"*":"deny","skill":"allow"}}},"skills":{"paths":["/skills"]}}`
	if err != nil || !reflect.DeepEqual(args, wantArgs) || opencode.Config(r, "agister-1", "/skills") != wantConfig {
		t.Fatalf("with skills: %q, %s, %v", args, opencode.Config(r, "agister-1", "/skills"), err)
	}
}

// A filesystem write failure is returned, rather than silently losing skills.
func TestSkillsCannotBeWrittenOverAFile(t *testing.T) {
	t.Parallel()
	dir := filepath.Join(t.TempDir(), "blocked")
	if err := os.WriteFile(dir, []byte("bad input"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := opencode.WriteSkills(dir, []opencode.Skill{{Name: "review", Bytes: []byte("recorded")}}); err == nil {
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
	runner := &opencode.Runner{Transport: spy, Command: "opencode", TempDir: temp}
	r := request("hello")
	r.Skills = []opencode.Skill{{Name: "review", Bytes: []byte("recorded review\n")}, {Name: "../escape"}}
	turn := runner.RunTurn(context.Background(), r, &sink{})
	if turn.Status != opencode.Failed || turn.Error == nil || turn.Error.Class != opencode.ClassInternal || !strings.Contains(turn.Error.Message, "not a folder's name") || len(spy.Specs()) != 0 {
		t.Fatalf("turn = %+v, specs %+v", turn, spy.Specs())
	}
	if found, err := os.ReadDir(temp); err != nil || len(found) != 0 {
		t.Fatalf("the temporary folder holds %v, %v", found, err)
	}
}
