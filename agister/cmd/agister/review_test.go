package main

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// reviews is each review of home's code_review, in declaration order: its
// step and its process.
var reviews = []struct{ step, process string }{
	{"architecture", "architecture_review"},
	{"tests", "tests_review"},
	{"adversarial", "adversarial_review"},
	{"clarity", "clarity_review"},
	{"intent", "intent_review"},
}

// goalBrief is a brief of home's form "goal".
const goalBrief = "# g: x\n\n## Intent\n\ni\n\n## Done when\n\n1. d\n\n## Out of scope\n\nNone.\n\n## Open\n\nNone.\n"

// judgement is a reply home's schema "judgement" takes.
const judgement = `{"summary":"j","items":[],"coverage_gaps":[]}`

// reviewResult is a reply home's schema "review-result" takes, its summary
// the process that gave it.
func reviewResult(process string) map[string]any {
	return map[string]any{"verdict": "approve", "summary": process, "findings": []any{},
		"coverage": []any{map[string]any{"item": "1. x", "status": "checked", "detail": "d"}}}
}

// newReviewFixture is the run fixture of review.feature: home's settings
// as shipped; git giving "/r" HEAD "c1", clean, naming "origin/trunk" and
// "c0" the commit "c0", "HEAD" and "c1" the commit "c1", and "a.go"
// changed from "c0" to "c1"; the file "/r/g.md" holding a goal; and
// claude-code completing the judge with a judgement.
func newReviewFixture(t *testing.T) *runFixture {
	t.Helper()
	f := newRunFixture(t, shippedHome(t), nil)
	f.sources.commits = map[string]string{"origin/trunk": "c0", "c0": "c0", "HEAD": "c1", "c1": "c1"}
	f.sources.changed = map[string][]string{"c0..c1": {"a.go"}}
	f.sources.files = map[string]string{"/r/g.md": goalBrief}
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(judgement)})
	return f
}

// processOf is the process of the review whose turn turn is, by the text
// of its prompt in the message, failing t where it is not one review's.
func processOf(t *testing.T, settings map[string]string, turn codex.Turn) string {
	t.Helper()
	var found []string
	for _, review := range reviews {
		prompt := settings["/u/.agister/prompts/code-review-"+review.step+".md"]
		if prompt != "" && strings.Contains(turn.Message, prompt) {
			found = append(found, review.process)
		}
	}
	if len(found) != 1 {
		t.Errorf("a codex turn whose message holds the prompts of %q, want one review's", found)
		return ""
	}
	return found[0]
}

// completesReview answers a review's turn with a review result naming its
// process.
func completesReview(t *testing.T, settings map[string]string, turn codex.Turn) (codex.Result, error) {
	output, err := json.Marshal(reviewResult(processOf(t, settings, turn)))
	if err != nil {
		return codex.Result{}, err
	}
	return codex.Result{Reply: &codex.Reply{Output: output}}, nil
}

// judged is the judge's input "reviews", as its message gives it, decoded.
func judged(t *testing.T, f *runFixture) []any {
	t.Helper()
	ran := f.runtimes.claude.ran()
	if len(ran) != 1 {
		t.Fatalf("claude-code ran %d turns, want the judge's", len(ran))
	}
	_, section, ok := strings.Cut(ran[0].Message, "## reviews\n\n")
	if !ok {
		t.Fatalf("the judge's message %q, want its input reviews", ran[0].Message)
	}
	section, _, _ = strings.Cut(section, "\n")
	var got []any
	if err := json.Unmarshal([]byte(section), &got); err != nil {
		t.Fatalf("the judge's input reviews %q: %v", section, err)
	}
	return got
}

// review.feature, "Five reviews side by side, then the judge": each turn
// ends only once all five have started, which only turns side by side get
// past; by then each holds the worktree, shared.
//
// Contract test: the files home holds, as Agister ships them.
func TestFiveReviewsSideBySideThenTheJudge(t *testing.T) {
	t.Parallel()
	f := newReviewFixture(t)
	// started lets each turn on once all five have started; sampled, once
	// all five have read the holds, so none is released before then.
	var started, sampled sync.WaitGroup
	started.Add(len(reviews))
	sampled.Add(len(reviews))
	var mu sync.Mutex
	held := map[string][2]int{}
	f.runtimes.codex.answer = func(_ context.Context, turn codex.Turn) (codex.Result, error) {
		started.Done()
		started.Wait()
		_, alone, shared := f.holding.locks()
		mu.Lock()
		held[processOf(t, f.settings, turn)] = [2]int{alone, shared}
		mu.Unlock()
		sampled.Done()
		sampled.Wait()
		return completesReview(t, f.settings, turn)
	}
	got := f.run(t, "/r", "run", "code_review", "--param", "goal=g.md")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	want := map[string][2]int{}
	for _, review := range reviews {
		want[review.process] = [2]int{0, len(reviews)}
	}
	if !reflect.DeepEqual(held, want) {
		t.Errorf("held, alone and shared, while each turn ran %v; want five shared, none alone, in each", held)
	}
	for _, turn := range f.runtimes.codex.ran() {
		if turn.Dir != "/r" {
			t.Errorf("codex ran a turn in %q, want /r", turn.Dir)
		}
	}
	var entries []any
	for _, review := range reviews {
		entries = append(entries, map[string]any{"status": "completed", "class": nil, "output": reviewResult(review.process)})
	}
	if reviews := judged(t, f); !reflect.DeepEqual(reviews, entries) {
		t.Errorf("the judge's reviews\n%v\nwant\n%v", reviews, entries)
	}
	if asked, alone, shared := f.holding.locks(); len(asked) != len(reviews)+1 || alone != 0 || shared != 0 {
		t.Errorf("locks asked %+v, %d held alone, %d shared after the run; want six, none held", asked, alone, shared)
	}
	var judge any
	if err := json.Unmarshal([]byte(judgement), &judge); err != nil {
		t.Fatal(err)
	}
	if p := modelPrintedOf(t, got); p.Status != "completed" || p.Class != nil || !reflect.DeepEqual(p.Output, map[string]any{"judgement": judge}) {
		t.Errorf("printed %+v, want completed, its judgement the judge's", p)
	}
}

// review.feature, "A review that fails still reaches the judge".
//
// Contract test: the files home holds, as Agister ships them.
func TestAReviewThatFailsStillReachesTheJudge(t *testing.T) {
	t.Parallel()
	f := newReviewFixture(t)
	f.runtimes.codex.answer = func(_ context.Context, turn codex.Turn) (codex.Result, error) {
		if processOf(t, f.settings, turn) == "tests_review" {
			return codex.Result{Reply: &codex.Reply{Failure: codex.RateLimited, Reason: "429"}}, nil
		}
		return completesReview(t, f.settings, turn)
	}
	got := f.run(t, "/r", "run", "code_review", "--param", "goal=g.md")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	entries := judged(t, f)
	if len(entries) != len(reviews) {
		t.Fatalf("the judge's reviews %v, want five", entries)
	}
	if want := map[string]any{"status": "failed", "class": "rate_limited", "output": nil}; !reflect.DeepEqual(entries[1], want) {
		t.Errorf("the tests review's entry %v, want %v", entries[1], want)
	}
	if p := modelPrintedOf(t, got); p.Status != "completed" || p.Class != nil || p.Reason != nil {
		t.Errorf("printed %+v, want the judge's end: completed, no class, no reason", p)
	}
}

// review.feature, "Progress lines of reviews side by side are each whole":
// stderr is each review's start, tool call and end, each line whole and in
// that order, and the judge's start and end.
//
// Contract test: the files home holds, as Agister ships them.
func TestProgressLinesOfReviewsSideBySideAreEachWhole(t *testing.T) {
	t.Parallel()
	f := newReviewFixture(t)
	f.runtimes.codex.reports = []codex.Report{{Tool: &codex.Tool{Name: "Bash", Input: "ls"}}}
	f.runtimes.codex.answer = func(_ context.Context, turn codex.Turn) (codex.Result, error) {
		return completesReview(t, f.settings, turn)
	}
	got := f.run(t, "/r", "run", "code_review", "--param", "goal=g.md")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	of := map[string][]string{}
	for _, line := range strings.SplitAfter(got.progress, "\n") {
		if line == "" {
			continue
		}
		step, _, _ := strings.Cut(strings.TrimPrefix(line, "· "), ":")
		of[step] = append(of[step], line)
	}
	want := map[string][]string{"judge": {"· judge: started on claude-opus\n", "· judge: ended completed in 0s\n"}}
	for _, review := range reviews {
		want[review.step] = []string{
			fmt.Sprintf("· %s: started on codex-sol-61\n", review.step),
			fmt.Sprintf("· %s: Bash ls\n", review.step),
			fmt.Sprintf("· %s: ended completed in 0s\n", review.step),
		}
	}
	if !reflect.DeepEqual(of, want) {
		t.Errorf("progress\n%s\nwant each step's own lines, whole, in order:\n%q", got.progress, want)
	}
}
