package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// fake stands in for agister and git. Implement and review runs answer
// from their queues, in order; git status answers clean, except after
// `git add` when unreported is set.
type fake struct {
	t          *testing.T
	implements []string
	reviews    []string
	dirty      string
	unreported string

	briefs   []string
	added    [][]string
	commits  []string
	statuses int
	agisters int
}

func (f *fake) run(_ context.Context, _ string, name string, args ...string) ([]byte, error) {
	switch {
	case name == "git" && args[0] == "status":
		f.statuses++
		if f.statuses == 1 {
			return []byte(f.dirty), nil
		}
		return []byte(f.unreported), nil
	case name == "git" && args[0] == "add":
		f.added = append(f.added, args[2:])
		return nil, nil
	case name == "git" && args[0] == "commit":
		f.commits = append(f.commits, args[3])
		return nil, nil
	case name == "git" && args[0] == "rev-parse":
		return []byte(fmt.Sprintf("c%d\n", len(f.commits))), nil
	case name == "agister" && args[1] == "code_review":
		f.agisters++
		if len(f.reviews) == 0 {
			f.t.Fatal("a review the test did not expect")
		}
		out := f.reviews[0]
		f.reviews = f.reviews[1:]
		return []byte(out), nil
	case name == "agister":
		f.agisters++
		f.briefs = append(f.briefs, strings.TrimPrefix(args[3], "brief="))
		if len(f.implements) == 0 {
			f.t.Fatal("an implement run the test did not expect")
		}
		out := f.implements[0]
		f.implements = f.implements[1:]
		if strings.Contains(out, `"failed"`) {
			return []byte(out), errors.New("exit status 1")
		}
		return []byte(out), nil
	}
	f.t.Fatalf("unexpected command %s %q", name, args)
	return nil, nil
}

func implementResult(id string, files ...string) string {
	out, _ := json.Marshal(map[string]any{"run_id": id, "status": "completed", "output": map[string]any{"files_changed": files}})
	return string(out)
}

func reviewed(id string, items ...item) string {
	if items == nil {
		items = []item{}
	}
	out, _ := json.Marshal(map[string]any{"run_id": id, "status": "completed", "output": map[string]any{"items": items}})
	return string(out)
}

func limited(id string) string {
	out, _ := json.Marshal(map[string]any{"run_id": id, "status": "failed", "error": map[string]any{"class": "rate_limited", "message": "usage limit"}})
	return string(out)
}

var (
	major    = item{Ruling: "fix", Severity: "major", Sources: []string{"2#1"}, Title: "Prove the refusal", Action: "Add a test that the call is refused."}
	minor    = item{Ruling: "fix", Severity: "minor", Sources: []string{"4#1"}, Title: "Name the helper", Action: "Rename it."}
	deferred = item{Ruling: "defer", Severity: "major", Sources: []string{"5#2"}, Title: "Widen the check", Action: "Gap: the docs. Trigger: S9."}
	waived   = item{Ruling: "waive", Severity: "major", Sources: []string{"1#1"}, Title: "Split the file", Action: "Split it."}
)

// issue is a step's text as an issue gives it, with headings and a fence
// of its own.
const issue = "## Done when\n\n- The call is refused.\n\n```go\nerr := call()\n```\n"

// constraints are the owner's words.
const constraints = "- Only cmd/ changes.\n"

// gated runs the gate on f with the issue's text, the owner's constraints
// and the args given after the required ones, and returns its exit code,
// summary and output directory.
func gated(t *testing.T, f *fake, extra ...string) (int, summary, string) {
	t.Helper()
	dir := t.TempDir()
	for name, text := range map[string]string{"issue.md": issue, "constraints.md": constraints} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	out := filepath.Join(dir, "out")
	args := append([]string{"--issue", filepath.Join(dir, "issue.md"), "--title", "LAB-1 step 2",
		"--constraints", filepath.Join(dir, "constraints.md"), "--implement", "implement_codex",
		"--base", "origin/trunk", "--message", "cmd: the call is refused", "--out", out, "--dir", dir}, extra...)
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), args, f.run, &stdout, &stderr)
	var sum summary
	if err := json.Unmarshal(stdout.Bytes(), &sum); err != nil {
		t.Fatalf("summary: %v\n%s\n%s", err, stdout.String(), stderr.String())
	}
	return code, sum, out
}

// A step whose first review has no major ruled fix passes: one implement
// run, its reported files staged by name and committed, one review. Its
// minors ruled fix and its items ruled defer are left for the caller, and
// a major the judge waived is neither fixed nor left.
func TestAStepPassesWhenItsReviewHasNoMajorToFix(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go", "cmd/gone.go")},
		reviews: []string{reviewed("r1", minor, deferred, waived)}}
	code, sum, _ := gated(t, f)
	if code != exitPassed || sum.Status != "passed" {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if !reflect.DeepEqual(f.added, [][]string{{"cmd/a.go", "cmd/gone.go"}}) {
		t.Errorf("staged %q, want the run's files_changed", f.added)
	}
	if !reflect.DeepEqual(f.commits, []string{"cmd: the call is refused"}) {
		t.Errorf("commits %q", f.commits)
	}
	if len(sum.Implements) != 1 || sum.Implements[0].RunID != "i1" || sum.Implements[0].Commit != "c1" {
		t.Errorf("implements %+v", sum.Implements)
	}
	if len(sum.Reviews) != 1 || !sum.Reviews[0].Counted || sum.Reviews[0].Majors != 0 {
		t.Errorf("reviews %+v", sum.Reviews)
	}
	want := left{Majors: []item{}, Minors: []item{minor}, Deferred: []item{deferred}}
	if !reflect.DeepEqual(sum.Left, want) {
		t.Errorf("left %+v, want %+v", sum.Left, want)
	}
}

// A major ruled fix goes to a fix run whose brief is the step's, titled for
// the review, with the major as its "## Acts on" as the judge wrote it; its
// commit is named for the review, and the next review decides.
func TestAMajorRuledFixGoesToAFixRunAndIsReviewedAgain(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go"), implementResult("i2", "cmd/a_test.go")},
		reviews: []string{reviewed("r1", major, minor), reviewed("r2")}}
	code, sum, out := gated(t, f)
	if code != exitPassed || len(sum.Reviews) != 2 || sum.Reviews[0].Majors != 1 {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if want := filepath.Join(out, "fix-1.md"); len(f.briefs) != 2 || f.briefs[1] != want {
		t.Fatalf("briefs %q, want the second %s", f.briefs, want)
	}
	brief, err := os.ReadFile(f.briefs[1])
	if err != nil {
		t.Fatal(err)
	}
	want := "# LAB-1 step 2, review 1\n\n## Goal\n\n`" + filepath.Join(out, "goal.md") + "`\n\n## Covers\n\n" +
		"````text\n" + issue + "````\n\n" +
		"## Acts on\n\nThe judgement of `code_review` run `r1`, its items ruled `fix` with severity major, as written:\n\n" +
		"- **Prove the refusal** (2#1): Add a test that the call is refused.\n\n" +
		"## Constraints\n\n```text\n" + constraints + "```\n\n## Open\n\nNone.\n"
	if string(brief) != want {
		t.Errorf("fix brief:\n%s\nwant:\n%s", brief, want)
	}
	if !reflect.DeepEqual(f.commits, []string{"cmd: the call is refused", "cmd: the call is refused (review 1)"}) {
		t.Errorf("commits %q", f.commits)
	}
}

// A major still ruled fix after the third review stops the step for the
// owner, with the majors left; no fourth review or third fix runs.
func TestAMajorAfterTheThirdReviewStopsForTheOwner(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "a"), implementResult("i2", "a"), implementResult("i3", "a")},
		reviews: []string{reviewed("r1", major), reviewed("r2", major), reviewed("r3", major)}}
	code, sum, _ := gated(t, f)
	if code != exitOwner || sum.Status != "owner" {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if len(sum.Implements) != 3 || len(sum.Reviews) != 3 || !reflect.DeepEqual(sum.Left.Majors, []item{major}) {
		t.Errorf("%+v", sum)
	}
}

// A review a provider limit failed does not count: the step stops with
// the count to resume from, and a resumed step runs no implement and
// counts the reviews it is told of, so its next review is the last.
func TestALimitedReviewDoesNotCount(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "a"), implementResult("i2", "a")},
		reviews: []string{reviewed("r1", major), limited("r2")}}
	code, sum, _ := gated(t, f)
	if code != exitLimited || sum.Status != "limited" || !strings.Contains(sum.Reason, "--from review --reviews 1") {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if last := sum.Reviews[len(sum.Reviews)-1]; last.RunID != "r2" || last.Counted {
		t.Errorf("limited review %+v", last)
	}

	resumed := &fake{t: t, reviews: []string{reviewed("r3", major)}}
	code, sum, _ = gated(t, resumed, "--from", "review", "--reviews", "2")
	if code != exitOwner || len(sum.Implements) != 0 || len(sum.Reviews) != 1 {
		t.Fatalf("resumed: exit %d, %+v", code, sum)
	}
}

// A file the implement run changed and did not report stops the step
// before the commit: the gate commits what a run reports, and only that.
func TestAChangeTheRunDidNotReportStopsTheStep(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go")}, unreported: "M  cmd/a.go\n M cmd/b.go\n?? cmd/c.go\n"}
	code, sum, _ := gated(t, f)
	if code != exitStopped || !strings.Contains(sum.Reason, "cmd/b.go, cmd/c.go") || strings.Contains(sum.Reason, "a.go") {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if len(f.commits) != 0 {
		t.Errorf("committed %q", f.commits)
	}
}

// A worktree with a change before the step stops it before any run.
func TestADirtyWorktreeStopsTheStepBeforeAnyRun(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, dirty: "?? notes.md\n"}
	code, sum, _ := gated(t, f)
	if code != exitStopped || !strings.Contains(sum.Reason, "notes.md") || f.agisters != 0 {
		t.Fatalf("exit %d, %d runs, %+v", code, f.agisters, sum)
	}
}

// An implement run that did not complete stops the step with its error,
// and nothing is committed.
func TestAFailedImplementRunStopsTheStep(t *testing.T) {
	t.Parallel()
	failed, _ := json.Marshal(map[string]any{"run_id": "i1", "status": "failed", "error": map[string]any{"class": "timeout", "message": "45m"}})
	f := &fake{t: t, implements: []string{string(failed)}}
	code, sum, out := gated(t, f)
	if code != exitStopped || !strings.Contains(sum.Reason, "implement run i1 failed: timeout: 45m") || len(f.commits) != 0 {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if kept, err := os.ReadFile(filepath.Join(out, "01-implement.json")); err != nil || string(kept) != string(failed) {
		t.Errorf("kept result %q, %v", kept, err)
	}
}

// The step's briefs say what the issue and the owner said, as written: the
// goal's Done when and the step's Covers are the issue's text, its
// Constraints the owner's, each fenced so the text's own headings stay its
// own; the step brief names the goal the review is given.
func TestTheBriefsAreTheIssuesTextAsWritten(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "a")}, reviews: []string{reviewed("r1")}}
	_, _, out := gated(t, f)
	goal, err := os.ReadFile(filepath.Join(out, "goal.md"))
	if err != nil {
		t.Fatal(err)
	}
	wantGoal := "# LAB-1 step 2\n\n## Intent\n\nWhat the issue's text, under Done when, makes true.\n\n" +
		"## Done when\n\n````text\n" + issue + "````\n\n" +
		"## Out of scope\n\nWhat the issue's text, under Done when, leaves out.\n\n## Open\n\nNone.\n"
	if string(goal) != wantGoal {
		t.Errorf("goal:\n%s\nwant:\n%s", goal, wantGoal)
	}
	if want := filepath.Join(out, "step.md"); len(f.briefs) != 1 || f.briefs[0] != want {
		t.Fatalf("briefs %q, want %s", f.briefs, want)
	}
	step, err := os.ReadFile(f.briefs[0])
	if err != nil {
		t.Fatal(err)
	}
	wantStep := "# LAB-1 step 2\n\n## Goal\n\n`" + filepath.Join(out, "goal.md") + "`\n\n" +
		"## Covers\n\n````text\n" + issue + "````\n\n" +
		"## Constraints\n\n```text\n" + constraints + "```\n\n## Open\n\nNone.\n"
	if string(step) != wantStep {
		t.Errorf("step:\n%s\nwant:\n%s", step, wantStep)
	}
}

// No brief comes from the caller's own words: the gate takes no goal or
// step brief, only the issue's text.
func TestTheGateTakesNoBriefButTheIssuesText(t *testing.T) {
	t.Parallel()
	for _, flag := range []string{"--goal", "--step"} {
		var stdout, stderr bytes.Buffer
		code := run(context.Background(), []string{flag, "brief.md"}, (&fake{t: t}).run, &stdout, &stderr)
		if code != exitUsage || !strings.Contains(stderr.String(), "flag provided but not defined: "+strings.TrimPrefix(flag, "-")) {
			t.Errorf("%s: exit %d, %s", flag, code, stderr.String())
		}
	}
}
