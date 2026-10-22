package main

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
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

// unboundReviews removes the concurrency bound for tests whose claim is
// concurrent calls, independently of home's serial review policy.
func unboundReviews(f *runFixture) {
	const path = "/u/.agister/workflows/code_review.yaml"
	f.settings[path] = strings.Replace(f.settings[path], "      max: 1\n", "", 1)
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

// judgedText is the judge's input "reviews", as its message gives it.
func judgedText(t *testing.T, f *runFixture) string {
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
	return section
}

// judged is the judge's input "reviews", as its message gives it, decoded.
func judged(t *testing.T, f *runFixture) []any {
	t.Helper()
	section := judgedText(t, f)
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
	unboundReviews(f)
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
	unboundReviews(f)
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

// Home's review workflows run nodes one at a time and persist each end
// before the next call; one failure still reaches the judge in its place.
// Contract test: the review workflows home ships.
func TestHomeReviewsRunInOrderAndRecordEveryEnd(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"code_review", "adr_review"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := newReviewFixture(t)
			var order []string
			f.runtimes.codex.answer = func(_ context.Context, turn codex.Turn) (codex.Result, error) {
				if calls := f.store.last(t).Calls; len(calls) != len(order) {
					t.Errorf("calls before next review %+v, want every %d preceding end", calls, len(order))
				}
				_, alone, shared := f.holding.locks()
				if alone != 0 || shared != 1 {
					t.Errorf("held alone %d, shared %d; want exactly one reader", alone, shared)
				}
				process := "adr_review_codex"
				if name == "code_review" {
					process = processOf(t, f.settings, turn)
				}
				order = append(order, process)
				if process == "tests_review" {
					return codex.Result{Reply: &codex.Reply{Failure: codex.RateLimited, Reason: "429"}}, nil
				}
				output, err := json.Marshal(reviewResult(process))
				return codex.Result{Reply: &codex.Reply{Output: output}}, err
			}
			got := f.run(t, "/r", "run", name, "--param", "goal=g.md")
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("run %+v", got)
			}
			want := []string{"adr_review_codex"}
			if name == "code_review" {
				want = nil
				for _, review := range reviews {
					want = append(want, review.process)
				}
			}
			if !reflect.DeepEqual(order, want) {
				t.Errorf("order %q, want %q", order, want)
			}
			entries := judged(t, f)
			var outcomes []any
			for _, process := range want {
				if process == "tests_review" {
					outcomes = append(outcomes, map[string]any{"status": "failed", "class": "rate_limited", "output": nil})
				} else {
					outcomes = append(outcomes, map[string]any{"status": "completed", "class": nil, "output": reviewResult(process)})
				}
			}
			if !reflect.DeepEqual(entries, outcomes) {
				t.Errorf("judge entries %v, want %v", entries, outcomes)
			}
			calls := f.store.last(t).Calls
			if len(calls) != len(want)+1 {
				t.Fatalf("calls %+v, want nodes and judge", calls)
			}
			for i, process := range append(want, "review_judge") {
				if calls[i].Process != process {
					t.Errorf("call %d process %q, want %q", i, calls[i].Process, process)
				}
			}
		})
	}
}

// review.feature, "A parallel's max reaches core's workflow": the max of
// the parallel "reviews", as planning gives it to core/workflow, home's
// review workflows as shipped and code_review edited.
//
// Contract test: the files home holds, as Agister ships them.
func TestAParallelsMaxReachesCoresWorkflow(t *testing.T) {
	t.Parallel()
	const codeReview = "/u/.agister/workflows/code_review.yaml"
	for _, c := range []struct {
		name     string
		workflow string
		edit     func(settings map[string]string)
		max      int
	}{
		{"code_review as shipped", "code_review", func(map[string]string) {}, 1},
		{"adr_review as shipped", "adr_review", func(map[string]string) {}, 1},
		{"code_review given max 3", "code_review", func(settings map[string]string) {
			settings[codeReview] = strings.Replace(settings[codeReview], "      max: 1\n", "      max: 3\n", 1)
		}, 3},
		{"code_review omitting max", "code_review", func(settings map[string]string) {
			settings[codeReview] = strings.Replace(settings[codeReview], "      max: 1\n", "", 1)
		}, 0},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			settings := shippedHome(t)
			c.edit(settings)
			spies := newRuntimesSpy(t)
			wrappers, err := newContracts(claudeCodeFacts(spies.claude), codexFacts(spies.codex))
			if err != nil {
				t.Fatal(err)
			}
			read, err := readSettings("/u/.agister", "/r", newFilesystemSpy(settings), rootSpy{root: "/r"}, wrappers)
			if err != nil {
				t.Fatal(err)
			}
			resolved, faults := read.resolver.Resolve(resolve.Document(resolve.KindWorkflow, c.workflow).WithParams("goal"))
			if len(faults) > 0 {
				t.Fatalf("faults %+v", faults)
			}
			built, unrun, err := planOf(c.workflow, resolved, read.documents,
				map[string]call.Inputs{"claude-code/3": call.InMessage, "codex/2": call.InMessage})
			if err != nil || len(unrun) > 0 {
				t.Fatalf("not run %q, error %v", unrun, err)
			}
			var maxes []int
			for _, step := range built.workflow.Steps {
				if step.Parallel != nil {
					maxes = append(maxes, step.Max)
				}
			}
			if want := []int{c.max}; !reflect.DeepEqual(maxes, want) {
				t.Errorf("the parallels' max %v, want %v", maxes, want)
			}
		})
	}
}
