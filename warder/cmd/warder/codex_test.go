package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// codexHomeFake is the Codex home of these tests, in memory, as the
// boundary run is given: it records every operation, and answers each with
// what its sessions give. It fills in nothing else.
type codexHomeFake struct {
	// sessions are the home's lock files, in the order listed.
	sessions []codexSession
	// answer, when set, is asked as each listing of the lock files begins,
	// by its number from 1 and under its context: an error it returns fails
	// the listing.
	answer func(ctx context.Context, call int) error

	mu         sync.Mutex
	listings   int
	operations []string
}

// codexSession is one lock file of the home, and its thread's rollout
// file.
type codexSession struct {
	thread string
	// held is whether another process holds the lock.
	held bool
	// rollout is the content of the thread's rollout file: it has none
	// when this is empty.
	rollout string
	// events is how many tokensCounted lines follow rollout in the file.
	// The home serves them as they are read, and holds none of them.
	events int
}

// size is the size of the session's rollout file, in bytes.
func (s codexSession) size() int64 {
	return int64(len(s.rollout)) + int64(s.events)*int64(len(tokensCounted))
}

// bytes returns the length bytes of the session's rollout file from
// offset on, and fewer where the file ends before that.
func (s codexSession) bytes(offset, length int64) []byte {
	data := make([]byte, min(length, s.size()-offset))
	filled := 0
	if offset < int64(len(s.rollout)) {
		filled = copy(data, s.rollout[offset:])
	}
	// The first event may begin before offset: it is served from there.
	for at := (offset + int64(filled) - int64(len(s.rollout))) % int64(len(tokensCounted)); filled < len(data); at = 0 {
		filled += copy(data[filled:], tokensCounted[at:])
	}
	return data
}

// The thread IDs of these tests, as Codex writes them.
const (
	threadWorking = "01a11494-690a-71f3-9de2-9c82b2166f25"
	threadIdle    = "01a119b1-2d6f-7c70-990a-ad4a1a461c97"
	threadUnknown = "01a119b1-a9a7-7ff3-bdb9-f07221962467"
	threadStale   = "01a11ada-be18-71c1-b0de-2007f2844855"
)

// Lines of a rollout file, as Codex 0.162.0 writes them, their long values
// cut: a turn that started, an event that is no turn marker, and a turn
// that completed.
const (
	turnStarted   = `{"timestamp":"2026-10-09T18:38:57.331Z","ordinal":1,"type":"event_msg","payload":{"type":"task_started","turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","started_at":1791571137,"model_context_window":258400,"collaboration_mode_kind":"default"}}` + "\n"
	tokensCounted = `{"timestamp":"2026-10-09T18:39:07.769Z","ordinal":18,"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":19362,"output_tokens":222,"total_tokens":19584},"model_context_window":258400}}}` + "\n"
	turnCompleted = `{"timestamp":"2026-10-09T18:40:06.094Z","ordinal":57,"type":"event_msg","payload":{"type":"task_complete","turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","last_agent_message":"done","started_at":1791571137,"completed_at":1791571206,"duration_ms":68793}}` + "\n"
)

// threeSessions is a home with a session of each state, and a stale lock
// file; codexObservationLine is the record of it.
func threeSessions() []codexSession {
	return []codexSession{
		{thread: threadWorking, held: true, rollout: turnStarted + tokensCounted},
		{thread: threadIdle, held: true, rollout: turnStarted + tokensCounted + turnCompleted},
		{thread: threadUnknown, held: true},
		{thread: threadStale, rollout: turnStarted},
	}
}

func codexObservationLine(source, observedAt string) string {
	return `{"source":"` + source + `","observedAt":"` + observedAt + `","agents":[` +
		`{"id":"` + threadWorking + `","state":"working"},{"id":"` + threadIdle + `","state":"idle"},{"id":"` + threadUnknown + `","state":"unknown"}]}` + "\n"
}

// lockOf and rolloutOf are where the home keeps a thread's lock file and
// its rollout file.
func lockOf(thread string) string { return "thread-writer-locks/" + thread + ".lock" }

func rolloutOf(thread string) string {
	return "sessions/2026/10/09/rollout-2026-10-09T21-38-57-" + thread + ".jsonl"
}

// files is the home, as the boundary.
func (h *codexHomeFake) files() codexFiles {
	return codexFiles{list: h.list, locked: h.locked, find: h.find, size: h.size, read: h.read}
}

// record keeps the operation, and returns the number of listings so far.
func (h *codexHomeFake) record(listing bool, format string, args ...any) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.operations = append(h.operations, fmt.Sprintf(format, args...))
	if listing {
		h.listings++
	}
	return h.listings
}

// asked lists every operation so far, in order.
func (h *codexHomeFake) asked() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return slices.Clone(h.operations)
}

// gone is the error of what the home does not have.
func gone(op, path string) error {
	return &fs.PathError{Op: op, Path: path, Err: fs.ErrNotExist}
}

func (h *codexHomeFake) list(ctx context.Context, dir string) ([]string, error) {
	call := h.record(true, "list %s", dir)
	if h.answer != nil {
		if err := h.answer(ctx, call); err != nil {
			return nil, err
		}
	}
	if dir != "thread-writer-locks" {
		return nil, gone("open", dir)
	}
	names := []string{".coordination.lock"}
	for _, session := range h.sessions {
		names = append(names, session.thread+".lock")
	}
	return names, nil
}

func (h *codexHomeFake) locked(_ context.Context, file string) (bool, error) {
	h.record(false, "locked %s", file)
	for _, session := range h.sessions {
		if file == lockOf(session.thread) {
			return session.held, nil
		}
	}
	return false, gone("open", file)
}

func (h *codexHomeFake) find(_ context.Context, dir, prefix, suffix string) ([]string, error) {
	h.record(false, "find %s %s %s", dir, prefix, suffix)
	var found []string
	for _, session := range h.sessions {
		file := rolloutOf(session.thread)
		name := file[strings.LastIndex(file, "/")+1:]
		if session.rollout != "" && strings.HasPrefix(file, dir+"/") && strings.HasPrefix(name, prefix) && strings.HasSuffix(name, suffix) {
			found = append(found, file)
		}
	}
	return found, nil
}

// rollout is the session whose rollout file file is.
func (h *codexHomeFake) rollout(op, file string) (codexSession, error) {
	for _, session := range h.sessions {
		if session.rollout != "" && file == rolloutOf(session.thread) {
			return session, nil
		}
	}
	return codexSession{}, gone(op, file)
}

func (h *codexHomeFake) size(_ context.Context, file string) (int64, error) {
	h.record(false, "size %s", file)
	session, err := h.rollout("stat", file)
	return session.size(), err
}

func (h *codexHomeFake) read(_ context.Context, file string, offset, length int64) ([]byte, error) {
	h.record(false, "read %s %d %d", file, offset, length)
	session, err := h.rollout("open", file)
	if err != nil {
		return nil, err
	}
	return session.bytes(offset, length), nil
}

// endedListing is a listing that never ends by itself: it blocks until its
// context ends and fails with the context's cause.
func endedListing(ctx context.Context) error {
	<-ctx.Done()
	return context.Cause(ctx)
}

// heldListings is an answer that holds every listing until its context
// ends, and the channel that delivers as each begins.
func heldListings() (answer func(ctx context.Context, call int) error, began <-chan struct{}) {
	reached := make(chan struct{}, 1)
	return func(ctx context.Context, _ int) error {
		reached <- struct{}{}
		return endedListing(ctx)
	}, reached
}

// startCodexApplication is startApplication over the Codex home, too.
func startCodexApplication(t *testing.T, stdout, stderr *lines, execute executeFunc, home *codexHomeFake, clock *clocktest.Clock, args ...string) *application {
	t.Helper()
	return startObservedApplication(t, stdout, stderr, execute, home.files(), clock, nil, args...)
}

// A Codex source needs no command executor. Its first read happens at
// once and its observation is one JSONL line on stdout: the contract's
// fields, the source ID given, the clock's time in UTC, and one agent for
// each thread whose lock is held, with its thread ID and the state of its
// last turn marker. The source then waits 5 seconds, and reads again only
// once that timer fired.
func TestACodexSourceIsReadAtOnceAndAgainAfterItsWait(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	home := &codexHomeFake{sessions: threeSessions()}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-codex", "codex-main")

	if got, want := stdout.next(), codexObservationLine("codex-main", "2026-10-09T08:28:10Z"); got != want {
		t.Errorf("got the first record\n%swant\n%s", got, want)
	}
	// The read's deadline, then the wait after the attempt: both 5 seconds.
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	working, idle := turnStarted+tokensCounted, turnStarted+tokensCounted+turnCompleted
	read := []string{
		"list thread-writer-locks",
		"locked " + lockOf(threadWorking),
		"find sessions rollout- -" + threadWorking + ".jsonl",
		"size " + rolloutOf(threadWorking),
		fmt.Sprintf("read %s 0 %d", rolloutOf(threadWorking), len(working)),
		"locked " + lockOf(threadIdle),
		"find sessions rollout- -" + threadIdle + ".jsonl",
		"size " + rolloutOf(threadIdle),
		fmt.Sprintf("read %s 0 %d", rolloutOf(threadIdle), len(idle)),
		"locked " + lockOf(threadUnknown),
		"find sessions rollout- -" + threadUnknown + ".jsonl",
		"locked " + lockOf(threadStale),
	}
	if got := home.asked(); !slices.Equal(got, read) {
		t.Errorf("while the source waits, got the file operations\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(read, "\n"))
	}

	clock.Advance(5 * time.Second)

	if got, want := stdout.next(), codexObservationLine("codex-main", "2026-10-09T08:28:15Z"); got != want {
		t.Errorf("got the second record\n%swant\n%s", got, want)
	}
	if got, want := home.asked(), slices.Concat(read, read); !slices.Equal(got, want) {
		t.Errorf("got the file operations\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
	assertNoLines(t, "stderr", stderr)
}

// A turn marker further from the end of its rollout file than one chunk of
// the production scan is found, through the scan as wireCodexSource sets
// it: the session is published with the marker's state, and the file was
// read from its end backwards, a production chunk first and then the rest,
// where the marker is.
func TestACodexSessionIsPublishedWithTheStateOfAMarkerBeyondTheFirstChunk(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	// More than a chunk of events after the marker, none of them a marker.
	content := turnStarted + strings.Repeat(tokensCounted, codexScanChunk/len(tokensCounted)+1)
	home := &codexHomeFake{sessions: []codexSession{{thread: threadWorking, held: true, rollout: content}}}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-codex", "codex-main")

	want := `{"source":"codex-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"` + threadWorking + `","state":"working"}]}` + "\n"
	if got := stdout.next(); got != want {
		t.Errorf("got the record\n%swant\n%s", got, want)
	}
	// The read's deadline, then the wait after the attempt.
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	rest := int64(len(content)) - codexScanChunk
	read := []string{
		"list thread-writer-locks",
		"locked " + lockOf(threadWorking),
		"find sessions rollout- -" + threadWorking + ".jsonl",
		"size " + rolloutOf(threadWorking),
		fmt.Sprintf("read %s %d %d", rolloutOf(threadWorking), rest, codexScanChunk),
		fmt.Sprintf("read %s 0 %d", rolloutOf(threadWorking), rest),
	}
	if got := home.asked(); !slices.Equal(got, read) {
		t.Errorf("got the file operations\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(read, "\n"))
	}
	assertNoLines(t, "stderr", stderr)
}

// scanReads is the reads of a production scan of file from its byte end
// backwards to its byte begin, in order: a production chunk each, and what
// is left in the last.
func scanReads(file string, end, begin int64) []string {
	var reads []string
	for end > begin {
		length := min(codexScanChunk, end-begin)
		reads = append(reads, fmt.Sprintf("read %s %d %d", file, end-length, length))
		end -= length
	}
	return reads
}

// The production scan cap, as wireCodexSource sets it, bounds the search
// for a turn marker. A marker at the beginning of a rollout file as long
// as the cap allows, the cap's length from the file's end, is found: the
// session is published with its state, and the file was read to its
// beginning. With one event more, the marker's line begins before the
// cap: the scan stops at the cap, having read that many bytes and none
// before them, and the session is published as unknown.
func TestTheProductionScanCapBoundsTheSearchForATurnMarker(t *testing.T) {
	t.Parallel()
	// As many events after the marker as leave the file within the cap.
	within := (codexScanCap - len(turnStarted)) / len(tokensCounted)
	tests := []struct {
		name   string
		events int
		// capped is whether the cap ends the scan before the file's
		// beginning.
		capped bool
		state  string
	}{
		{"a file as long as the cap allows", within, false, "working"},
		{"a file one event longer", within + 1, true, "unknown"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(morning())
			stdout, stderr := newLines(), newLines()
			session := codexSession{thread: threadWorking, held: true, rollout: turnStarted, events: test.events}
			home := &codexHomeFake{sessions: []codexSession{session}}
			startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-codex", "codex-main")

			want := `{"source":"codex-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"` + threadWorking + `","state":"` + test.state + `"}]}` + "\n"
			if got := stdout.next(); got != want {
				t.Errorf("got the record\n%swant\n%s", got, want)
			}
			// The read's deadline, then the wait after the attempt.
			clock.Started(5 * time.Second)
			clock.Started(5 * time.Second)
			size, begin := session.size(), int64(0)
			if test.capped {
				begin = size - codexScanCap
			}
			read := slices.Concat([]string{
				"list thread-writer-locks",
				"locked " + lockOf(threadWorking),
				"find sessions rollout- -" + threadWorking + ".jsonl",
				"size " + rolloutOf(threadWorking),
			}, scanReads(rolloutOf(threadWorking), size, begin))
			if got := home.asked(); !slices.Equal(got, read) {
				t.Errorf("got the file operations\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(read, "\n"))
			}
			assertNoLines(t, "stderr", stderr)
		})
	}
}

// A home with no session, as one where Codex never ran is, is observed as
// no agents: an empty set on stdout, and no diagnostic.
func TestACodexHomeWithNoSessionIsObservedAsNoAgents(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	home := &codexHomeFake{answer: func(context.Context, int) error { return gone("open", "thread-writer-locks") }}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-codex", "codex-main")

	if got, want := stdout.next(), `{"source":"codex-main","observedAt":"2026-10-09T08:28:10Z","agents":[]}`+"\n"; got != want {
		t.Errorf("got the record\n%swant\n%s", got, want)
	}
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	assertNoLines(t, "stderr", stderr)
}

// A Claude Code source and a Codex source run together, each publishing
// under its own ID on the one stdout, and neither blocks the other: while
// the read of one runtime is held, until its context ends, the other's
// observation is published.
func TestAHeldReadOfOneRuntimeDoesNotKeepTheOtherFromPublishing(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		// holdClaude is whether the Claude Code read is the one held; the
		// Codex read is, otherwise.
		holdClaude bool
		want       string
	}{
		{"the Claude Code read is held", true, codexObservationLine("codex-main", "2026-10-09T08:28:10Z")},
		{"the Codex read is held", false, observationLine("claude-main", "2026-10-09T08:28:10Z")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(morning())
			stdout, stderr := newLines(), newLines()
			held := make(chan struct{})
			executor := &executorSpy{answer: func(ctx context.Context, call int) ([]byte, error) {
				if test.holdClaude && call == 1 {
					close(held)
					return untilEnded(ctx)
				}
				return []byte(sessions), nil
			}}
			home := &codexHomeFake{sessions: threeSessions(), answer: func(ctx context.Context, call int) error {
				if !test.holdClaude && call == 1 {
					close(held)
					return endedListing(ctx)
				}
				return nil
			}}
			startCodexApplication(t, stdout, stderr, executor.execute, home, clock, "warder", "-claude", "claude-main", "-codex", "codex-main")

			<-held
			if got := stdout.next(); got != test.want {
				t.Errorf("while the other runtime's read is held, got the record\n%swant\n%s", got, test.want)
			}
			// Each source's deadline, then the wait of the one that
			// published: the held read is still in progress.
			clock.Started(5 * time.Second)
			clock.Started(5 * time.Second)
			clock.Started(5 * time.Second)
			if got := stdout.all(); len(got) != 1 {
				t.Errorf("got %d records, want 1:\n%s", len(got), strings.Join(got, ""))
			}
			assertNoLines(t, "stderr", stderr)
		})
	}
}

// Both runtimes read and publish in one run: the two records arrive, each
// under its own ID and with its own runtime's agents.
func TestAClaudeAndACodexSourcePublishEachUnderItsOwnID(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	executor := &executorSpy{answer: answerSessions}
	home := &codexHomeFake{sessions: threeSessions()}
	startCodexApplication(t, stdout, stderr, executor.execute, home, clock, "warder", "-codex", "codex-main", "-claude", "claude-main")

	got := []string{stdout.next(), stdout.next()}
	slices.Sort(got)
	want := []string{
		observationLine("claude-main", "2026-10-09T08:28:10Z"),
		codexObservationLine("codex-main", "2026-10-09T08:28:10Z"),
	}
	if !slices.Equal(got, want) {
		t.Errorf("got the records\n%swant\n%s", strings.Join(got, ""), strings.Join(want, ""))
	}
	assertNoLines(t, "stderr", stderr)
}

// Two Codex sources both read the home and publish, each under its own ID,
// on the one stdout: each -codex flag is a source of its own, with the
// complete set of the home's sessions in its record.
func TestTwoCodexSourcesPublishEachUnderItsOwnID(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	home := &codexHomeFake{sessions: threeSessions()}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-codex", "codex-main", "-codex", "codex-side")

	got := []string{stdout.next(), stdout.next()}
	slices.Sort(got)
	want := []string{
		codexObservationLine("codex-main", "2026-10-09T08:28:10Z"),
		codexObservationLine("codex-side", "2026-10-09T08:28:10Z"),
	}
	if !slices.Equal(got, want) {
		t.Errorf("got the records\n%swant\n%s", strings.Join(got, ""), strings.Join(want, ""))
	}
	// Each source's deadline, then each source's wait after its attempt.
	for range 4 {
		clock.Started(5 * time.Second)
	}
	if got := stdout.all(); len(got) != 2 {
		t.Errorf("while both sources wait, got %d records, want 2:\n%s", len(got), strings.Join(got, ""))
	}
	assertNoLines(t, "stderr", stderr)
}

// A Codex read that fails gives no line on stdout and one on stderr, which
// names its source and what failed; the next attempt follows after the
// wait.
func TestAFailedCodexReadIsReportedAndTheNextAttemptFollows(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	home := &codexHomeFake{sessions: threeSessions(), answer: func(_ context.Context, call int) error {
		if call == 1 {
			return errors.New("open thread-writer-locks: permission denied")
		}
		return nil
	}}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-codex", "codex-main")

	want := "warder: codex-main: attempt: read failed: capture: read agents: codex: list thread-writer-locks: open thread-writer-locks: permission denied\n"
	if got := stderr.next(); got != want {
		t.Errorf("got the diagnostic\n%swant\n%s", got, want)
	}
	// The read's deadline, then the wait after the attempt.
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	assertNoLines(t, "stdout", stdout)

	clock.Advance(5 * time.Second)

	if got, want := stdout.next(), codexObservationLine("codex-main", "2026-10-09T08:28:15Z"); got != want {
		t.Errorf("got the record of the next attempt\n%swant\n%s", got, want)
	}
	if got := stderr.all(); len(got) != 1 {
		t.Errorf("got %d lines on stderr, want 1:\n%s", len(got), strings.Join(got, ""))
	}
}

// A Codex read that blocks until its context ends is ended by the 5-second
// deadline, and the read is reported on stderr as one that timed out.
func TestABlockedCodexReadIsEndedByItsDeadlineAndReportedAsATimeout(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	held, began := heldListings()
	home := &codexHomeFake{sessions: threeSessions(), answer: held}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-codex", "codex-main")

	// The read is in progress, under its deadline.
	<-began
	clock.Started(5 * time.Second)
	assertNoLines(t, "stderr", stderr)

	clock.Advance(5 * time.Second)

	want := "warder: codex-main: attempt: read timed out: capture: read agents: codex: list thread-writer-locks: context deadline exceeded\n"
	if got := stderr.next(); got != want {
		t.Errorf("got the diagnostic\n%swant\n%s", got, want)
	}
	// The wait after the attempt: the attempt has returned.
	clock.Started(5 * time.Second)
	assertNoLines(t, "stdout", stdout)
}

// With -verbose, each step of a Codex source's attempt is one slog text
// record on stderr, at Debug, with the source ID, its outcome and its
// duration on the clock: each operation on the files of the Codex home,
// with its path, then the read, the capture, the publish, the deadline
// once released, and the wait once it ended. stdout carries the same
// records as without -verbose.
func TestVerboseRecordsEachStepOfACodexSourceOnStderr(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	content := turnStarted + tokensCounted
	home := &codexHomeFake{sessions: []codexSession{{thread: threadWorking, held: true, rollout: content}}}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-verbose", "-codex", "codex-main")

	record := `{"source":"codex-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"` + threadWorking + `","state":"working"}]}` + "\n"
	if got := stdout.next(); got != record {
		t.Errorf("got the first record\n%swant\n%s", got, record)
	}
	first := "time=2026-10-09T11:28:10.000+03:00 level=DEBUG "
	for _, want := range []string{
		first + `msg="list directory" source=codex-main path=thread-writer-locks outcome=ok duration=0s` + "\n",
		first + `msg="probe lock" source=codex-main path=` + lockOf(threadWorking) + " outcome=ok duration=0s\n",
		first + `msg="find files" source=codex-main path=sessions prefix=rollout- suffix=-` + threadWorking + ".jsonl outcome=ok duration=0s\n",
		first + `msg="file size" source=codex-main path=` + rolloutOf(threadWorking) + " outcome=ok duration=0s\n",
		first + `msg="read file" source=codex-main path=` + rolloutOf(threadWorking) + fmt.Sprintf(" offset=0 length=%d outcome=ok duration=0s\n", len(content)),
		first + `msg="read agents" source=codex-main outcome=ok duration=0s` + "\n",
		first + "msg=capture source=codex-main outcome=ok duration=0s\n",
		first + "msg=publish source=codex-main outcome=ok duration=0s\n",
		first + "msg=deadline source=codex-main limit=5s expired=false outcome=ok duration=0s\n",
	} {
		if got := stderr.next(); got != want {
			t.Errorf("got on stderr\n%swant\n%s", got, want)
		}
	}
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)

	clock.Advance(5 * time.Second)

	if got, want := stderr.next(), "time=2026-10-09T11:28:15.000+03:00 level=DEBUG msg=wait source=codex-main interval=5s outcome=ok duration=5s\n"; got != want {
		t.Errorf("got on stderr\n%swant\n%s", got, want)
	}
	record = strings.Replace(record, "08:28:10Z", "08:28:15Z", 1)
	if got := stdout.next(); got != record {
		t.Errorf("got the second record\n%swant\n%s", got, record)
	}
}

// With -verbose, a Codex read that its deadline ended is recorded with its
// errors, from the file operation on, and the deadline as expired, beside
// its diagnostic.
func TestVerboseRecordsATimedOutCodexReadBesideItsDiagnostic(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	held, began := heldListings()
	home := &codexHomeFake{sessions: threeSessions(), answer: held}
	startCodexApplication(t, stdout, stderr, nil, home, clock, "warder", "-verbose", "-codex", "codex-main")
	// The read is in progress, under its deadline: each step that is
	// recorded has begun.
	<-began
	clock.Started(5 * time.Second)

	clock.Advance(5 * time.Second)

	at := "time=2026-10-09T11:28:15.000+03:00 level=DEBUG "
	failure := "codex: list thread-writer-locks: context deadline exceeded"
	for _, want := range []string{
		at + `msg="list directory" source=codex-main path=thread-writer-locks outcome=error error="context deadline exceeded" duration=5s` + "\n",
		at + `msg="read agents" source=codex-main outcome=error error="` + failure + `" duration=5s` + "\n",
		at + `msg=capture source=codex-main outcome=error error="capture: read agents: ` + failure + `" duration=5s` + "\n",
		"warder: codex-main: attempt: read timed out: capture: read agents: " + failure + "\n",
		at + "msg=deadline source=codex-main limit=5s expired=true outcome=ok duration=5s\n",
	} {
		if got := stderr.next(); got != want {
			t.Errorf("got on stderr\n%swant\n%s", got, want)
		}
	}
	// The wait after the attempt: the attempt has returned.
	clock.Started(5 * time.Second)
	assertNoLines(t, "stdout", stdout)
}

// A Codex source that cannot be wired, as one with no files to read is,
// ends the run with exit code 1 and a message on stderr, and starts
// nothing.
func TestACodexSourceThatCannotBeWiredExitsWithCode1(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()

	code := run(t.Context(), []string{"warder", "-codex", "codex-main"}, stdout, stderr, nil, codexFiles{}, clock.Now, clock.Timer, nil)

	if code != 1 {
		t.Errorf("got the exit code %d, want 1", code)
	}
	if got, want := strings.Join(stderr.all(), ""), "warder: source \"codex-main\": codex: no files\n"; got != want {
		t.Errorf("got on stderr %q, want %q", got, want)
	}
	assertNoLines(t, "stdout", stdout)
	if got := clock.Waits(); len(got) != 0 {
		t.Errorf("got timers of %v, want none", got)
	}
}
