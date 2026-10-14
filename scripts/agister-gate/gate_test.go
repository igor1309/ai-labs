package main

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// fake stands in for agister and git. Implement, review and advisor runs
// answer from their queues, in order; git status answers clean, except
// after `git add` when unreported is set; git diff names the decisions
// record once it is staged, or from the start when recorded is set. The
// review is the workflow review names, code_review when it is empty.
// `agister runs export` copies a review run's collection: collections's,
// by the run's id, or reviewsOf(5, 2) when it has none. Every command
// writes complaint, if any, to its standard error. ran is every command it
// answered, in order, with its answer.
type fake struct {
	t           *testing.T
	implements  []string
	reviews     []string
	advisors    []string
	dirty       string
	unreported  string
	recorded    bool
	review      string
	collections map[string][]collected
	complaint   string

	questions []string

	briefs      []string
	added       [][]string
	commits     []string
	statuses    int
	revParses   int
	agisters    int
	reviewBases []string
	ran         []answered
}

type answered struct {
	command []string
	output  string
	err     error
}

func (f *fake) run(ctx context.Context, dir string, stderr io.Writer, name string, args ...string) ([]byte, error) {
	if f.complaint != "" {
		fmt.Fprintln(stderr, f.complaint)
	}
	out, err := f.answer(ctx, dir, name, args...)
	f.ran = append(f.ran, answered{append([]string{name}, args...), string(out), err})
	return out, err
}

func (f *fake) answer(_ context.Context, _ string, name string, args ...string) ([]byte, error) {
	switch {
	case name == "git" && args[0] == "status":
		f.statuses++
		if f.statuses == 1 {
			return []byte(f.dirty), nil
		}
		return []byte(f.unreported), nil
	case name == "git" && args[0] == "add":
		var added []string
		for _, p := range args[2:] {
			added = append(added, strings.TrimPrefix(p, ":(top)"))
		}
		f.added = append(f.added, added)
		f.recorded = f.recorded || filepath.Base(args[2]) == "decisions.md"
		return nil, nil
	case name == "git" && args[0] == "diff":
		if f.recorded {
			return []byte(args[len(args)-1] + "\n"), nil
		}
		return nil, nil
	case name == "agister" && args[0] == "runs":
		id, to := args[2], args[4]
		reviews, ok := f.collections[id]
		if !ok {
			reviews = reviewsOf(5, 2)
		}
		data, _ := json.Marshal(reviews)
		dir := filepath.Join(to, id, "artifacts")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			f.t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "collection.json"), data, 0o644); err != nil {
			f.t.Fatal(err)
		}
		return nil, nil
	case name == "agister" && args[1] == "advisor_codex":
		f.agisters++
		f.questions = append(f.questions, strings.TrimPrefix(args[3], "question="))
		if len(f.advisors) == 0 {
			f.t.Fatal("an advisor run the test did not expect")
		}
		out := f.advisors[0]
		f.advisors = f.advisors[1:]
		return []byte(out), nil
	case name == "git" && args[0] == "commit":
		f.commits = append(f.commits, args[3])
		return nil, nil
	case name == "git" && args[0] == "rev-parse":
		f.revParses++
		return []byte(fmt.Sprintf("c%d\n", len(f.commits))), nil
	case name == "agister" && args[1] == cmp.Or(f.review, "code_review"):
		f.agisters++
		for _, arg := range args {
			if strings.HasPrefix(arg, "base=") {
				f.reviewBases = append(f.reviewBases, strings.TrimPrefix(arg, "base="))
			}
		}
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

// leftOpen is an implement run that changed files and left points open.
func leftOpen(id string, points ...point) string {
	out, _ := json.Marshal(map[string]any{"run_id": id, "status": "completed",
		"output": map[string]any{"files_changed": []string{"cmd/a.go"}, "open": points}})
	return string(out)
}

// advised is an advisor run with the advice given.
func advised(id string, advice map[string]any) string {
	out, _ := json.Marshal(map[string]any{"run_id": id, "status": "completed", "output": map[string]any{"advice": advice}})
	return string(out)
}

func reviewed(id string, items ...item) string {
	if items == nil {
		items = []item{}
	}
	out, _ := json.Marshal(map[string]any{"run_id": id, "status": "completed", "output": map[string]any{"items": items}})
	return string(out)
}

// reviewsOf is a collection of n reviews with m findings each; finding i
// of review r is findingOf(r, i).
func reviewsOf(n, m int) []collected {
	reviews := make([]collected, n)
	for r := range reviews {
		reviews[r].Output = &struct {
			Findings []finding `json:"findings"`
		}{}
		for i := range m {
			reviews[r].Output.Findings = append(reviews[r].Output.Findings, findingOf(r+1, i+1))
		}
	}
	return reviews
}

// findingOf is a finding whose every field names it: r#i.
func findingOf(r, i int) finding {
	f := finding{File: fmt.Sprintf("cmd/r%d.go", r), Line: &i, Requirement: fmt.Sprintf("Rule %d#%d.", r, i)}
	f.Evidence.Case = fmt.Sprintf("Case %d#%d.", r, i)
	f.Evidence.Trace = []string{fmt.Sprintf("cmd/r%d.go:%d - step %d#%d.", r, i, r, i)}
	return f
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

// open is a point an implement run left open, and decision the advisor's
// answer to it.
var (
	open     = point{Question: "Which exit code?", Options: []string{"0", "64"}, Searched: []string{"ADR-030 rule 8: silent on exit codes"}}
	decision = map[string]any{"kind": "decision", "asked_by": "implement run i1, LAB-1 step 2", "question": "Which exit code?",
		"options": []string{"0", "64"}, "chosen": "64", "excluded": []map[string]string{{"option": "0", "why": "ADR-001 rule 6"}},
		"rests_on": []string{"ADR-001 rule 6"}, "follow_ups": []string{"TestTheCallExits64 proves it."}}
)

// records is a decisions record with records of its own.
const records = "# Decisions\n\n## D-4: An earlier question\n\n- **Status:** Owner\n"

// issue is a step's text as an issue gives it, with headings and a fence
// of its own.
const issue = "## Done when\n\n- The call is refused.\n\n```go\nerr := call()\n```\n"

// constraints are the owner's words.
const constraints = "- Only cmd/ changes.\n"

// gated runs the gate on call with the issue's text, the owner's constraints
// and the args given after the required ones, and returns its exit code,
// summary and output directory.
func gated(t *testing.T, call runner, extra ...string) (int, summary, string) {
	t.Helper()
	code, sum, out, _ := gatedIn(t, t.TempDir(), call, extra...)
	return code, sum, out
}

// gatedIn is gated in dir, which keeps a step's output for the step that
// resumes it, and returns its progress lines too.
func gatedIn(t *testing.T, dir string, call runner, extra ...string) (int, summary, string, string) {
	t.Helper()
	args, out := gateArgs(t, dir, extra...)
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), args, call, &stdout, &stderr)
	var sum summary
	if err := json.Unmarshal(stdout.Bytes(), &sum); err != nil {
		t.Fatalf("summary: %v\n%s\n%s", err, stdout.String(), stderr.String())
	}
	return code, sum, out, stderr.String()
}

// gateArgs writes the issue's text, the owner's constraints and the
// decisions record into dir, and returns the gate's args for them, then
// extra, and its output directory.
func gateArgs(t *testing.T, dir string, extra ...string) ([]string, string) {
	t.Helper()
	for name, text := range map[string]string{"issue.md": issue, "constraints.md": constraints, "decisions.md": records} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	out := filepath.Join(dir, "out")
	args := append([]string{"--issue", filepath.Join(dir, "issue.md"), "--title", "LAB-1 step 2",
		"--constraints", filepath.Join(dir, "constraints.md"), "--implement", "implement_codex",
		"--advisor", "advisor_codex", "--decisions", filepath.Join(dir, "decisions.md"),
		"--base", "origin/trunk", "--message", "cmd: the call is refused", "--out", out, "--dir", dir}, extra...)
	return args, out
}

// A step whose first review has no major ruled fix passes: one implement
// run, its reported files staged by name and committed, one review. Its
// minors ruled fix and its items ruled defer are left for the caller, and
// a major the judge waived is neither fixed nor left.
func TestAStepPassesWhenItsReviewHasNoMajorToFix(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go", "cmd/gone.go")},
		reviews: []string{reviewed("r1", minor, deferred, waived)}}
	code, sum, _ := gated(t, f.run)
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
	if sum.Base != "c0" {
		t.Errorf("base %q, want c0", sum.Base)
	}
	if len(sum.Reviews) != 1 || !sum.Reviews[0].Counted || sum.Reviews[0].Majors != 0 {
		t.Errorf("reviews %+v", sum.Reviews)
	}
	want := left{Majors: []item{}, Minors: []item{minor}, Deferred: []item{deferred}}
	if !reflect.DeepEqual(sum.Left, want) {
		t.Errorf("left %+v, want %+v", sum.Left, want)
	}
}

// A resumed review uses the commit supplied from the previous summary and
// does not resolve that value again.
func TestAResumedReviewUsesItsGivenCommit(t *testing.T) {
	t.Parallel()
	for _, size := range []int{40, 64} {
		for counted := 0; counted < maxReviews; counted++ {
			t.Run(fmt.Sprintf("hash length %d counted %d", size, counted), func(t *testing.T) {
				t.Parallel()
				base := strings.Repeat("deadbeef", size/8)
				f := &fake{t: t}
				var wantBases []string
				for n := counted + 1; n < maxReviews; n++ {
					f.reviews = append(f.reviews, reviewed(fmt.Sprintf("r%d", n), major))
					f.implements = append(f.implements, implementResult(fmt.Sprintf("i%d", n), "a"))
					wantBases = append(wantBases, base)
				}
				f.reviews = append(f.reviews, reviewed("last"))
				wantBases = append(wantBases, base)
				code, sum, out := gated(t, f.run, "--from", "review", "--reviews", fmt.Sprint(counted), "--base", base)
				if code != exitPassed || sum.Base != base || !reflect.DeepEqual(f.reviewBases, wantBases) {
					t.Fatalf("exit %d, base %q, reviews %q, want %q", code, sum.Base, f.reviewBases, wantBases)
				}
				if f.revParses != len(f.commits) {
					t.Fatalf("rev-parse calls %d, want only %d commit HEAD reads", f.revParses, len(f.commits))
				}
				paths := append([]string{filepath.Join(out, "goal.md"), filepath.Join(out, "step.md")}, f.briefs...)
				for _, path := range paths {
					brief, err := os.ReadFile(path)
					if err != nil {
						t.Fatal(err)
					}
					if !strings.Contains(string(brief), "\n## Base\n\n"+base+"\n") {
						t.Errorf("%s does not name base %s", path, base)
					}
				}
			})
		}
	}
}

// --review names the review workflow the gate runs in place of code_review.
func TestTheReviewIsTheWorkflowReviewNames(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go")},
		reviews: []string{reviewed("r1")}, review: "code_review_codex"}
	code, sum, _ := gated(t, f.run, "--review", "code_review_codex")
	if code != exitPassed || len(sum.Reviews) != 1 || sum.Reviews[0].RunID != "r1" {
		t.Fatalf("exit %d, %+v", code, sum)
	}
}

// A major ruled fix goes to a fix run whose brief is the step's, with the
// major's title and action as its "## Acts on" as the judge wrote them,
// then the place, case, trace and requirement of the finding it rests on,
// as the review wrote them, and no review, run, ruling or source named;
// its commit is named for the review, and the next review decides.
func TestAMajorRuledFixGoesToAFixRunAndIsReviewedAgain(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go"), implementResult("i2", "cmd/a_test.go")},
		reviews: []string{reviewed("r1", major, minor), reviewed("r2")}}
	code, sum, out := gated(t, f.run)
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
	want := "# LAB-1 step 2\n\n## Goal\n\n`" + filepath.Join(out, "goal.md") + "`\n\n## Base\n\nc0\n\n## Covers\n\n" +
		"````text\n" + issue + "````\n\n" +
		"## Acts on\n\nThe changes to make, as written, each with the evidence the reviews give for it:\n\n" +
		"- **Prove the refusal**: Add a test that the call is refused.\n" +
		"  - `cmd/r2.go:1`: Case 2#1.\n" +
		"    - cmd/r2.go:1 - step 2#1.\n" +
		"    - Requirement: Rule 2#1.\n\n" +
		"## Constraints\n\n```text\n" + constraints + "```\n\n## Open\n\nNone.\n"
	if string(brief) != want {
		t.Errorf("fix brief:\n%s\nwant:\n%s", brief, want)
	}
	if !reflect.DeepEqual(f.commits, []string{"cmd: the call is refused", "cmd: the call is refused (review 1)"}) {
		t.Errorf("commits %q", f.commits)
	}
}

// An item's evidence is every finding it rests on, in the order of its
// sources, a finding two reviews give alike once and a finding without a
// line by its file; text of several lines stays inside its list item.
func TestAFixBriefGivesTheEvidenceOfEveryFindingAnItemRestsOn(t *testing.T) {
	t.Parallel()
	reviews := reviewsOf(3, 2)
	reviews[2].Output.Findings[0] = findingOf(1, 2)
	reviews[1].Output.Findings[1].Line = nil
	reviews[1].Output.Findings[1].Evidence.Case = "Case 2#2,\nover two lines."
	it := item{Ruling: "fix", Severity: "major", Sources: []string{"1#2", "2#2", "3#1"}, Title: "Fix it", Action: "Do this,\nthen that."}
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go"), implementResult("i2", "cmd/a.go")},
		reviews: []string{reviewed("r1", it), reviewed("r2")}, collections: map[string][]collected{"r1": reviews}}
	code, sum, _ := gated(t, f.run)
	if code != exitPassed {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	brief, err := os.ReadFile(f.briefs[1])
	if err != nil {
		t.Fatal(err)
	}
	acts := "- **Fix it**: Do this,\n  then that.\n" +
		"  - `cmd/r1.go:2`: Case 1#2.\n" +
		"    - cmd/r1.go:2 - step 1#2.\n" +
		"    - Requirement: Rule 1#2.\n" +
		"  - `cmd/r2.go`: Case 2#2,\n    over two lines.\n" +
		"    - cmd/r2.go:2 - step 2#2.\n" +
		"    - Requirement: Rule 2#2.\n\n## Constraints"
	if !strings.Contains(string(brief), acts) {
		t.Errorf("fix brief:\n%s\nwant its Acts on to end:\n%s", brief, acts)
	}
}

// A source that names no finding the judge received stops the step before
// any fix run: the gate does not drop what an item rests on.
func TestASourceThatNamesNoFindingStopsTheStep(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"6#1", "1#3", "0#1", "1#0", "1", "1#1x"} {
		t.Run(source, func(t *testing.T) {
			t.Parallel()
			it := item{Ruling: "fix", Severity: "major", Sources: []string{"1#1", source}, Title: "Fix it", Action: "Do it."}
			f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go")}, reviews: []string{reviewed("r1", it)}}
			code, sum, _ := gated(t, f.run)
			if code != exitStopped || len(f.briefs) != 1 || !strings.Contains(sum.Reason, source) {
				t.Errorf("exit %d, briefs %q, reason %q; want a stop naming %s before any fix run", code, f.briefs, sum.Reason, source)
			}
		})
	}
}

// A review whose items name no review the gate can read stops the step: a
// collection that is missing, or a review that did not complete.
func TestACollectionThatCannotBeReadStopsTheStep(t *testing.T) {
	t.Parallel()
	failed := reviewsOf(2, 1)
	failed[1].Output = nil
	it := item{Ruling: "fix", Severity: "major", Sources: []string{"2#1"}, Title: "Fix it", Action: "Do it."}
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go")}, reviews: []string{reviewed("r1", it)},
		collections: map[string][]collected{"r1": failed}}
	code, sum, _ := gated(t, f.run)
	if code != exitStopped || len(f.briefs) != 1 || !strings.Contains(sum.Reason, "2#1") {
		t.Errorf("exit %d, briefs %q, reason %q", code, f.briefs, sum.Reason)
	}
}

// A major still ruled fix after the third review stops the step for the
// owner, with the majors left; no fourth review or third fix runs.
func TestAMajorAfterTheThirdReviewStopsForTheOwner(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "a"), implementResult("i2", "a"), implementResult("i3", "a")},
		reviews: []string{reviewed("r1", major), reviewed("r2", major), reviewed("r3", major)}}
	code, sum, _ := gated(t, f.run)
	if code != exitOwner || sum.Status != "owner" || sum.Base != "c0" {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if len(sum.Implements) != 3 || len(sum.Reviews) != 3 || !reflect.DeepEqual(sum.Left.Majors, []item{major}) {
		t.Errorf("%+v", sum)
	}
}

// A review a provider limit failed does not count: the step stops with
// the count to resume from, and a resumed step starts at review, uses the
// reported base and counts only completed reviews toward the limit.
func TestALimitedReviewDoesNotCount(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "a"), implementResult("i2", "a")},
		reviews: []string{reviewed("r1", major), limited("r2")}}
	base := strings.Repeat("a", 40)
	call := func(ctx context.Context, dir string, stderr io.Writer, name string, args ...string) ([]byte, error) {
		out, err := f.run(ctx, dir, stderr, name, args...)
		if name == "git" && reflect.DeepEqual(args, []string{"rev-parse", "--verify", "origin/trunk^{commit}"}) {
			return []byte(base + "\n"), err
		}
		return out, err
	}
	code, sum, _ := gated(t, call)
	if code != exitLimited || sum.Status != "limited" || sum.Base != base || !strings.Contains(sum.Reason, "--from review --reviews 1 --base "+base) {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if last := sum.Reviews[len(sum.Reviews)-1]; last.RunID != "r2" || last.Counted {
		t.Errorf("limited review %+v", last)
	}

	counted := 0
	for _, review := range sum.Reviews {
		if review.Counted {
			counted++
		}
	}
	resumed := &fake{t: t, reviews: []string{reviewed("r3", major), reviewed("r4", major)},
		implements: []string{implementResult("i3", "a")}}
	code, sum, _ = gated(t, resumed.run, "--from", "review", "--reviews", fmt.Sprint(counted), "--base", sum.Base)
	if code != exitOwner || sum.Base != base || len(sum.Implements) != 1 || len(sum.Reviews) != 2 {
		t.Fatalf("resumed: exit %d, %+v", code, sum)
	}
	if !reflect.DeepEqual(resumed.reviewBases, []string{base, base}) || resumed.revParses != len(resumed.commits) {
		t.Fatalf("resumed: bases %q, rev-parse calls %d, commits %d", resumed.reviewBases, resumed.revParses, len(resumed.commits))
	}
}

// A file the implement run changed and did not report stops the step
// before the commit: the gate commits what a run reports, and only that.
func TestAChangeTheRunDidNotReportStopsTheStep(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go")}, unreported: "M  cmd/a.go\n M cmd/b.go\n?? cmd/c.go\n"}
	code, sum, _ := gated(t, f.run)
	if code != exitStopped || sum.Base != "c0" || !strings.Contains(sum.Reason, "cmd/b.go, cmd/c.go") || strings.Contains(sum.Reason, "a.go") {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if len(f.commits) != 0 {
		t.Errorf("committed %q", f.commits)
	}
}

// Contract test: the real git repository stages files reported from the
// worktree root when --dir points below it.
// A run reports its files from the worktree root; with --dir a
// subdirectory, they are still the ones staged and committed, by real git.
func TestTheRunsFilesAreCommittedFromTheRootWhenDirIsBelowIt(t *testing.T) {
	t.Parallel()
	repo, inputs := t.TempDir(), t.TempDir()
	git := func(args ...string) string {
		t.Helper()
		out, err := commands(context.Background(), repo, io.Discard, "git", args...)
		if err != nil {
			t.Fatalf("git %q: %v", args, err)
		}
		return strings.TrimSpace(string(out))
	}
	git("init", "-q")
	for _, kv := range [][2]string{{"user.name", "gate"}, {"user.email", "gate@test"}, {"commit.gpgsign", "false"}, {"core.hooksPath", "/dev/null"}} {
		git("config", kv[0], kv[1])
	}
	project := filepath.Join(repo, "project")
	if err := os.MkdirAll(project, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(project, "a.go"), []byte("package a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git("add", "project/a.go")
	git("commit", "-q", "-m", "base")
	for name, text := range map[string]string{"issue.md": issue, "decisions.md": records} {
		if err := os.WriteFile(filepath.Join(inputs, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	f := &fake{t: t, implements: []string{implementResult("i1", "project/a.go")}, reviews: []string{reviewed("r1")}}
	runner := func(ctx context.Context, dir string, stderr io.Writer, name string, args ...string) ([]byte, error) {
		if name == "git" {
			return commands(ctx, dir, stderr, name, args...)
		}
		if args[1] == "implement_codex" {
			if err := os.WriteFile(filepath.Join(project, "a.go"), []byte("package a\n\nconst A = 1\n"), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		return f.run(ctx, dir, stderr, name, args...)
	}
	args := []string{"--issue", filepath.Join(inputs, "issue.md"), "--title", "LAB-1 step 2",
		"--implement", "implement_codex", "--advisor", "advisor_codex", "--decisions", filepath.Join(inputs, "decisions.md"),
		"--base", "HEAD", "--message", "project: a constant", "--out", filepath.Join(inputs, "out"), "--dir", project}
	var stdout, stderr bytes.Buffer
	if code := run(context.Background(), args, runner, &stdout, &stderr); code != exitPassed {
		t.Fatalf("exit %d\n%s\n%s", code, stdout.String(), stderr.String())
	}
	if got := git("log", "-1", "--format=%s", "--name-only"); got != "project: a constant\n\nproject/a.go" {
		t.Errorf("last commit %q", got)
	}
	if got := git("status", "--porcelain"); got != "" {
		t.Errorf("left %q", got)
	}
}

// Contract test: real git ref movement during preflight, before review and
// between invocations cannot change the step's review and brief base.
func TestTheBaseIsPinnedBeforeSetupAndReview(t *testing.T) {
	t.Parallel()
	for _, phase := range []string{"preflight", "before review", "resume commit", "resume ref"} {
		t.Run(phase, func(t *testing.T) {
			t.Parallel()
			repo, inputs := t.TempDir(), t.TempDir()
			git := func(args ...string) string {
				t.Helper()
				out, err := commands(context.Background(), repo, io.Discard, "git", args...)
				if err != nil {
					t.Fatalf("git %q: %v", args, err)
				}
				return strings.TrimSpace(string(out))
			}
			git("init", "-q")
			for _, kv := range [][2]string{{"user.name", "gate"}, {"user.email", "gate@test"}, {"commit.gpgsign", "false"}, {"core.hooksPath", "/dev/null"}} {
				git("config", kv[0], kv[1])
			}
			if err := os.WriteFile(filepath.Join(repo, "tracked.txt"), []byte("before\n"), 0o644); err != nil {
				t.Fatal(err)
			}
			git("add", "tracked.txt")
			git("commit", "-q", "-m", "base")
			base := git("rev-parse", "HEAD")
			git("update-ref", "refs/remotes/origin/trunk", base)
			git("commit", "-q", "--allow-empty", "-m", "next trunk")
			for name, text := range map[string]string{"issue.md": issue, "decisions.md": records} {
				if err := os.WriteFile(filepath.Join(inputs, name), []byte(text), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			f := &fake{t: t, implements: []string{implementResult("i1", "tracked.txt"), implementResult("i2", "tracked.txt")},
				reviews: []string{reviewed("r1", major), reviewed("r2")}}
			moved := false
			moveRef := func() {
				git("update-ref", "refs/remotes/origin/trunk", "HEAD")
				if got := git("rev-parse", "origin/trunk"); got == base {
					t.Fatalf("ref did not move from %s", base)
				}
				moved = true
			}
			runner := func(ctx context.Context, dir string, stderr io.Writer, name string, args ...string) ([]byte, error) {
				if name == "git" {
					if phase == "preflight" && !moved && args[0] == "status" {
						moveRef()
					}
					out, err := commands(ctx, dir, stderr, name, args...)
					if phase == "before review" && !moved && reflect.DeepEqual(args, []string{"rev-parse", "HEAD"}) {
						moveRef()
					}
					return out, err
				}
				if name == "agister" && args[1] == "implement_codex" {
					text := fmt.Sprintf("implementation %d\n", len(f.briefs)+1)
					if err := os.WriteFile(filepath.Join(repo, "tracked.txt"), []byte(text), 0o644); err != nil {
						t.Fatal(err)
					}
				}
				if name == "agister" && args[1] == "code_review" && !moved {
					t.Fatal("review invoked before the ref moved")
				}
				return f.run(ctx, dir, stderr, name, args...)
			}
			out := filepath.Join(inputs, "out")
			args := []string{"--issue", filepath.Join(inputs, "issue.md"), "--title", "LAB-251 step 1",
				"--implement", "implement_codex", "--advisor", "advisor_codex", "--decisions", filepath.Join(inputs, "decisions.md"),
				"--base", "origin/trunk", "--message", "gate: pin base", "--out", out, "--dir", repo}
			if strings.HasPrefix(phase, "resume") {
				moveRef()
				args = append(args, "--from", "review")
				if phase == "resume commit" {
					args = append(args, "--base", base)
				}
			}
			var stdout, stderr bytes.Buffer
			code := run(context.Background(), args, runner, &stdout, &stderr)
			if phase == "resume ref" {
				if code != exitUsage || f.agisters != 0 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "full commit") {
					t.Fatalf("exit %d, runs %d\n%s\n%s", code, f.agisters, stdout.String(), stderr.String())
				}
				if _, err := os.Stat(out); !errors.Is(err, os.ErrNotExist) {
					t.Fatalf("output directory created for invalid resume: %v", err)
				}
				return
			}
			if code != exitPassed {
				t.Fatalf("exit %d\n%s\n%s", code, stdout.String(), stderr.String())
			}
			var sum summary
			if err := json.Unmarshal(stdout.Bytes(), &sum); err != nil {
				t.Fatal(err)
			}
			if sum.Base != base || !reflect.DeepEqual(f.reviewBases, []string{base, base}) {
				t.Fatalf("base summary=%q reviews=%q want=%q", sum.Base, f.reviewBases, base)
			}
			paths := append([]string{filepath.Join(out, "goal.md"), filepath.Join(out, "step.md")}, f.briefs...)
			for _, path := range paths {
				brief, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(string(brief), "\n## Base\n\n"+base+"\n") {
					t.Errorf("%s does not name base %s", path, base)
				}
			}
		})
	}
}

// A base that cannot resolve stops before setup creates output or checks
// the worktree, so preflight cannot precede the snapshot.
func TestAnUnresolvableBaseStopsBeforeSetup(t *testing.T) {
	t.Parallel()
	out := filepath.Join(t.TempDir(), "out")
	failed := errors.New("unknown revision")
	g := gate{options: options{base: "origin/missing", from: "implement", out: out, dir: t.TempDir()},
		run: func(_ context.Context, _ string, _ io.Writer, name string, args ...string) ([]byte, error) {
			if name != "git" || !reflect.DeepEqual(args, []string{"rev-parse", "--verify", "origin/missing^{commit}"}) {
				t.Fatalf("setup preceded base resolution: %s %q", name, args)
			}
			return nil, failed
		}}
	sum := g.drive(context.Background())
	if sum.Status != "stopped" || !strings.Contains(sum.Reason, `git rev-parse base "origin/missing": unknown revision`) {
		t.Fatalf("summary %+v", sum)
	}
	if _, err := os.Stat(out); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("output directory created before base resolution: %v", err)
	}
}

// A resumed step accepts only full commit hashes, never refs, expressions,
// abbreviations or malformed object IDs.
func TestAResumedReviewRejectsAnUnpinnedBase(t *testing.T) {
	t.Parallel()
	for _, base := range []string{"origin/trunk", "HEAD", "v1.0", "HEAD~1", "deadbeef", strings.Repeat("a", 39), strings.Repeat("a", 41), strings.Repeat("a", 63), strings.Repeat("a", 65), strings.Repeat("g", 40)} {
		t.Run(base, func(t *testing.T) {
			t.Parallel()
			args := []string{"--issue", "issue.md", "--title", "step", "--implement", "implement_codex",
				"--advisor", "advisor_codex", "--decisions", "decisions.md", "--message", "fix", "--out", "out",
				"--from", "review", "--base", base}
			var stdout, stderr bytes.Buffer
			f := &fake{t: t}
			code := run(context.Background(), args, f.run, &stdout, &stderr)
			if code != exitUsage || !strings.Contains(stderr.String(), "full commit") || stdout.Len() != 0 {
				t.Fatalf("exit %d\n%s\n%s", code, stdout.String(), stderr.String())
			}
			if f.agisters != 0 || f.revParses != 0 || f.statuses != 0 {
				t.Fatalf("commands for invalid base: %+v", f)
			}
		})
	}
}

// A worktree with a change before the step stops it before any run.
func TestADirtyWorktreeStopsTheStepBeforeAnyRun(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, dirty: "?? notes.md\n"}
	code, sum, _ := gated(t, f.run)
	if code != exitStopped || sum.Base != "c0" || !strings.Contains(sum.Reason, "notes.md") || f.agisters != 0 {
		t.Fatalf("exit %d, %d runs, %+v", code, f.agisters, sum)
	}
}

// An implement run that did not complete stops the step with its error,
// and nothing is committed.
func TestAFailedImplementRunStopsTheStep(t *testing.T) {
	t.Parallel()
	failed, _ := json.Marshal(map[string]any{"run_id": "i1", "status": "failed", "error": map[string]any{"class": "timeout", "message": "45m"}})
	f := &fake{t: t, implements: []string{string(failed)}}
	code, sum, out := gated(t, f.run)
	if code != exitStopped || sum.Base != "c0" || !strings.Contains(sum.Reason, "implement run i1 failed: timeout: 45m") || len(f.commits) != 0 {
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
	_, _, out := gated(t, f.run)
	goal, err := os.ReadFile(filepath.Join(out, "goal.md"))
	if err != nil {
		t.Fatal(err)
	}
	wantGoal := "# LAB-1 step 2\n\n## Intent\n\nWhat the issue's text, under Done when, makes true.\n\n## Base\n\nc0\n\n" +
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
	wantStep := "# LAB-1 step 2\n\n## Goal\n\n`" + filepath.Join(out, "goal.md") + "`\n\n## Base\n\nc0\n\n" +
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

// A point an implement run leaves open goes to the advisor after the
// run's commit, as the run wrote it. The decision is appended to the
// decisions record as the next record, committed, and run as a fix brief
// whose "## Acts on" is the record; the summary lists it.
func TestAnOpenPointIsDecidedByTheAdvisorAndTheDecisionActedOn(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{leftOpen("i1", open), implementResult("i2", "cmd/a.go")},
		advisors: []string{advised("a1", decision)}, reviews: []string{reviewed("r1")}}
	code, sum, out := gated(t, f.run)
	if code != exitPassed || !reflect.DeepEqual(sum.Records, []string{"D-5"}) || sum.Open != nil {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	question, err := os.ReadFile(f.questions[0])
	if err != nil {
		t.Fatal(err)
	}
	wantQuestion := "# Question\n\n## Asked by\n\nimplement run i1, LAB-1 step 2\n\n## Question\n\nWhich exit code?\n\n" +
		"## Options\n\n- 0\n- 64\n\n## Searched\n\n- ADR-030 rule 8: silent on exit codes\n"
	if string(question) != wantQuestion {
		t.Errorf("question:\n%s\nwant:\n%s", question, wantQuestion)
	}
	decisions := filepath.Join(filepath.Dir(out), "decisions.md")
	got, err := os.ReadFile(decisions)
	if err != nil {
		t.Fatal(err)
	}
	record := "## D-5: Which exit code?\n\n- **Status:** Provisional (advisor)\n- **Asked by:** implement run i1, LAB-1 step 2\n" +
		"- **Question:** Which exit code?\n- **Options:**\n  - 0\n  - 64\n- **Searched:**\n  - ADR-030 rule 8: silent on exit codes\n" +
		"- **Excluded:**\n  - 0: ADR-001 rule 6\n- **Decision:** 64\n- **Rests on:**\n  - ADR-001 rule 6\n" +
		"- **Follow-ups:**\n  - TestTheCallExits64 proves it.\n- **Advisor run:** a1\n"
	if string(got) != records+"\n"+record {
		t.Errorf("decisions:\n%s\nwant:\n%s", got, records+"\n"+record)
	}
	if want := [][]string{{"cmd/a.go"}, {decisions}, {"cmd/a.go"}}; !reflect.DeepEqual(f.added, want) {
		t.Errorf("staged %q, want %q", f.added, want)
	}
	wantCommits := []string{"cmd: the call is refused", "cmd: the call is refused (D-5 recorded)", "cmd: the call is refused (D-5)"}
	if !reflect.DeepEqual(f.commits, wantCommits) {
		t.Errorf("commits %q, want %q", f.commits, wantCommits)
	}
	if len(f.briefs) != 2 {
		t.Fatalf("briefs %q", f.briefs)
	}
	brief, err := os.ReadFile(f.briefs[1])
	if err != nil {
		t.Fatal(err)
	}
	acts := "\n## Acts on\n\nThe decision `D-5`, recorded in `" + decisions + "`, as written:\n\n```text\n" + record + "```\n"
	if !strings.HasPrefix(string(brief), "# LAB-1 step 2, decision D-5\n") || !strings.Contains(string(brief), acts) {
		t.Errorf("brief:\n%s\nwant its Acts on:\n%s", brief, acts)
	}
}

// A conflict in the record stops the step for the owner with the
// advisor's reason: nothing is appended, and no run acts on it.
func TestAConflictInTheRecordStopsTheStepForTheOwner(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{leftOpen("i1", open)},
		advisors: []string{advised("a1", map[string]any{"kind": "conflict", "reason": "ADR-001 rule 6 and D-4 collide."})}}
	code, sum, out := gated(t, f.run)
	if code != exitOwner || sum.Status != "owner" || sum.Base != "c0" || !strings.Contains(sum.Reason, "ADR-001 rule 6 and D-4 collide.") {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if !reflect.DeepEqual(sum.Open, []point{open}) || sum.Records != nil || len(f.commits) != 1 {
		t.Errorf("open %+v, records %q, commits %q", sum.Open, sum.Records, f.commits)
	}
	if got, _ := os.ReadFile(filepath.Join(filepath.Dir(out), "decisions.md")); string(got) != records {
		t.Errorf("decisions:\n%s", got)
	}
}

// A step puts one question to the advisor. A second open point stops the
// step with the point in the summary: left by the run that acted on the
// decision, by a run of a step resumed after its decision, or by one run
// together with the first.
func TestASecondOpenPointStopsTheStep(t *testing.T) {
	t.Parallel()
	second := point{Question: "Which stream?", Options: []string{"stdout", "stderr"}, Searched: []string{"ADR-030: silent"}}
	for name, tc := range map[string]struct {
		f        *fake
		advisors int
		open     []point
	}{
		"after the decision": {&fake{implements: []string{leftOpen("i1", open), leftOpen("i2", second)}, advisors: []string{advised("a1", decision)}}, 1, []point{second}},
		"in a step resumed":  {&fake{implements: []string{leftOpen("i1", second)}, recorded: true}, 0, []point{second}},
		"in one run":         {&fake{implements: []string{leftOpen("i1", open, second)}}, 0, []point{open, second}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			tc.f.t = t
			code, sum, _ := gated(t, tc.f.run)
			if code != exitOpen || sum.Status != "open" || sum.Base != "c0" || !reflect.DeepEqual(sum.Open, tc.open) {
				t.Fatalf("exit %d, %+v", code, sum)
			}
			if len(tc.f.questions) != tc.advisors || len(sum.Reviews) != 0 {
				t.Errorf("advisor runs %d, want %d; reviews %+v", len(tc.f.questions), tc.advisors, sum.Reviews)
			}
		})
	}
}
