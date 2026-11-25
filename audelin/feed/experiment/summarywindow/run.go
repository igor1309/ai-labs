package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

// Strategy is one way a client turns the feed into a running summary.
// Reread sends the whole call so far at each window; otherwise each step
// sends the summary so far and the window's words.
type Strategy struct {
	Name    string
	Size    time.Duration
	Overlap time.Duration
	Reread  bool
}

// Step is one model call at the end of a window.
type Step struct {
	At           Secs     `json:"at"`
	InputTokens  int      `json:"inputTokens"`
	OutputTokens int      `json:"outputTokens"`
	CostUSD      float64  `json:"costUSD"`
	LatencyMS    int64    `json:"latencyMS"`
	Kept         []string `json:"kept"`
	Missing      []string `json:"missing"`
	Summary      string   `json:"summary"`
}

// Run is one strategy over one call.
type Run struct {
	Fixture  string `json:"fixture"`
	Strategy string `json:"strategy"`
	Facts    int    `json:"facts"`
	Steps    []Step `json:"steps"`
}

// Reply is what the model answered and what it cost.
type Reply struct {
	Text         string
	InputTokens  int
	OutputTokens int
	CostUSD      float64
	Latency      time.Duration
}

// Model answers one prompt.
type Model interface {
	Ask(ctx context.Context, system, prompt string) (Reply, error)
}

const system = `You keep a running summary of a call that is still going on, for an assistant that helps one participant follow it.
Keep every decision (and say so when a later one replaces it), open question, action item with its owner, number, name, risk and code word.
Leave out small talk. Write at most 250 words of plain bullets. Reply with the summary only.`

// play replays the fixture through the feed's call events on a fake
// clock and asks the model at each window, as a following client would.
func play(ctx context.Context, f Fixture, s Strategy, m Model) (Run, error) {
	clk := &fakeClock{now: callZero}
	events, err := callevents.New(&recorded{f: f, clock: clk}, clk, s.Size, s.Overlap)
	if err != nil {
		return Run{}, err
	}
	run := Run{Fixture: f.Name, Strategy: s.Name, Facts: len(f.Facts)}
	var heard []callevents.Part
	summary := ""
	for {
		ev, err := events.Next(ctx)
		if err != nil {
			return Run{}, err
		}
		if ev.Kind == callevents.CallEnded {
			return run, nil
		}
		if ev.Kind != callevents.Chunk || len(ev.Window.New) == 0 {
			continue
		}
		heard = append(heard, ev.Window.New...)
		var prompt string
		if s.Reread {
			prompt = "Transcript of the call so far:\n" + lines(heard) + "\nWrite the summary of the whole call so far."
		} else {
			prompt = rollingPrompt(summary, ev.Window)
		}
		reply, err := m.Ask(ctx, system, prompt)
		if err != nil {
			return Run{}, fmt.Errorf("%s %s at %s: %w", f.Name, s.Name, ev.Window.To, err)
		}
		summary = reply.Text
		at := Secs(ev.Window.To / time.Second)
		kept, missing := score(f.Facts, at, summary)
		run.Steps = append(run.Steps, Step{
			At: at, InputTokens: reply.InputTokens, OutputTokens: reply.OutputTokens,
			CostUSD: reply.CostUSD, LatencyMS: reply.Latency.Milliseconds(),
			Kept: kept, Missing: missing, Summary: summary,
		})
	}
}

func rollingPrompt(summary string, w callevents.Window) string {
	var b strings.Builder
	b.WriteString("Summary so far:\n")
	if summary == "" {
		b.WriteString("(none yet)\n")
	} else {
		b.WriteString(summary + "\n")
	}
	if len(w.Context) > 0 {
		b.WriteString("\nAlready covered by the summary, for context only:\n" + lines(w.Context))
	}
	b.WriteString("\nNew since the last summary:\n" + lines(w.New))
	b.WriteString("\nWrite the updated summary of the whole call so far.")
	return b.String()
}

func lines(parts []callevents.Part) string {
	var b strings.Builder
	for _, p := range parts {
		s := int(p.Start / time.Second)
		fmt.Fprintf(&b, "[%02d:%02d] %s: %s\n", s/60, s%60, p.Side, p.Words)
	}
	return b.String()
}

// score tells which facts said before at the summary keeps.
func score(facts []Fact, at Secs, summary string) (kept, missing []string) {
	text := strings.ToLower(summary)
	for _, f := range facts {
		if f.At >= at {
			continue
		}
		ok := true
		for _, group := range f.All {
			any := false
			for _, w := range group {
				any = any || strings.Contains(text, strings.ToLower(w))
			}
			ok = ok && any
		}
		if ok {
			kept = append(kept, f.ID)
		} else {
			missing = append(missing, f.ID)
		}
	}
	return kept, missing
}

var callZero = time.Date(2026, 1, 5, 10, 0, 0, 0, time.UTC)

// fakeClock moves to the time asked at once, so an hour replays in
// no time.
type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time { return c.now }

func (c *fakeClock) Wait(ctx context.Context, t time.Time) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if t.After(c.now) {
		c.now = t
	}
	return nil
}

// recorded is the live call port over a fixture: a turn is read once the
// clock passes it, and the call ends at its length.
type recorded struct {
	f     Fixture
	clock *fakeClock
}

func (r *recorded) Live() (callevents.Call, bool, error) {
	now := r.clock.Now().Sub(callZero)
	call := callevents.Call{ID: r.f.Name, Start: callZero, Ended: now >= r.f.Duration.Duration()}
	for i, t := range r.f.Turns {
		if t.At.Duration() < now || call.Ended {
			call.Parts = append(call.Parts, callevents.Part{ID: fmt.Sprint(i), Side: t.Side, Start: t.At.Duration(), Words: t.Words})
		}
	}
	return call, true, nil
}
