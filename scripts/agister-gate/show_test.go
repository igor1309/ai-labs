package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// shown runs `agister-gate show` with args and returns its exit code,
// standard output and standard error.
func shown(t *testing.T, args ...string) (int, string, string) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), append([]string{"show"}, args...), nil, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

// inOrder fails t unless text holds each of lines, in order.
func inOrder(t *testing.T, text string, lines ...string) {
	t.Helper()
	rest := text
	for _, line := range lines {
		i := strings.Index(rest, line)
		if i < 0 {
			t.Fatalf("no %q after the lines before it in:\n%s", line, text)
		}
		rest = rest[i+len(line):]
	}
}

// show prints a step's trail for a person to read: the step's options,
// each program run with its run's id and status, each brief with what it
// was made from and the items it acts on, each ruling with what the gate
// did with it, each commit and why the step stopped.
func TestShowPrintsTheTrailForAPersonToRead(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go"), implementResult("i2", "cmd/a_test.go")},
		reviews: []string{reviewed("r1", major, minor), reviewed("r2")}}
	code, sum, out := gated(t, f.run)
	if code != exitPassed {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	code, text, stderr := shown(t, out)
	if code != exitPassed || stderr != "" {
		t.Fatalf("exit %d: %s", code, stderr)
	}
	inOrder(t, text,
		"Step 1, started ", " at implement, 0 review(s) counted\n",
		"  title      LAB-1 step 2\n",
		"  implement  implement_codex\n",
		"wrote step brief "+filepath.Join(out, "01-step.md"),
		"ran agister run implement_codex --param brief="+filepath.Join(out, "01-step.md"),
		"    ok, ",
		"          run i1 completed\n",
		`ran git commit -q -m "cmd: the call is refused"`,
		"committed c1: cmd: the call is refused\n", "          cmd/a.go\n", "          from implement_run: i1\n",
		"          run r1 completed\n",
		"review 1, run r1: the judge's rulings\n",
		"          - [major fix] Prove the refusal\n", "              gate: sent to the fix run\n",
		"          - [minor fix] Name the helper\n", "              gate: left: the gate fixes no minor without --minors\n",
		"wrote fix brief "+filepath.Join(out, "03-fix.md"),
		"          from review_run: r1\n", "          acts on: Prove the refusal (2#1)\n",
		"committed c2: cmd: the call is refused (answers review r1)\n",
		"review 2, run r2: the judge's rulings\n",
		"stopped, passed (exit 0): review 2 has no major ruled fix\n")
	if strings.Contains(text, "minors     ") {
		t.Errorf("minors shown for a step without --minors:\n%s", text)
	}
	if _, byPath, _ := shown(t, filepath.Join(out, trailFile)); byPath != text {
		t.Errorf("the trail shown by its path:\n%s\nby its out dir:\n%s", byPath, text)
	}
}

// A program's output and standard error are counted; --full shows them.
func TestShowGivesAProgramsOutputWithFull(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go")}, reviews: []string{reviewed("r1")},
		complaint: "warning: the run took long"}
	_, _, out := gated(t, f.run, "--minors")
	_, text, _ := shown(t, out)
	inOrder(t, text, "  minors     fixed with the majors\n", "ran git status", "          stderr: 1 line(s)\n")
	if strings.Contains(text, "warning: the run took long") {
		t.Errorf("standard error shown without --full:\n%s", text)
	}
	_, text, _ = shown(t, "--full", out)
	inOrder(t, text, "ran git status", "          stderr:\n            warning: the run took long\n",
		"ran agister run implement_codex", "          output:\n            {\"output\":")
}

// A damaged trail is not shown: show stops and says where it is damaged.
func TestShowStopsOnADamagedTrail(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), trailFile)
	if err := os.WriteFile(path, []byte(`{"seq":1,"kind":"GATE_STARTED","data":{}}`+"\n"+`{"seq":3}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	code, text, stderr := shown(t, path)
	if code != exitStopped || text != "" || !strings.Contains(stderr, "line 2 is event 3") {
		t.Errorf("exit %d, stdout %q, stderr %q", code, text, stderr)
	}
}

// show takes one trail.
func TestShowTakesOneTrail(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{nil, {"a", "b"}, {"--bogus", "a"}} {
		if code, _, stderr := shown(t, args...); code != exitUsage || !strings.Contains(stderr, "usage: agister-gate show") {
			t.Errorf("show %q: exit %d, %s", args, code, stderr)
		}
	}
}
