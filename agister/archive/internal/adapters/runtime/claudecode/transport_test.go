package claudecode_test

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
)

// spyTransport and spyRuns are the runtimetest spies over the transport types claudecode
// declares.
type (
	spyTransport = runtimetest.Transport[claudecode.Spec, claudecode.Sink, claudecode.Evidence]
	spyRuns      = runtimetest.Runs[claudecode.Spec, claudecode.Sink, claudecode.Evidence]
)

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments, directory, prompt on stdin,
// timeout and the runner's kill grace.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	t.Parallel()
	for name, resume := range map[string]string{"fresh": "", "resumed": session} {
		spy := &spyTransport{}
		runner := &claudecode.Runner{Transport: spy, Command: "/opt/claude", KillGrace: 3 * time.Second}
		r := request("hello")
		r.Cwd = "/work"
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &sink{})

		args, err := claudecode.Arguments(r, "")
		if err != nil {
			t.Fatal(err)
		}
		if resumed := slices.Contains(args, "--resume"); resumed != (resume != "") {
			t.Errorf("%s: --resume in %q", name, args)
		}
		want := []claudecode.Spec{{Command: "/opt/claude", Args: args, Dir: "/work", Stdin: "hello", Timeout: time.Minute, KillGrace: 3 * time.Second}}
		if specs := spy.Specs(); !reflect.DeepEqual(specs, want) {
			t.Errorf("%s: specs =\n%+v\nwant\n%+v", name, specs, want)
		}
	}
}

// A turn the runtime reported nothing for is decided by the transport's
// evidence: Agister's timeout, or a signal Agister did not send.
func TestATurnIsDecidedByTheTransportsEvidence(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		evidence claudecode.Evidence
		status   claudecode.Status
		class    claudecode.Class
	}{
		"timeout": {claudecode.Evidence{TimedOut: true, Exit: &claudecode.Exit{Signal: "signal: terminated"}}, claudecode.Interrupted, claudecode.ClassTimeout},
		"signal":  {claudecode.Evidence{Exit: &claudecode.Exit{Signal: "signal: killed"}}, claudecode.Lost, claudecode.ClassKilled},
	} {
		spy := &spyTransport{Runs: spyRuns{Answer: func(claudecode.Spec) ([]string, claudecode.Evidence) { return nil, c.evidence }}}
		runner := &claudecode.Runner{Transport: spy, Command: "claude"}
		turn := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	t.Parallel()
	spy := &spyTransport{Output: "2.1.286 (Claude Code)"}
	identity, err := (&claudecode.Runner{Transport: spy, Command: "/opt/claude"}).Identity(context.Background())
	if err != nil || identity.Version != "2.1.286" || identity.Contract != claudecode.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	// The adapter gives a call its skills (ADR-021 rule 6).
	if !identity.Skills {
		t.Fatalf("identity = %+v, which gives no skills", identity)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/claude"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &spyTransport{Err: errors.New("not found")}
	if _, err := (&claudecode.Runner{Transport: failing, Command: "claude"}).Identity(context.Background()); err == nil {
		t.Fatal("a failed version check must fail identity")
	}
}

// Classification still quotes the process's bounded stderr, including a tail
// with a cut marker, and preserves the full retained tail as evidence.
func TestTheTransportStderrDecidesASilentFailure(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		code    int
		tail    string
		omitted int64
		message string
	}{
		{1, "[100 earlier bytes of stderr cut]\nolder line\nError: too large!", 100, "exit code 1: Error: too large!"},
		{2, "", 0, "exit code 2"},
	} {
		spy := &spyTransport{Runs: spyRuns{Answer: func(claudecode.Spec) ([]string, claudecode.Evidence) {
			return nil, claudecode.Evidence{Exit: &claudecode.Exit{Code: &c.code}, StderrTail: c.tail, StderrOmitted: c.omitted}
		}}}
		runner := &claudecode.Runner{Transport: spy, Command: "claudecode"}
		result := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if result.Status != claudecode.Failed || result.Error == nil || result.Error.Class != claudecode.ClassRuntimeError || result.Error.Message != c.message || result.StderrTail != c.tail || result.StderrOmitted != c.omitted {
			t.Fatalf("turn = %+v", result)
		}
	}
}

// A turn reports, in the stream's order, the path each tool call writes as
// the call starts, as the stream named it, and at the result each tool call
// it lists as denied, with its tool and input; their number stays the
// turn's count.
func TestATurnReportsThePathsWrittenAndThePermissionsDenied(t *testing.T) {
	t.Parallel()
	lines := []string{
		`{"type":"system","subtype":"init","session_id":"s-1","model":"claude-opus-5-5"}`,
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Edit","input":{"file_path":"/work/a.go","old_string":"a","new_string":"b"}}]}}`,
		`{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"edited"}]}}`,
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Write","input":{"file_path":"notes/b.md","content":"b"}},{"type":"tool_use","id":"t3","name":"Bash","input":{"command":"rm c.go"}}]}}`,
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t4","name":"Edit","input":{"file_path":"/work/a.go","old_string":"b","new_string":"c"}}]}}`,
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t5","name":"Write","input":{"file_path":"/etc/hosts","content":"x"}}]}}`,
		`{"type":"result","subtype":"success","is_error":false,"session_id":"s-1","result":"done","permission_denials":[` +
			`{"tool_name":"Bash","tool_use_id":"t3","tool_input":{"command":"rm c.go"}},` +
			`{"tool_name":"Write","tool_use_id":"t5","tool_input":{"file_path":"/etc/hosts","content":"x"}}]}`,
	}
	code := 0
	spy := &spyTransport{Runs: spyRuns{Answer: func(claudecode.Spec) ([]string, claudecode.Evidence) {
		return lines, claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}
	}}}
	runner := &claudecode.Runner{Transport: spy, Command: "claude"}
	sink := &told{}
	r := request("hello")
	r.OutputSchema = nil
	turn := runner.RunTurn(context.Background(), r, sink)

	want := []string{
		`started t1 Edit writes ["/work/a.go"]`,
		`started t2 Write writes ["notes/b.md"]`,
		`started t3 Bash writes []`,
		`started t4 Edit writes ["/work/a.go"]`,
		`started t5 Write writes ["/etc/hosts"]`,
		`denied Bash {"command":"rm c.go"}`,
		`denied Write {"content":"x","file_path":"/etc/hosts"}`,
	}
	if !reflect.DeepEqual(sink.reports, want) {
		t.Fatalf("reported\n%q\nwant\n%q", sink.reports, want)
	}
	if turn.Status != claudecode.Completed || turn.PermissionDenials != 2 {
		t.Fatalf("turn = %+v", turn)
	}
}

// midRun is a transport that feeds its lines through onLine and, before its
// Run returns, checks what each line has already told the sink.
type midRun struct {
	t     *testing.T
	sink  *told
	lines []string
	want  []string
}

func (m *midRun) Run(_ context.Context, _ claudecode.Spec, _ claudecode.Sink, onLine func(string)) claudecode.Evidence {
	for _, line := range m.lines {
		onLine(line)
	}
	if !reflect.DeepEqual(m.sink.reports, m.want) {
		m.t.Errorf("while the transport runs, reported\n%q\nwant\n%q", m.sink.reports, m.want)
	}
	code := 0
	return claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}
}

func (*midRun) Version(context.Context, string) (string, error) { return "", nil }

// A turn reports the permissions the result lists as denied as the result
// line arrives, while the transport still runs: a turn killed before its
// process exits keeps them.
func TestATurnReportsTheDenialsWhileTheTransportRuns(t *testing.T) {
	t.Parallel()
	sink := &told{}
	transport := &midRun{t: t, sink: sink, lines: []string{
		`{"type":"system","subtype":"init","session_id":"s-1","model":"claude-opus-5-5"}`,
		`{"type":"result","subtype":"success","is_error":false,"session_id":"s-1","result":"done","permission_denials":[` +
			`{"tool_name":"Bash","tool_use_id":"t1","tool_input":{"command":"rm c.go"}}]}`,
	}, want: []string{`denied Bash {"command":"rm c.go"}`}}
	r := request("hello")
	r.OutputSchema = nil
	runner := &claudecode.Runner{Transport: transport, Command: "claude"}
	if turn := runner.RunTurn(context.Background(), r, sink); turn.Status != claudecode.Completed || turn.PermissionDenials != 1 {
		t.Fatalf("turn = %+v", turn)
	}
}
