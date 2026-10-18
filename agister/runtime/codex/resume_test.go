package codex_test

import (
	"context"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// resume.feature, "A turn given a session runs exec resume": the sandbox
// a config, the session before "-", the schema's file gone once the turn
// has returned.
func TestATurnGivenASessionRunsExecResume(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	spy := &supervisorSpy{}
	turn := codex.Turn{Message: "m", Model: "gpt-6.1-sol", Options: []string{"workspace-write"}, Schema: []byte("{}"), Session: "s1"}
	if _, err := wrapper(t, spy, folder).Run(context.Background(), turn, discard); err != nil {
		t.Fatal(err)
	}
	if len(spy.asked) != 1 {
		t.Fatalf("asked %+v, want one program", spy.asked)
	}
	args := spy.asked[0].Args
	i := slices.Index(args, "--output-schema")
	if i < 0 || i+1 >= len(args) {
		t.Fatalf("arguments %q, want --output-schema and its file", args)
	}
	file := args[i+1]
	if got := filepath.Dir(filepath.Dir(file)); got != folder {
		t.Errorf("the schema's file %s, want it in a folder of its own under %s", file, folder)
	}
	want := codex.Program{Name: "codex", Stdin: "m", Args: []string{
		"exec", "resume", "--json", "--skip-git-repo-check", "--config", `sandbox_mode="workspace-write"`,
		"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules", "--model", "gpt-6.1-sol",
		"--output-schema", file, "s1", "-"}}
	if !reflect.DeepEqual(spy.asked[0], want) {
		t.Errorf("asked\n got %+v\nwant %+v", spy.asked[0], want)
	}
	if string(spy.schema) != "{}" {
		t.Errorf("the schema's file held %q, want {}", spy.schema)
	}
	empty(t, folder)
}

// A resumed turn given nothing else leaves out what it is not given, as
// exec does, and takes its effort as exec does.
func TestAResumedTurnLeavesOutWhatIsNotGiven(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name string
		turn codex.Turn
		args []string
	}{
		{"nothing else given", codex.Turn{Message: "m", Options: []string{"read-only"}, Session: "s1"}, []string{
			"exec", "resume", "--json", "--skip-git-repo-check", "--config", `sandbox_mode="read-only"`,
			"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules", "s1", "-"}},
		{"an effort", codex.Turn{Message: "m", Effort: "high", Options: []string{"read-only"}, Session: "s1"}, []string{
			"exec", "resume", "--json", "--skip-git-repo-check", "--config", `sandbox_mode="read-only"`,
			"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules",
			"--config", `model_reasoning_effort="high"`, "s1", "-"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &supervisorSpy{}
			if _, err := wrapper(t, spy, t.TempDir()).Run(context.Background(), c.turn, discard); err != nil {
				t.Fatal(err)
			}
			if want := []codex.Program{{Name: "codex", Stdin: "m", Args: c.args}}; !reflect.DeepEqual(spy.asked, want) {
				t.Errorf("asked\n got %+v\nwant %+v", spy.asked, want)
			}
		})
	}
}

// resume.feature, "A turn a signal ended gives the session it read": the
// thread thread.started gives, whatever follows it; none where no line
// gives one.
func TestATurnASignalEndedGivesTheSessionItRead(t *testing.T) {
	t.Parallel()
	terminated := codex.Ended{Signal: "terminated"}
	for _, c := range []struct {
		name    string
		lines   []string
		session string
	}{
		{"thread.started", []string{threadLine, turnLine, commandLine}, "t1"},
		{"no thread.started", []string{turnLine, notJSONLine}, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			turn := codex.Turn{Message: "m", Options: []string{"read-only"}}
			got, err := wrapper(t, &supervisorSpy{lines: c.lines, result: terminated}, t.TempDir()).Run(context.Background(), turn, discard)
			if err != nil {
				t.Fatal(err)
			}
			if want := (codex.Result{Ended: terminated, Session: c.session}); !reflect.DeepEqual(got, want) {
				t.Errorf("turn gave %+v, want %+v", got, want)
			}
		})
	}
}
