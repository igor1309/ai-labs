package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// echo is a fake model that answers with its prompt's last new line and
// keeps every prompt.
type echo struct{ prompts []string }

func (e *echo) Ask(_ context.Context, _, prompt string) (Reply, error) {
	e.prompts = append(e.prompts, prompt)
	return Reply{Text: "summary " + string(rune('A'+len(e.prompts)-1)), InputTokens: len(prompt), OutputTokens: 1, Latency: time.Second}, nil
}

func call() Fixture {
	return Fixture{Name: "c", Duration: 400, Turns: []Turn{
		{Side: "me", At: 10, Words: "code word Heron"},
		{Side: "them", At: 170, Words: "late first window"},
		{Side: "me", At: 250, Words: "second window"},
		{Side: "them", At: 390, Words: "last words"},
	}, Facts: []Fact{{ID: "heron", At: 10, All: [][]string{{"heron"}}}}}
}

func TestRollingStepsAtEachWindowEndAndCarriesTheSummary(t *testing.T) {
	m := &echo{}
	r, err := play(context.Background(), call(), Strategy{Size: 3 * time.Minute, Overlap: time.Minute}, m)
	if err != nil {
		t.Fatal(err)
	}
	var at []Secs
	for _, s := range r.Steps {
		at = append(at, s.At)
	}
	if !slices.Equal(at, []Secs{180, 300, 400}) {
		t.Fatalf("steps at %v", at)
	}
	if !strings.Contains(m.prompts[1], "summary A") || !strings.Contains(m.prompts[1], "[02:50] them: late first window") ||
		!strings.Contains(m.prompts[1], "New since the last summary:\n[04:10] me: second window") {
		t.Fatalf("second prompt:\n%s", m.prompts[1])
	}
	if strings.Contains(m.prompts[2], "code word") {
		t.Fatalf("rolling prompt resent old words:\n%s", m.prompts[2])
	}
}

func TestRereadSendsTheWholeCallSoFar(t *testing.T) {
	m := &echo{}
	if _, err := play(context.Background(), call(), Strategy{Size: 3 * time.Minute, Overlap: time.Minute, Reread: true}, m); err != nil {
		t.Fatal(err)
	}
	last := m.prompts[len(m.prompts)-1]
	for _, w := range []string{"code word Heron", "second window", "last words"} {
		if !strings.Contains(last, w) {
			t.Fatalf("last prompt lacks %q:\n%s", w, last)
		}
	}
}

func TestScoreNeedsAWordOfEveryGroupAndSkipsFactsNotYetSaid(t *testing.T) {
	facts := []Fact{
		{ID: "launch", At: 10, All: [][]string{{"march 14", "14 march"}}},
		{ID: "action", At: 20, All: [][]string{{"priya"}, {"security"}}},
		{ID: "later", At: 500, All: [][]string{{"x"}}},
	}
	kept, missing := score(facts, 100, "Launch on 14 March. Priya owns it.")
	if !slices.Equal(kept, []string{"launch"}) || !slices.Equal(missing, []string{"action"}) {
		t.Fatalf("kept %v missing %v", kept, missing)
	}
}

func TestCheckedInFixturesAreTheGeneratedOnes(t *testing.T) {
	dir := t.TempDir()
	if err := writeFixtures(dir); err != nil {
		t.Fatal(err)
	}
	fresh, _ := filepath.Glob(filepath.Join(dir, "*.json"))
	if len(fresh) == 0 {
		t.Fatal("no fixtures written")
	}
	for _, p := range fresh {
		want, _ := os.ReadFile(p)
		got, err := os.ReadFile(filepath.Join("testdata", filepath.Base(p)))
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("testdata/%s is not the generated fixture: run -gen", filepath.Base(p))
		}
	}
}

func TestParseCLIAddsCachedInputAndReadsCost(t *testing.T) {
	r, err := parseCLI([]byte(`{"result":"ok","duration_api_ms":1500,"total_cost_usd":0.01,"usage":{"input_tokens":2,"cache_creation_input_tokens":600,"cache_read_input_tokens":40,"output_tokens":7}}`))
	if err != nil {
		t.Fatal(err)
	}
	if r.Text != "ok" || r.InputTokens != 642 || r.OutputTokens != 7 || r.CostUSD != 0.01 || r.Latency != 1500*time.Millisecond {
		t.Fatalf("%+v", r)
	}
}
