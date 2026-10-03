package opencode_test

import (
	"context"
	"encoding/json"

	"math"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"

	// fresh is the session the fake starts.
	"github.com/igor1309/ai-labs/gokit/clocktest"
	supervisor "github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// The fake this package builds is removed when its tests end.
func TestMain(m *testing.M) { os.Exit(runtimetest.Run(m)) }

// fake is the command the in-process starter runs the fake OpenCode by.
const fake = "opencode"

// stillSupervisor is the real supervisor over the fakes run in process,
// with its waits on a manual clock that nothing advances: no turn or
// lookup times out unless a test advances a clock of its own, and no grace
// passes.
func stillSupervisor() supervisor.Runtime {
	return stillOver(runtimetest.InProcess{Groups: supervisortest.NewGroups()})
}

// stillOver is stillSupervisor starting through starter.
func stillOver(starter runtimetest.InProcess) supervisor.Runtime {
	return supervisor.Runtime{Starter: starter, Timer: clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)).Timer}
}

const fresh = "ses_f06fe64c3ffeLyBkwYK7e1GfJs"

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read", "skill", "bash"},
		Model:        "opencode-go/minimax-m3",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

func runner(t *testing.T) *opencode.Runner {
	return &opencode.Runner{Transport: composition.OpenCodeTransport{Supervisor: stillSupervisor()}, Command: fake}
}

// Contract test: the OpenCode adapter against its built fake, a real
// process under the real supervisor.
func TestConformance(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return composition.AdaptOpenCode(&opencode.Runner{Transport: composition.OpenCodeTransport{Supervisor: supervisor.Runtime{Timer: clock.Timer}}, Command: command})
		},
		Clock:    clock,
		Fake:     runtimetest.Binary(t, "fakeopencode"),
		Contract: opencode.Contract,
		Request:  request,
	})
}

func follows(args []string, flag, value string) bool {
	for i := range args[:len(args)-1] {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}

// echo is the fake's first line: what it was given.
type echo struct {
	Argv                   []string
	Prompt, Config, System string
	Permission             json.RawMessage
}

func echoed(t *testing.T, sink *runtimetest.Recorder) echo {
	t.Helper()
	var e echo
	if err := json.Unmarshal([]byte(sink.Lines[0]), &e); err != nil {
		t.Fatal(err)
	}
	return e
}

// A turn gives OpenCode the generated agent in OPENCODE_CONFIG_CONTENT and
// names it with --agent; the prompt goes on stdin. The agent's name is the
// turn's own, so no agent a config defines can merge with it.
func TestATurnRunsAsItsOwnGeneratedAgent(t *testing.T) {
	t.Parallel()
	name := regexp.MustCompile(`^agister-[0-9a-f]{16}$`)
	var names []string
	for range 2 {
		sink := &runtimetest.Recorder{}
		r := request("hello SCENARIO:approve")
		if turn := composition.AdaptOpenCode(runner(t)).RunTurn(context.Background(), r, sink); string(turn.Status) != string(run.Completed) {
			t.Fatalf("turn = %+v", turn)
		}
		e := echoed(t, sink)
		agent := e.Argv[5]
		if e.Argv[4] != "--agent" || !name.MatchString(agent) || e.Config != opencode.Config(opencode.TurnRequest(r), agent) {
			t.Fatalf("argv %q, config %s", e.Argv, e.Config)
		}
		if e.Prompt != "hello SCENARIO:approve" || !strings.HasPrefix(e.System, "Do the thing.\n\n") ||
			!strings.Contains(e.System, "<output-schema>\n{\"type\":\"object\"}\n</output-schema>") ||
			string(e.Permission) != `{"*":"deny","read":"allow","skill":"allow","bash":"allow"}` {
			t.Fatalf("echo = %+v", e)
		}
		names = append(names, agent)
	}
	if names[0] == names[1] {
		t.Fatalf("two turns ran as the same agent %s", names[0])
	}
}

// A turn's inline config replaces one the environment already holds.
func TestTheConfigReplacesAnInheritedOne(t *testing.T) {
	t.Parallel()
	inherited := runner(t)
	inherited.Transport = composition.OpenCodeTransport{Supervisor: stillOver(runtimetest.InProcess{
		Groups: supervisortest.NewGroups(),
		Env:    []string{opencode.ConfigVariable + `={"agent":{"build":{"permission":{"*":"allow"}}}}`},
	})}
	sink := &runtimetest.Recorder{}
	if turn := composition.AdaptOpenCode(inherited).RunTurn(context.Background(), request("SCENARIO:approve"), sink); string(turn.Status) != string(run.Completed) {
		t.Fatalf("turn = %+v", turn)
	}
	if e := echoed(t, sink); strings.Contains(e.Config, "build") || !strings.Contains(e.Config, e.Argv[5]) {
		t.Fatalf("config = %s", e.Config)
	}
}

// OpenCode lists and loads a skill with its skill tool only: a turn not
// granted it is refused before OpenCode starts.
func TestRefusesATurnThatCannotUseASkill(t *testing.T) {
	t.Parallel()
	for _, primitives := range [][]string{nil, {}, {"read", "grep", "glob"}, {"bash"}, {"edit"}} {
		r := request("x")
		r.Primitives = primitives
		if args, err := opencode.Arguments(opencode.TurnRequest(r), "a"); err == nil || err.Error() != "opencode/1 needs skill to use the repository's skills (ADR-006)" {
			t.Errorf("primitives %q: args %q, err = %v", primitives, args, err)
		}
	}
	r := request("x")
	r.Primitives = []string{"read"}
	sink := &runtimetest.Recorder{}
	turn := composition.AdaptOpenCode(runner(t)).RunTurn(context.Background(), r, sink)
	if string(turn.Status) != string(run.Failed) || string(turn.Error.Class) != string(run.ClassInternal) || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
}

func TestRejectsWhatItCannotHonour(t *testing.T) {
	t.Parallel()
	r := request("x")
	limit := 1.0
	r.MaxCostUSD = &limit
	if _, err := opencode.Arguments(opencode.TurnRequest(r), "a"); err == nil || err.Error() != "opencode/1 cannot limit cost" {
		t.Fatalf("cost limit: err = %v", err)
	}
	// write is no permission of its own, list no tool of 1.18.33, and the
	// rest are tools a call is never given.
	for _, primitives := range [][]string{{"Bash"}, {"skill", "write"}, {"skill", "list"}, {"skill", "task"}, {"skill", "todowrite"}, {"skill", "question"}, {"skill", "*"}, {""}} {
		r := request("x")
		r.Primitives = primitives
		if _, err := opencode.Arguments(opencode.TurnRequest(r), "a"); err == nil || !strings.Contains(err.Error(), "opencode/1 has no tool") {
			t.Errorf("primitives %q: err = %v", primitives, err)
		}
	}
	r = request("x")
	r.Effort = "extreme"
	if _, err := opencode.Arguments(opencode.TurnRequest(r), "a"); err == nil || !strings.Contains(err.Error(), "opencode/1 has no variant") {
		t.Fatalf("an unknown variant: err = %v", err)
	}
	// Refused before OpenCode starts.
	r = request("x")
	r.MaxCostUSD = &limit
	sink := &runtimetest.Recorder{}
	turn := composition.AdaptOpenCode(runner(t)).RunTurn(context.Background(), r, sink)
	if string(turn.Status) != string(run.Failed) || string(turn.Error.Class) != string(run.ClassInternal) || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
}

func TestIdentity(t *testing.T) {
	t.Parallel()
	identity, err := opencode.New(fake, composition.OpenCodeTransport{Supervisor: stillSupervisor()}).Identity(context.Background())
	want := opencode.RuntimeIdentity{Contract: "opencode/1", Version: "1.18.33", Resume: true, ResumeWhereItRan: true, SkillTools: []string{"skill"}}
	if err != nil || !reflect.DeepEqual(identity, want) {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
}

// A fresh turn reports the session OpenCode started, and a later turn of
// the call resumes it by that ID.
func TestALaterTurnResumesTheSession(t *testing.T) {
	t.Parallel()
	sink := &runtimetest.Recorder{}
	turn := composition.AdaptOpenCode(runner(t)).RunTurn(context.Background(), request("SCENARIO:approve"), sink)
	if string(turn.Status) != string(run.Completed) || turn.ProviderSessionID != fresh {
		t.Fatalf("fresh turn = %+v", turn)
	}
	next := request("SCENARIO:approve")
	next.ResumeSessionID = turn.ProviderSessionID
	sink = &runtimetest.Recorder{}
	turn = composition.AdaptOpenCode(runner(t)).RunTurn(context.Background(), next, sink)
	if string(turn.Status) != string(run.Completed) || turn.ProviderSessionID != fresh || !follows(echoed(t, sink).Argv, "-s", fresh) {
		t.Fatalf("resumed turn = %+v", turn)
	}
}

func exited(code int) opencode.Evidence {
	return opencode.Evidence{Exit: &opencode.Exit{Code: &code}}
}

var clean = exited(0)

func reduce(stream *opencode.Stream, lines ...string) {
	for _, line := range lines {
		stream.Reduce(line)
	}
}

const (
	stepStart = `{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"type":"step-start"}}`
	answer    = `{"type":"text","timestamp":3,"sessionID":"ses_1","part":{"type":"text","text":"{\"answer\":\"vm\"}"}}`
	stopped   = `{"type":"step_finish","timestamp":4,"sessionID":"ses_1","part":{"type":"step-finish","reason":"stop","cost":0.25,"tokens":{"total":26,"input":10,"output":5,"reasoning":5,"cache":{"write":2,"read":4}}}}`
	failed    = `{"type":"error","timestamp":2,"sessionID":"ses_1","error":{"name":"UnknownError","data":{"message":"Unexpected server error. Check server logs for details.","ref":"err_1"}}}`
)

func step(session, reason string) string {
	return `{"type":"step_finish","timestamp":4,"sessionID":"` + session + `","part":{"type":"step-finish","reason":"` + reason + `","cost":0,"tokens":{"total":0,"input":0,"output":0,"reasoning":0,"cache":{"write":0,"read":0}}}}`
}

// A resume turn must report the session it resumed: another one, or none
// by the end of the turn, breaks the contract of resuming in place. The
// steps it finished have still cost what they reported.
func TestResumeReportingAnotherSessionFails(t *testing.T) {
	t.Parallel()
	for name, lines := range map[string][]string{
		"another session": {`{"type":"step_start","sessionID":"ses_2","part":{"type":"step-start"}}`, strings.ReplaceAll(stopped, "ses_1", "ses_2")},
		"no session":      {`{"type":"step_finish","part":{"type":"step-finish","reason":"stop","cost":0.25,"tokens":{"input":10,"output":5}}}`},
	} {
		stream := &opencode.Stream{ResumedSessionID: "ses_1"}
		reduce(stream, lines...)
		turn := stream.Reconcile(clean, false)
		if string(turn.Status) != string(run.Failed) || string(turn.Error.Class) != string(run.ClassRuntimeError) || !strings.Contains(turn.Error.Message, "resumed session ses_1") {
			t.Errorf("%s: turn = %+v", name, turn)
		}
		if u := turn.Usage; u == nil || *u.InputTokens != 10 || *u.OutputTokens != 5 || turn.CostUSD == nil || *turn.CostUSD != 0.25 {
			t.Errorf("%s: usage %+v, cost %v", name, u, turn.CostUSD)
		}
	}
	stream := &opencode.Stream{ResumedSessionID: "ses_1"}
	reduce(stream, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(run.Completed) || turn.ProviderSessionID != "ses_1" {
		t.Fatalf("the same session: turn = %+v", turn)
	}

	// OpenCode reporting another session on resume: its two steps are kept.
	next := request("SCENARIO:mismatch")
	next.ResumeSessionID = "ses_1"
	turn := composition.AdaptOpenCode(runner(t)).RunTurn(context.Background(), next, &runtimetest.Recorder{})
	if string(turn.Status) != string(run.Failed) || string(turn.Error.Class) != string(run.ClassRuntimeError) || turn.ProviderSessionID == "ses_1" {
		t.Fatalf("mismatch: turn = %+v", turn)
	}
	if u := turn.Usage; u == nil || *u.InputTokens != 2200 || *u.OutputTokens != 120 || turn.CostUSD == nil || math.Abs(*turn.CostUSD-0.0033) > 1e-9 {
		t.Fatalf("mismatch: usage %+v, cost %v", u, turn.CostUSD)
	}
}
