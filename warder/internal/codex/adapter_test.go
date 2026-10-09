package codex_test

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/warder/internal/codex"
)

// homeFake is a Codex home in memory, as the adapter's files: it records
// every call with its context and answers each from what the test set. It
// does not look at the context, so a read that stops when its context ends
// was stopped by the adapter. It fills in nothing else.
type homeFake struct {
	// locks are the entries of thread-writer-locks, in the order listed.
	locks []lockFile
	// listErr fails the listing.
	listErr error
	// rollouts are the files under sessions: each one's content by its
	// path.
	rollouts map[string]string
	// findErr, sizeErr and readErr fail every Find, Size and Read.
	findErr, sizeErr, readErr error
	// short makes every Read return one byte fewer than asked for.
	short bool
	// before, when set, is called as each call begins, with what it asks.
	before func(asked string)

	calls []call
}

// lockFile is one entry of thread-writer-locks: its name, whether another
// process holds it, and an error that fails its probe.
type lockFile struct {
	name string
	held bool
	err  error
}

// call is one call of the files: what it asked, as "<method> <arguments>",
// and under which context.
type call struct {
	ctx   context.Context
	asked string
}

func (h *homeFake) record(ctx context.Context, format string, args ...any) {
	asked := fmt.Sprintf(format, args...)
	h.calls = append(h.calls, call{ctx: ctx, asked: asked})
	if h.before != nil {
		h.before(asked)
	}
}

func (h *homeFake) List(ctx context.Context, dir string) ([]string, error) {
	h.record(ctx, "list %s", dir)
	if h.listErr != nil {
		return nil, h.listErr
	}
	if dir != "thread-writer-locks" {
		return nil, fs.ErrNotExist
	}
	names := make([]string, 0, len(h.locks))
	for _, lock := range h.locks {
		names = append(names, lock.name)
	}
	return names, nil
}

func (h *homeFake) Locked(ctx context.Context, file string) (bool, error) {
	h.record(ctx, "locked %s", file)
	for _, lock := range h.locks {
		if file == "thread-writer-locks/"+lock.name {
			return lock.held, lock.err
		}
	}
	return false, fs.ErrNotExist
}

func (h *homeFake) Find(ctx context.Context, dir, prefix, suffix string) ([]string, error) {
	h.record(ctx, "find %s %s %s", dir, prefix, suffix)
	if h.findErr != nil {
		return nil, h.findErr
	}
	var found []string
	for file := range h.rollouts {
		name := path.Base(file)
		if strings.HasPrefix(file, dir+"/") && strings.HasPrefix(name, prefix) && strings.HasSuffix(name, suffix) {
			found = append(found, file)
		}
	}
	slices.Sort(found)
	return found, nil
}

func (h *homeFake) Size(ctx context.Context, file string) (int64, error) {
	h.record(ctx, "size %s", file)
	if h.sizeErr != nil {
		return 0, h.sizeErr
	}
	content, ok := h.rollouts[file]
	if !ok {
		return 0, fs.ErrNotExist
	}
	return int64(len(content)), nil
}

func (h *homeFake) Read(ctx context.Context, file string, offset, length int64) ([]byte, error) {
	h.record(ctx, "read %s %d %d", file, offset, length)
	if h.readErr != nil {
		return nil, h.readErr
	}
	content, ok := h.rollouts[file]
	if !ok {
		return nil, fs.ErrNotExist
	}
	end := min(offset+length, int64(len(content)))
	if h.short {
		end--
	}
	return []byte(content[offset:end]), nil
}

// asked lists what every call so far asked, in order.
func (h *homeFake) asked() []string {
	asked := make([]string, 0, len(h.calls))
	for _, call := range h.calls {
		asked = append(asked, call.asked)
	}
	return asked
}

// reads lists the length every Read so far asked for, in order.
func (h *homeFake) reads() []int64 {
	var lengths []int64
	for _, call := range h.calls {
		var file string
		var offset, length int64
		if n, _ := fmt.Sscanf(call.asked, "read %s %d %d", &file, &offset, &length); n == 3 {
			lengths = append(lengths, length)
		}
	}
	return lengths
}

// roomy is a scan whose bounds no rollout file of the tests that use it
// reaches: each is read whole, in one chunk.
func roomy() codex.Scan { return codex.Scan{Chunk: 4096, Cap: 1 << 20} }

func newAdapter(t *testing.T, files codex.Files, scan codex.Scan) *codex.Adapter {
	t.Helper()
	adapter, err := codex.New(files, scan)
	if err != nil {
		t.Fatal(err)
	}
	return adapter
}

// The thread IDs of these tests, and where each one's rollout file is: as
// codex-cli 0.162.0 named them (2026-10-09).
const (
	threadA = "01a11494-690a-71f3-9de2-9c82b2166f25"
	threadB = "01a119b1-2d6f-7c70-990a-ad4a1a461c97"
	threadC = "01a119b1-a9a7-7ff3-bdb9-f07221962467"
	threadD = "01a11ada-be18-71c1-b0de-2007f2844855"
	threadE = "01a121f6-1271-7293-871d-b887f0645f03"
)

func rolloutOf(thread string) string {
	return "sessions/2026/10/09/rollout-2026-10-09T21-38-57-" + thread + ".jsonl"
}

// The rollout lines of these tests, as codex-cli 0.162.0 wrote them
// (2026-10-09), their long values cut: a session's first record, the three
// turn markers, and other records, three of them events.
const (
	sessionMeta     = `{"timestamp":"2026-10-09T18:38:57.331Z","ordinal":0,"type":"session_meta","payload":{"session_id":"01a121f6-1271-7293-871d-b887f0645f03","id":"01a121f6-1271-7293-871d-b887f0645f03","timestamp":"2026-10-09T18:38:57.167Z","cwd":"/x","originator":"codex_exec","cli_version":"0.162.0","source":"exec","thread_source":"user","model_provider":"openai"}}`
	taskStarted     = `{"timestamp":"2026-10-09T18:38:57.331Z","ordinal":1,"type":"event_msg","payload":{"type":"task_started","turn_attribution":{"turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","turn_trigger":"exec","parent_turn_id":null,"initiating_agent_path":null,"root_turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba"},"turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","root_turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","started_at":1791571137,"model_context_window":258400,"collaboration_mode_kind":"default"}}`
	taskComplete    = `{"timestamp":"2026-10-09T18:40:06.094Z","ordinal":57,"type":"event_msg","payload":{"type":"task_complete","root_turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","last_agent_message":"{\n  \"verdict\": \"approve\"\n}","started_at":1791571137,"completed_at":1791571206,"duration_ms":68793,"time_to_first_token_ms":5918}}`
	turnAborted     = `{"timestamp":"2026-10-04T09:08:17.246Z","ordinal":186,"type":"event_msg","payload":{"type":"turn_aborted","turn_id":"01a1062b-468e-7ca3-a025-1ef2c2386c06","reason":"interrupted","started_at":1791104861,"completed_at":1791104897,"duration_ms":35383}}`
	itemCompleted   = `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","payload":{"type":"item_completed","thread_id":"01a121f6-1271-7293-871d-b887f0645f03","turn_id":"01a121f6-1314-7321-990c-db6c9f0391ba","item":{"type":"UserMessage","id":"01a121f6-20b4-7f62-94e2-117cd52bdb48","content":[{"type":"text","text":"Review the candidate.","text_elements":[]}]},"started_at_ms":1791571140789,"completed_at_ms":1791571140789}}`
	tokenCount      = `{"timestamp":"2026-10-09T18:39:07.769Z","ordinal":18,"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":19362,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":222,"reasoning_output_tokens":0,"total_tokens":19584},"model_context_window":258400}}}`
	settingsApplied = `{"timestamp":"2026-10-09T12:57:59.282Z","ordinal":127,"type":"event_msg","payload":{"type":"thread_settings_applied","thread_id":"01a120b2-6ef5-7463-b8af-7ecd28cf14b4","thread_settings":{"model":"gpt-6.1-sol","model_provider_id":"openai","service_tier":"default","approval_policy":"never"}}}`
	responseItem    = `{"timestamp":"2026-10-09T18:39:07.635Z","ordinal":12,"type":"response_item","payload":{"type":"custom_tool_call","id":"ctc_00157d947b370e79016ac934c8a99081918f1beee4d2c29e37","status":"completed","call_id":"call_cba03b3d65684ea5870220bca1de1c66","name":"exec","input":"ls"}}`
)

// rollout is a rollout file of the lines, each terminated.
func rollout(lines ...string) string {
	return strings.Join(lines, "\n") + "\n"
}

// longLine is a response item of at least size bytes, as a tool call with
// a long input is one.
func longLine(size int) string {
	return `{"timestamp":"2026-10-09T18:39:07.635Z","ordinal":12,"type":"response_item","payload":{"type":"custom_tool_call","name":"exec","input":"` + strings.Repeat("x", size) + `"}}`
}

// oneSession is a home with one active session, threadE, whose rollout
// file has the content.
func oneSession(content string) *homeFake {
	return &homeFake{
		locks:    []lockFile{{name: threadE + ".lock", held: true}},
		rollouts: map[string]string{rolloutOf(threadE): content},
	}
}

// assertState fails unless the read of home, within scan, gives its one
// session, threadE, the state want. The state is the contract's literal
// value, not the package's constant, so a constant whose value changes
// fails here.
func assertState(t *testing.T, home *homeFake, scan codex.Scan, want codex.State) {
	t.Helper()
	agents, err := newAdapter(t, home, scan).ReadAgents(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if want := []codex.Agent{{ID: threadE, State: want}}; !slices.Equal(agents, want) {
		t.Errorf("got the agents %v, want %v", agents, want)
	}
}

// assertNoRead fails unless the read failed, with an error that says why
// and no agents.
func assertNoRead(t *testing.T, agents []codex.Agent, err error, why string) {
	t.Helper()
	if err == nil {
		t.Fatalf("ReadAgents returned no error, and the agents %v", agents)
	}
	if !strings.Contains(err.Error(), why) {
		t.Errorf("got the error %q, want one that says %q", err, why)
	}
	if agents != nil {
		t.Errorf("ReadAgents returned the agents %v with its error", agents)
	}
}

// filesMap is files of a kind whose nil is a typed nil.
type filesMap map[string]string

func (filesMap) List(context.Context, string) ([]string, error)                 { return nil, nil }
func (filesMap) Locked(context.Context, string) (bool, error)                   { return false, nil }
func (filesMap) Find(context.Context, string, string, string) ([]string, error) { return nil, nil }
func (filesMap) Size(context.Context, string) (int64, error)                    { return 0, nil }
func (filesMap) Read(context.Context, string, int64, int64) ([]byte, error)     { return nil, nil }

// Missing files, nil or a typed nil carried by Files, fail at
// construction.
func TestNewRejectsMissingFiles(t *testing.T) {
	t.Parallel()
	for name, files := range map[string]codex.Files{
		"nil":         nil,
		"nil pointer": (*homeFake)(nil),
		"nil map":     filesMap(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			adapter, err := codex.New(files, roomy())
			if err == nil || !strings.Contains(err.Error(), "no files") {
				t.Errorf("got the error %v, want one that says no files", err)
			}
			if adapter != nil {
				t.Errorf("New returned an adapter: %v", adapter)
			}
		})
	}
}

// A scan whose chunk or cap is not positive fails at construction, with an
// error that says which.
func TestNewRejectsAScanWithoutABound(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		scan codex.Scan
		says string
	}{
		"no chunk":         {codex.Scan{Chunk: 0, Cap: 1024}, "scan chunk of 0 bytes"},
		"a negative chunk": {codex.Scan{Chunk: -1, Cap: 1024}, "scan chunk of -1 bytes"},
		"no cap":           {codex.Scan{Chunk: 1024, Cap: 0}, "scan cap of 0 bytes"},
		"a negative cap":   {codex.Scan{Chunk: 1024, Cap: -1}, "scan cap of -1 bytes"},
		"neither":          {codex.Scan{}, "scan chunk of 0 bytes"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			adapter, err := codex.New(&homeFake{}, test.scan)
			if err == nil || !strings.Contains(err.Error(), test.says) {
				t.Errorf("got the error %v, want one that says %q", err, test.says)
			}
			if adapter != nil {
				t.Errorf("New returned an adapter: %v", adapter)
			}
		})
	}
}

// Each lock file another process holds is one agent, with its thread ID as
// its ID and the state its rollout file gives it, in the order listed. A
// stale lock file, one that is gone before it is probed, .coordination.lock
// and a name that is no lock file are no agent, and of these only the
// thread locks are probed.
func TestReadAgentsReturnsTheThreadsWhoseLocksAreHeld(t *testing.T) {
	t.Parallel()
	home := &homeFake{
		locks: []lockFile{
			{name: ".coordination.lock", held: true},
			{name: threadA + ".lock", held: true},
			{name: threadB + ".lock", held: false},
			{name: threadC + ".lock", held: true},
			{name: threadD + ".lock", err: &fs.PathError{Op: "open", Path: threadD + ".lock", Err: fs.ErrNotExist}},
			{name: threadE + ".lock", held: true},
			{name: threadE + ".lock.tmp", held: true},
			{name: "notes", held: true},
		},
		rollouts: map[string]string{
			rolloutOf(threadA): rollout(sessionMeta, taskStarted, itemCompleted, responseItem, tokenCount),
			rolloutOf(threadB): rollout(sessionMeta, taskStarted),
			rolloutOf(threadC): rollout(sessionMeta, taskStarted, itemCompleted, tokenCount, taskComplete),
			rolloutOf(threadD): rollout(sessionMeta, taskStarted),
		},
	}

	agents, err := newAdapter(t, home, roomy()).ReadAgents(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	want := []codex.Agent{
		{ID: threadA, State: "working"},
		{ID: threadC, State: "idle"},
		{ID: threadE, State: "unknown"},
	}
	if !slices.Equal(agents, want) {
		t.Errorf("got the agents %v, want %v", agents, want)
	}
	var probed []string
	for _, asked := range home.asked() {
		if file, ok := strings.CutPrefix(asked, "locked "); ok {
			probed = append(probed, file)
		}
	}
	wantProbed := []string{
		"thread-writer-locks/" + threadA + ".lock",
		"thread-writer-locks/" + threadB + ".lock",
		"thread-writer-locks/" + threadC + ".lock",
		"thread-writer-locks/" + threadD + ".lock",
		"thread-writer-locks/" + threadE + ".lock",
	}
	if !slices.Equal(probed, wantProbed) {
		t.Errorf("probed %q, want %q", probed, wantProbed)
	}
}

// A read lists thread-writer-locks, probes the session's lock, finds its
// rollout file under sessions by the thread ID and reads it from its end,
// every call under the context the read was given.
func TestReadAgentsReadsTheHomeUnderItsContext(t *testing.T) {
	t.Parallel()
	content := rollout(sessionMeta, taskStarted)
	home := oneSession(content)
	type readKey struct{}
	ctx := context.WithValue(t.Context(), readKey{}, "this read")

	if _, err := newAdapter(t, home, roomy()).ReadAgents(ctx); err != nil {
		t.Fatal(err)
	}

	want := []string{
		"list thread-writer-locks",
		"locked thread-writer-locks/" + threadE + ".lock",
		"find sessions rollout- -" + threadE + ".jsonl",
		"size " + rolloutOf(threadE),
		fmt.Sprintf("read %s 0 %d", rolloutOf(threadE), len(content)),
	}
	if got := home.asked(); !slices.Equal(got, want) {
		t.Errorf("got the calls\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
	for _, call := range home.calls {
		if call.ctx != ctx {
			t.Errorf("%q was called under the context %v, want the read's %v", call.asked, call.ctx, ctx)
		}
	}
}

// The last turn marker of the rollout file decides the state: task_started
// is working, task_complete and turn_aborted are idle, whatever follows
// that is no marker. A file with no marker is unknown, and an unterminated
// last line is being written: it is not read, whatever it says.
func TestReadAgentsTakesTheStateOfTheLastTurnMarker(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		content string
		want    codex.State
	}{
		"task_started":                             {rollout(sessionMeta, taskStarted), "working"},
		"task_started, then other records":         {rollout(sessionMeta, taskStarted, itemCompleted, responseItem, tokenCount), "working"},
		"task_complete":                            {rollout(sessionMeta, taskStarted, tokenCount, taskComplete), "idle"},
		"task_complete, then settings applied":     {rollout(sessionMeta, taskStarted, taskComplete, settingsApplied, tokenCount), "idle"},
		"turn_aborted":                             {rollout(sessionMeta, taskStarted, itemCompleted, turnAborted), "idle"},
		"task_started after task_complete":         {rollout(sessionMeta, taskStarted, taskComplete, taskStarted, itemCompleted), "working"},
		"task_started after turn_aborted":          {rollout(sessionMeta, taskStarted, turnAborted, taskStarted), "working"},
		"task_complete after turn_aborted":         {rollout(taskStarted, turnAborted, taskStarted, taskComplete), "idle"},
		"turn_aborted after task_complete":         {rollout(taskStarted, taskComplete, taskStarted, turnAborted), "idle"},
		"a marker as the only line":                {rollout(taskStarted), "working"},
		"no marker":                                {rollout(sessionMeta, itemCompleted, responseItem, tokenCount, settingsApplied), "unknown"},
		"an empty file":                            {"", "unknown"},
		"only line breaks":                         {"\n\n", "unknown"},
		"an unterminated task_complete":            {rollout(sessionMeta, taskStarted) + taskComplete, "working"},
		"an unterminated task_started":             {rollout(sessionMeta, taskStarted, taskComplete) + taskStarted, "idle"},
		"an unterminated marker as the only line":  {taskStarted, "unknown"},
		"an unterminated line after no marker":     {rollout(sessionMeta) + taskStarted[:40], "unknown"},
		"an empty line between the lines":          {rollout(sessionMeta, taskStarted, "", tokenCount, ""), "working"},
		"lines that end with a carriage return":    {rollout(sessionMeta+"\r", taskComplete+"\r", tokenCount+"\r"), "idle"},
		"a marker after a line longer than itself": {rollout(longLine(3000), taskStarted, longLine(3000)), "working"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			assertState(t, oneSession(test.content), roomy(), test.want)
		})
	}
}

// Only an event_msg whose payload's type is a turn marker is one. A line
// that names a marker elsewhere, another type of record with such a
// payload, and a line that is not such a JSON object are passed over: the
// marker before them decides.
func TestReadAgentsPassesOverALineThatIsNoTurnMarker(t *testing.T) {
	t.Parallel()
	for name, line := range map[string]string{
		"an event that quotes a marker":            `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","payload":{"type":"item_completed","item":{"type":"AgentMessage","text":"task_started"}}}`,
		"an event with a marker under another key": `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","payload":{"kind":"task_started"}}`,
		"an event with the marker beside payload":  `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","event":{"type":"task_started"},"payload":{}}`,
		"another record with a marker's payload":   `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"response_item","payload":{"type":"task_started","name":"event_msg"}}`,
		"a record that quotes a whole marker line": `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"response_item","payload":{"type":"custom_tool_call_output","output":"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\"}}"}}`,
		"a marker in another case":                 `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","payload":{"type":"Task_Started","note":"task_started"}}`,
		"a payload that is a string":               `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","payload":"task_started"}`,
		"a payload type that is not a string":      `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","payload":{"type":["task_started"]}}`,
		"a type that is not a string":              `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":["event_msg"],"payload":{"type":"task_started"}}`,
		"an array":                                 `["event_msg","task_started"]`,
		"a line cut short":                         `{"timestamp":"2026-10-09T18:39:00.789Z","ordinal":9,"type":"event_msg","payload":{"type":"task_started"`,
		"text":                                     `"event_msg" "task_started"`,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			assertState(t, oneSession(rollout(sessionMeta, taskStarted, taskComplete, line, tokenCount)), roomy(), "idle")
		})
	}
}

// A marker many chunks before the end of the file is found: the file is
// read backwards, a chunk at a time, none longer than the scan's chunk.
func TestReadAgentsFindsAMarkerBeyondTheFirstChunk(t *testing.T) {
	t.Parallel()
	lines := []string{sessionMeta, taskStarted}
	for range 40 {
		lines = append(lines, itemCompleted, responseItem, tokenCount)
	}
	content := rollout(lines...)
	home := oneSession(content)
	scan := codex.Scan{Chunk: 512, Cap: 1 << 20}

	assertState(t, home, scan, "working")

	reads := home.reads()
	if len(reads) < 20 {
		t.Errorf("got %d reads of a file of %d bytes, want it read in chunks of 512", len(reads), len(content))
	}
	for _, length := range reads {
		if length > scan.Chunk {
			t.Errorf("got a read of %d bytes, want none longer than the chunk of %d", length, scan.Chunk)
		}
	}
}

// A line longer than a chunk is read whole, wherever it is: the marker
// itself, a line after the marker, and the file's first line, which no
// line break precedes.
func TestReadAgentsReadsALineThatSpansChunks(t *testing.T) {
	t.Parallel()
	longComplete := strings.Replace(taskComplete, `"last_agent_message":"`, `"last_agent_message":"`+strings.Repeat("a long answer ", 400), 1)
	for name, test := range map[string]struct {
		content string
		want    codex.State
	}{
		"the marker, last":                    {rollout(sessionMeta, taskStarted, longComplete), "idle"},
		"the marker, before other lines":      {rollout(sessionMeta, taskStarted, longComplete, tokenCount, settingsApplied), "idle"},
		"the marker, as the first line":       {rollout(longComplete, tokenCount), "idle"},
		"the marker, as the only line":        {rollout(longComplete), "idle"},
		"a line after the marker":             {rollout(sessionMeta, taskStarted, longLine(5000), tokenCount), "working"},
		"lines after the marker, in a row":    {rollout(taskStarted, longLine(5000), longLine(700), longLine(5000)), "working"},
		"a line before the marker":            {rollout(longLine(5000), taskStarted), "working"},
		"an unterminated line after it":       {rollout(sessionMeta, taskStarted) + longLine(5000), "working"},
		"an unterminated marker after others": {rollout(sessionMeta, taskStarted, tokenCount) + longComplete, "working"},
		"a long line and no marker":           {rollout(sessionMeta, longLine(5000), tokenCount), "unknown"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			assertState(t, oneSession(test.content), codex.Scan{Chunk: 512, Cap: 1 << 20}, test.want)
		})
	}
}

// Where the chunks cut the file changes nothing: a rollout file reads as
// the same state at every chunk size, from one byte to more than the file.
func TestReadAgentsReadsTheSameStateAtEveryChunkSize(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		content string
		want    codex.State
	}{
		"working":           {rollout(sessionMeta, taskStarted, taskComplete, "", taskStarted, itemCompleted, tokenCount) + taskComplete[:90], "working"},
		"idle":              {rollout(taskStarted, turnAborted, settingsApplied, responseItem), "idle"},
		"no marker":         {rollout(sessionMeta, itemCompleted) + taskStarted, "unknown"},
		"a marker, nothing": {rollout(taskStarted), "working"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			for chunk := int64(1); chunk <= int64(len(test.content))+1; chunk++ {
				agents, err := newAdapter(t, oneSession(test.content), codex.Scan{Chunk: chunk, Cap: 1 << 20}).ReadAgents(t.Context())
				if err != nil {
					t.Fatalf("at a chunk of %d bytes: %v", chunk, err)
				}
				if want := []codex.Agent{{ID: threadE, State: test.want}}; !slices.Equal(agents, want) {
					t.Fatalf("at a chunk of %d bytes: got the agents %v, want %v", chunk, agents, want)
				}
			}
		})
	}
}

// A scan reads no more of a file than its cap, from the end: a marker
// before that is not found and the state is unknown, with exactly the cap
// read. A marker found within the cap decides, at the cap's last byte too:
// a cap whose last byte is the line break before the marker's line finds
// it, and the state is the marker's, though the scan read all of its cap.
func TestReadAgentsStopsTheScanAtItsCap(t *testing.T) {
	t.Parallel()
	after := rollout(itemCompleted, responseItem, tokenCount, itemCompleted, responseItem, tokenCount)
	content := rollout(sessionMeta, taskStarted) + after
	if len(after) < 1100 {
		t.Fatalf("the lines after the marker are %d bytes, too few for this test", len(after))
	}

	t.Run("a marker before the cap", func(t *testing.T) {
		t.Parallel()
		home := oneSession(content)

		assertState(t, home, codex.Scan{Chunk: 400, Cap: 1000}, "unknown")

		if got, want := home.reads(), []int64{400, 400, 200}; !slices.Equal(got, want) {
			t.Errorf("got reads of %v bytes, want %v", got, want)
		}
	})
	t.Run("a marker cut by the cap", func(t *testing.T) {
		t.Parallel()
		assertState(t, oneSession(content), codex.Scan{Chunk: 400, Cap: int64(len(after)) + 100}, "unknown")
	})
	// The marker's line with its line break, and the one before it, which
	// shows where the line begins.
	whole := int64(len(taskStarted)+len(after)) + 2
	t.Run("a marker whose beginning the cap does not show", func(t *testing.T) {
		t.Parallel()
		assertState(t, oneSession(content), codex.Scan{Chunk: 400, Cap: whole - 1}, "unknown")
	})
	t.Run("a marker within the cap", func(t *testing.T) {
		t.Parallel()
		assertState(t, oneSession(content), codex.Scan{Chunk: 400, Cap: whole}, "working")
	})
	t.Run("a cap below the chunk", func(t *testing.T) {
		t.Parallel()
		home := oneSession(content)

		assertState(t, home, codex.Scan{Chunk: 4096, Cap: 1000}, "unknown")

		if got, want := home.reads(), []int64{1000}; !slices.Equal(got, want) {
			t.Errorf("got reads of %v bytes, want %v", got, want)
		}
	})
}

// A session whose rollout file is not there is unknown, in a read that
// succeeds: no file of its thread under sessions, no sessions directory,
// and a file that is gone after it was found, before its size or a chunk
// of it is read.
func TestReadAgentsReadsASessionWithNoRolloutFileAsUnknown(t *testing.T) {
	t.Parallel()
	gone := &fs.PathError{Op: "open", Path: "sessions", Err: fs.ErrNotExist}
	for name, home := range map[string]*homeFake{
		"no file of the thread": {rollouts: map[string]string{rolloutOf(threadA): rollout(taskStarted)}},
		"files named almost as its own": {rollouts: map[string]string{
			"sessions/2026/10/09/rollout-2026-10-09T21-38-57-" + threadE + ".jsonl.zst": rollout(taskStarted),
			"sessions/2026/10/09/notes-" + threadE + ".jsonl":                           rollout(taskStarted),
		}},
		"no sessions directory": {findErr: gone},
		"gone before its size":  {rollouts: map[string]string{rolloutOf(threadE): rollout(taskStarted)}, sizeErr: gone},
		"gone before its read":  {rollouts: map[string]string{rolloutOf(threadE): rollout(taskStarted)}, readErr: gone},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home.locks = []lockFile{{name: threadE + ".lock", held: true}}
			assertState(t, home, roomy(), "unknown")
		})
	}
}

// No active session is a successful read of no agents, an empty set that
// is not nil: a missing thread-writer-locks directory, an empty one, and
// one with only stale lock files and what is no thread's lock.
func TestReadAgentsReturnsAnEmptySetWhenNoSessionIsActive(t *testing.T) {
	t.Parallel()
	for name, home := range map[string]*homeFake{
		"no directory":       {listErr: &fs.PathError{Op: "open", Path: "thread-writer-locks", Err: fs.ErrNotExist}},
		"an empty directory": {locks: []lockFile{}},
		"only stale lock files": {
			locks: []lockFile{
				{name: ".coordination.lock", held: true},
				{name: threadA + ".lock", held: false},
				{name: threadB + ".lock", held: false},
			},
			rollouts: map[string]string{rolloutOf(threadA): rollout(taskStarted)},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			agents, err := newAdapter(t, home, roomy()).ReadAgents(t.Context())
			if err != nil {
				t.Fatal(err)
			}

			if agents == nil || len(agents) != 0 {
				t.Errorf("got the agents %#v, want an empty set that is not nil", agents)
			}
		})
	}
}

// A lock file whose thread ID is empty or not valid UTF-8, or that is
// listed twice, fails the whole read, the active sessions before it
// included, whether it is held or stale.
func TestReadAgentsRejectsAnInvalidThreadID(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		lock lockFile
		why  string
	}{
		"empty, held":            {lockFile{name: ".lock", held: true}, `lock file ".lock" has an empty thread ID`},
		"empty, stale":           {lockFile{name: ".lock"}, `lock file ".lock" has an empty thread ID`},
		"not UTF-8, held":        {lockFile{name: "thread-\xff.lock", held: true}, `lock file "thread-\xff.lock" has a thread ID that is not valid UTF-8`},
		"not UTF-8, stale":       {lockFile{name: "\xc3.lock"}, `lock file "\xc3.lock" has a thread ID that is not valid UTF-8`},
		"cut inside a character": {lockFile{name: "thread-\xed\xa0\x80.lock", held: true}, `has a thread ID that is not valid UTF-8`},
		"listed twice":           {lockFile{name: threadA + ".lock", held: true}, `lock file "` + threadA + `.lock" is listed twice`},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home := &homeFake{
				locks:    []lockFile{{name: threadA + ".lock", held: true}, test.lock, {name: threadC + ".lock", held: true}},
				rollouts: map[string]string{rolloutOf(threadA): rollout(taskStarted)},
			}

			agents, err := newAdapter(t, home, roomy()).ReadAgents(t.Context())

			assertNoRead(t, agents, err, test.why)
		})
	}
}

// Two rollout files for one thread fail the whole read, the active
// sessions before it included, with an error that names the thread and the
// files.
func TestReadAgentsRejectsTwoRolloutFilesForOneThread(t *testing.T) {
	t.Parallel()
	other := "sessions/2026/10/08/rollout-2026-10-08T07-06-11-" + threadC + ".jsonl"
	home := &homeFake{
		locks: []lockFile{{name: threadA + ".lock", held: true}, {name: threadC + ".lock", held: true}},
		rollouts: map[string]string{
			rolloutOf(threadA): rollout(taskStarted),
			rolloutOf(threadC): rollout(taskStarted, taskComplete),
			other:              rollout(taskStarted),
		},
	}

	agents, err := newAdapter(t, home, roomy()).ReadAgents(t.Context())

	assertNoRead(t, agents, err, `thread "`+threadC+`" has 2 rollout files: `+other+`, `+rolloutOf(threadC))
}

// An error of the files that is not "does not exist" fails the whole read
// with that error, the active sessions before it included: from listing,
// probing, finding, taking the size and reading. So does a read that
// returns another number of bytes than asked for.
func TestReadAgentsFailsWithAnErrorOfTheFiles(t *testing.T) {
	t.Parallel()
	failure := errors.New("permission denied")
	for name, test := range map[string]struct {
		broken func(home *homeFake)
		why    string
	}{
		"listing": {func(home *homeFake) { home.listErr = failure }, "codex: list thread-writer-locks: permission denied"},
		"probing": {func(home *homeFake) { home.locks[1].err = failure }, "codex: probe thread-writer-locks/" + threadC + ".lock: permission denied"},
		"finding": {func(home *homeFake) { home.findErr = failure }, `codex: find the rollout file of thread "` + threadA + `": permission denied`},
		"size":    {func(home *homeFake) { home.sizeErr = failure }, "codex: size of " + rolloutOf(threadA) + ": permission denied"},
		"reading": {func(home *homeFake) { home.readErr = failure }, "codex: read " + rolloutOf(threadA) + ": permission denied"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home := &homeFake{
				locks: []lockFile{{name: threadA + ".lock", held: true}, {name: threadC + ".lock", held: true}},
				rollouts: map[string]string{
					rolloutOf(threadA): rollout(taskStarted),
					rolloutOf(threadC): rollout(taskStarted, taskComplete),
				},
			}
			test.broken(home)

			agents, err := newAdapter(t, home, roomy()).ReadAgents(t.Context())

			assertNoRead(t, agents, err, test.why)
			if !errors.Is(err, failure) {
				t.Errorf("got the error %q, want one that is the files' %q", err, failure)
			}
		})
	}

	t.Run("a short read", func(t *testing.T) {
		t.Parallel()
		content := rollout(taskStarted)
		home := oneSession(content)
		home.short = true

		agents, err := newAdapter(t, home, roomy()).ReadAgents(t.Context())

		assertNoRead(t, agents, err, fmt.Sprintf("codex: read %s: got %d bytes at offset 0, not the %d asked for", rolloutOf(threadE), len(content)-1, len(content)))
	})
}

// A context that ends while a session is read stops the read before the
// next lock file, with the context's error and no agents: nothing more is
// asked of the files, which here do not look at the context themselves.
func TestReadAgentsStopsBetweenLockFilesWhenItsContextEnds(t *testing.T) {
	t.Parallel()
	stopped := errors.New("the read timed out")
	for name, test := range map[string]struct {
		cancel func(cancel context.CancelCauseFunc)
		want   error
	}{
		"cancelled":    {func(cancel context.CancelCauseFunc) { cancel(nil) }, context.Canceled},
		"with a cause": {func(cancel context.CancelCauseFunc) { cancel(stopped) }, stopped},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancelCause(t.Context())
			defer cancel(nil)
			home := &homeFake{
				locks: []lockFile{{name: threadA + ".lock", held: true}, {name: threadC + ".lock", held: true}},
				rollouts: map[string]string{
					rolloutOf(threadA): rollout(taskStarted),
					rolloutOf(threadC): rollout(taskStarted, taskComplete),
				},
			}
			// The last call for the first session: its rollout file's read.
			home.before = func(asked string) {
				if strings.HasPrefix(asked, "read "+rolloutOf(threadA)) {
					test.cancel(cancel)
				}
			}

			agents, err := newAdapter(t, home, roomy()).ReadAgents(ctx)

			assertNoRead(t, agents, err, "codex: read thread-writer-locks: ")
			if !errors.Is(err, test.want) {
				t.Errorf("got the error %q, want one that is %q", err, test.want)
			}
			for _, asked := range home.asked() {
				if strings.Contains(asked, threadC) {
					t.Errorf("after the context ended, the files were asked %q", asked)
				}
			}
		})
	}
}

// A context that ends during the read's last call of the files fails the
// read, with the context's cause and no agents, though that call answered:
// the listing of a directory with no lock file, the listing of a directory
// that does not exist, and the rollout file's read of the only session.
// The files here do not look at the context themselves.
func TestReadAgentsFailsWhenItsContextEndsDuringItsLastCall(t *testing.T) {
	t.Parallel()
	stopped := errors.New("the read timed out")
	for name, test := range map[string]struct {
		home *homeFake
		// during is how the call begins during which the context ends.
		during string
	}{
		"the listing of an empty directory": {&homeFake{locks: []lockFile{}}, "list thread-writer-locks"},
		"the listing of a missing directory": {
			&homeFake{listErr: &fs.PathError{Op: "open", Path: "thread-writer-locks", Err: fs.ErrNotExist}},
			"list thread-writer-locks",
		},
		"the rollout read of the only session": {oneSession(rollout(sessionMeta, taskStarted)), "read " + rolloutOf(threadE)},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancelCause(t.Context())
			defer cancel(nil)
			test.home.before = func(asked string) {
				if strings.HasPrefix(asked, test.during) {
					cancel(stopped)
				}
			}

			agents, err := newAdapter(t, test.home, roomy()).ReadAgents(ctx)

			assertNoRead(t, agents, err, "codex: read thread-writer-locks: the read timed out")
			if !errors.Is(err, stopped) {
				t.Errorf("got the error %q, want one that is the context's cause %q", err, stopped)
			}
			if asked := test.home.asked(); !strings.HasPrefix(asked[len(asked)-1], test.during) {
				t.Errorf("got the calls %q, want the last one to be the one the context ended in, %q", asked, test.during)
			}
		})
	}
}

// A read under a context that is done already stops before the first lock
// file: the directory is listed, under that context, and nothing is
// probed.
func TestReadAgentsProbesNothingUnderAContextThatIsDone(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	home := oneSession(rollout(taskStarted))

	agents, err := newAdapter(t, home, roomy()).ReadAgents(ctx)

	assertNoRead(t, agents, err, "codex: read thread-writer-locks: context canceled")
	if !errors.Is(err, context.Canceled) {
		t.Errorf("got the error %q, want one that is context.Canceled", err)
	}
	if got, want := home.asked(), []string{"list thread-writer-locks"}; !slices.Equal(got, want) {
		t.Errorf("got the calls %q, want %q", got, want)
	}
}
