package main

import (
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

// progress answers core/workflow's events (docs/run-implementation.md,
// "Inputs and progress"): each is printed to its writer as a short line,
// for a person reading along, not a contract. Best effort: a line that
// cannot be written is dropped, since the run's result does not depend on
// it. A turn's tool calls come from the goroutine that reads its program's
// stdout, so the lines are written one at a time.
type progress struct {
	mu sync.Mutex
	w  io.Writer
}

func newProgress(w io.Writer) (*progress, error) {
	if w == nil {
		return nil, errors.New("progress: no writer")
	}
	return &progress{w: w}, nil
}

func (p *progress) Started(step, agent string) {
	p.line(step, "started on "+agent)
}

func (p *progress) Tool(step string, tool workflow.Tool) {
	what := inLine(tool.Name)
	if tool.Input != "" {
		what += " " + inLine(short(tool.Input))
	}
	p.line(step, what)
}

// inputLimit is the most of a tool call's input a line prints, in bytes,
// as the archive printed it.
const inputLimit = 300

// short is text cut to inputLimit, at the start of a character, and marked
// "…" where it was cut.
func short(text string) string {
	if len(text) <= inputLimit {
		return text
	}
	end := inputLimit
	for end > 0 && !utf8.RuneStart(text[end]) {
		end--
	}
	return text[:end] + "…"
}

// Stale prints what went stale, and "; recovering" where a recovery turn
// follows.
func (p *progress) Stale(step string, stale workflow.Stale) {
	what := "stale: " + inLine(stale.What)
	if stale.Recovering {
		what += "; recovering"
	}
	p.line(step, what)
}

// Reused prints the call taken in place of the step's start and end.
func (p *progress) Reused(step, call string) {
	p.line(step, "reused "+inLine(call))
}

func (p *progress) Ended(step string, ended workflow.Ended) {
	how := string(ended.Status)
	if ended.Class != "" {
		how += " " + string(ended.Class)
	}
	p.line(step, fmt.Sprintf("ended %s in %s", how, took(ended.Duration)))
}

// line writes "· <step>: <what>" and a newline.
func (p *progress) line(step, what string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	_, _ = fmt.Fprintf(p.w, "· %s: %s\n", inLine(step), what)
}

// inLine is text as it is, or quoted where it holds a newline or another
// character that is not printable, so that each event stays one line.
func inLine(text string) string {
	if !utf8.ValidString(text) || strings.ContainsFunc(text, func(r rune) bool { return !strconv.IsPrint(r) }) {
		return strconv.Quote(text)
	}
	return text
}

// took is a duration as a person reads it: to the second from a second
// on, to the millisecond below.
func took(d time.Duration) string {
	if d >= time.Second {
		return d.Round(time.Second).String()
	}
	return d.Round(time.Millisecond).String()
}
