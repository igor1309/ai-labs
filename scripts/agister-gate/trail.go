package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// The trail is the gate's own record, <out>/events.jsonl: one event for
// each thing the gate did or decided, in order. Every program it ran, with
// its arguments and output; every file it read or wrote, with its digest
// and, for a brief, what it was made from; each item a judge ruled on, with
// what the gate did with it; every commit; and why the step stopped. The
// progress lines are the events, one line each, so what a caller watches is
// what is kept. A resumed step appends to the trail it resumes. The gate
// does not act unrecorded: an event it cannot write stops the step. The
// events before the base is pinned are kept until out is made, which waits
// for the pin.

const trailFile = "events.jsonl"

type event struct {
	Seq  int            `json:"seq"`
	At   time.Time      `json:"at"`
	Kind string         `json:"kind"`
	Data map[string]any `json:"data"`
}

// started records the gate's options.
func (g *gate) started() error {
	o := g.options
	return g.emit("GATE_STARTED", map[string]any{"issue": o.issue, "title": o.title, "constraints": o.constraints,
		"implement": o.implement, "advisor": o.advisor, "review": o.review, "decisions": o.decisions, "base": o.base,
		"message": o.message, "out": o.out, "dir": o.dir, "from": o.from, "reviews": o.reviews},
		fmt.Sprintf("started at %s, %d review(s) counted, base %s; trail %s", o.from, o.reviews, o.base, filepath.Join(o.out, trailFile)))
}

// open opens the trail in out, after the events and run results a step
// before it left there, and writes the events kept until now.
func (g *gate) open() error {
	if err := os.MkdirAll(g.out, 0o755); err != nil {
		return err
	}
	path := filepath.Join(g.out, trailFile)
	kept, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if g.events, err = whole(kept); err != nil {
		return fmt.Errorf("trail %s is damaged: %w; the step does not go on over it", path, err)
	}
	entries, err := os.ReadDir(g.out)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		number, _, _ := strings.Cut(entry.Name(), "-")
		if n, err := strconv.Atoi(number); err == nil && strings.HasSuffix(entry.Name(), ".json") {
			g.seq = max(g.seq, n)
		}
	}
	create := g.create
	if create == nil {
		create = func(path string) (io.WriteCloser, error) {
			return os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o644)
		}
	}
	if g.trail, err = create(path); err != nil {
		return err
	}
	pending := g.pending
	g.pending = nil
	for _, e := range pending {
		if err := g.append(e); err != nil {
			return err
		}
	}
	return nil
}

// whole is the number of events in trail, a trail a step before left,
// when each of its lines is an event numbered in order and its last line
// is ended.
func whole(trail []byte) (int, error) {
	if len(trail) == 0 {
		return 0, nil
	}
	if !bytes.HasSuffix(trail, []byte("\n")) {
		return 0, errors.New("its last event is not ended")
	}
	lines := strings.Split(strings.TrimSuffix(string(trail), "\n"), "\n")
	for i, line := range lines {
		var e event
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			return 0, fmt.Errorf("line %d is not an event: %w", i+1, err)
		}
		if e.Seq != i+1 {
			return 0, fmt.Errorf("line %d is event %d", i+1, e.Seq)
		}
	}
	return len(lines), nil
}

// emit records an event of kind with data, and prints line as its progress
// line.
func (g *gate) emit(kind string, data map[string]any, line string) error {
	if g.progress != nil {
		fmt.Fprintf(g.progress, "agister-gate: %s\n", line)
	}
	e := event{At: time.Now().UTC(), Kind: kind, Data: data}
	if g.trail == nil {
		g.pending = append(g.pending, e)
		return nil
	}
	return g.append(e)
}

// trailError is a write to the trail that failed. It stays: a trail with a
// gap, or a part of an event, takes no event after it.
type trailError struct{ err error }

func (e trailError) Error() string { return "trail: " + e.err.Error() }

func (g *gate) append(e event) error {
	if g.broken != nil {
		return g.broken
	}
	g.events++
	e.Seq = g.events
	line, err := json.Marshal(e)
	if err != nil {
		return err
	}
	if _, err := g.trail.Write(append(line, '\n')); err != nil {
		g.broken = trailError{err}
		return g.broken
	}
	return nil
}

// command runs name with args in the worktree, between the events that
// record it: the command, then its output, standard error and error. Its
// standard error is shown as it comes, among the progress lines. An event
// it cannot write is its error, a trailError, in place of the command's.
func (g *gate) command(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := append([]string{name}, args...)
	if err := g.emit("COMMAND_STARTED", map[string]any{"dir": g.dir, "command": cmd}, "running: "+strings.Join(cmd, " ")); err != nil {
		return nil, err
	}
	var stderr bytes.Buffer
	var shown io.Writer = &stderr
	if g.progress != nil {
		shown = io.MultiWriter(&stderr, g.progress)
	}
	out, runErr := g.run(ctx, g.dir, shown, name, args...)
	data, result := map[string]any{"command": cmd, "output": string(out), "stderr": stderr.String()}, "ok"
	if runErr != nil {
		data["error"], result = runErr.Error(), runErr.Error()
	}
	if err := g.emit("COMMAND_FINISHED", data, fmt.Sprintf("finished: %s %s: %s", name, args[0], result)); err != nil {
		return out, err
	}
	return out, runErr
}

// read reads path, what the gate takes as input, and records its digest.
func (g *gate) read(path, what string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return data, g.emit("FILE_READ", map[string]any{"what": what, "path": path, "bytes": len(data), "sha256": digest(data)},
		fmt.Sprintf("read %s %s", what, path))
}

// write writes data to path and records it: what it is, its digest and
// what it was made from.
func (g *gate) write(path string, data []byte, what string, from map[string]any) error {
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	return g.emit("FILE_WRITTEN", map[string]any{"what": what, "path": path, "bytes": len(data), "sha256": digest(data), "from": from},
		fmt.Sprintf("wrote %s %s", what, path))
}

// rulings records each item of review n's judgement and what the gate does
// with it. last is whether review n is the last the step counts.
func (g *gate) rulings(n int, runID string, j judgement, last bool) error {
	items := make([]map[string]any, len(j.Items))
	majors := 0
	for i, it := range j.Items {
		var done string
		switch {
		case it.Ruling == "fix" && it.Severity == "major" && last:
			done, majors = "left for the owner: the last review rules it fix", majors+1
		case it.Ruling == "fix" && it.Severity == "major":
			done, majors = "sent to the fix run", majors+1
		case it.Ruling == "fix":
			done = "left: the gate fixes no minor"
		case it.Ruling == "defer":
			done = "left: deferred"
		default:
			done = "not acted on: ruled " + it.Ruling
		}
		items[i] = map[string]any{"title": it.Title, "ruling": it.Ruling, "severity": it.Severity,
			"sources": it.Sources, "action": it.Action, "gate": done}
	}
	return g.emit("RULINGS_READ", map[string]any{"review": n, "run_id": runID, "items": items},
		fmt.Sprintf("review %d, %s: %d major(s) ruled fix", n, runID, majors))
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}
