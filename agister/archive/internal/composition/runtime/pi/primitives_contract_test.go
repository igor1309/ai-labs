package pi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// Contract test: installed Pi 1.0.2's seven real primitives, through the
// production adapter and supervisor, against temporary filesystem fixtures.
// Only the provider is scripted: no remote model or credentials are needed.
// Pi's home, agent configuration, sessions and tool effects belong to this test.
// Prerequisites: Pi 1.0.2, rg and fd (or fdfind) on PATH; localhost HTTP allowed.
// Caller invocation, from agister/:
//
//	AGISTER_PI_102_CONTRACT=1 go test -race -count=1 -timeout 1m ./internal/composition/runtime/pi -run '^TestPi102PrimitiveContract$'
//
// Ordinary checks compile this test but skip it before starting any process or
// listener. The caller runs it after the implementation run (LAB-171 S28).
func TestPi102PrimitiveContract(t *testing.T) {
	t.Parallel()
	if os.Getenv("AGISTER_PI_102_CONTRACT") != "1" {
		t.Skip("caller-invoked Pi 1.0.2 contract: set AGISTER_PI_102_CONTRACT=1")
	}
	command, err := exec.LookPath("pi")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("rg"); err != nil {
		t.Fatalf("contract requires installed rg: %v", err)
	}
	if _, err := exec.LookPath("fd"); err != nil {
		if _, err := exec.LookPath("fdfind"); err != nil {
			t.Fatalf("contract requires installed fd or fdfind: %v", err)
		}
	}

	root, cwd, host := t.TempDir(), t.TempDir(), t.TempDir()
	// Node and bash report the physical working directory (not macOS's
	// /var -> /private/var alias), so assert against that same directory.
	cwd, err = filepath.EvalSymlinks(cwd)
	if err != nil {
		t.Fatal(err)
	}
	put := func(path, text string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	put(filepath.Join(cwd, "read.txt"), "read-effect-102\n")
	put(filepath.Join(host, "search", "match.txt"), "unmatched\ngrep-effect-102\n")
	put(filepath.Join(host, "search", "decoy.txt"), "unmatched\n")
	put(filepath.Join(host, "search", "nested", "target.txt"), "find-effect-102\n")
	put(filepath.Join(host, "listing", ".hidden"), "hidden\n")
	put(filepath.Join(host, "listing", "file.txt"), "listed\n")
	if err := os.MkdirAll(filepath.Join(host, "listing", "nested"), 0o700); err != nil {
		t.Fatal(err)
	}
	put(filepath.Join(host, "edit.txt"), "before\nold-effect-102\nafter\n")

	// The file tools also act outside Cwd, as home's host grants declare.
	// No tool can substitute for another: the provider requests each by name
	// and the assertions below associate its result with that call's ID.
	calls := []piPrimitiveCall{
		{"read", map[string]any{"path": "read.txt"}, "read-effect-102"},
		{"grep", map[string]any{"path": filepath.Join(host, "search"), "pattern": "grep-effect-102"}, "match.txt:2: grep-effect-102"},
		{"find", map[string]any{"path": filepath.Join(host, "search"), "pattern": "**/target.txt"}, "nested/target.txt"},
		{"ls", map[string]any{"path": filepath.Join(host, "listing")}, ".hidden\nfile.txt\nnested/"},
		{"edit", map[string]any{"path": filepath.Join(host, "edit.txt"), "oldText": "old-effect-102", "newText": "edit-effect-102"}, ""},
		{"write", map[string]any{"path": filepath.Join(host, "written", "new.txt"), "content": "write-effect-102\n"}, ""},
		{"bash", map[string]any{"command": "printf '%s\\n' 'bash-effect-102' > bash.txt && printf '%s\\n' 'bash-output-102' && pwd"}, "bash-output-102\n" + cwd},
	}
	server := httptest.NewServer(piPrimitiveProvider(t, calls))
	t.Cleanup(server.Close)
	models := map[string]any{"providers": map[string]any{"contract": map[string]any{
		"baseUrl": server.URL + "/v1", "api": "openai-completions", "apiKey": "contract-only",
		"models": []any{map[string]any{"id": "primitives", "reasoning": false, "input": []string{"text"}, "contextWindow": 32768, "maxTokens": 1024}},
	}}}
	data, err := json.Marshal(models)
	if err != nil {
		t.Fatal(err)
	}
	put(filepath.Join(root, "agent", "models.json"), string(data))
	processes := supervisor.Runtime{
		Starter: piContractStarter{next: supervisor.Exec{}, env: []string{
			"HOME=" + root, "PI_CODING_AGENT_DIR=" + filepath.Join(root, "agent"),
			"XDG_CONFIG_HOME=" + filepath.Join(root, "config"), "XDG_CACHE_HOME=" + filepath.Join(root, "cache"),
			"PI_OFFLINE=1", "HTTP_PROXY=", "HTTPS_PROXY=", "ALL_PROXY=", "NO_PROXY=127.0.0.1",
			"BASH_ENV=", "ENV=",
		}},
		// These real timers guard hangs only; no assertion depends on time.
		Timer: func(wait time.Duration) (<-chan time.Time, func()) {
			timer := time.NewTimer(wait)
			return timer.C, func() { timer.Stop() }
		},
	}
	runner := composition.AdaptPi(&pi.Runner{
		Command: command, Transport: composition.PiTransport{Supervisor: processes},
		TempDir: root, Sessions: filepath.Join(root, "sessions"), KillGrace: time.Second,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	identity, err := runner.Identity(ctx)
	if err != nil || identity.Version != "1.0.2" || identity.Contract != pi.Contract {
		t.Fatalf("requires Pi 1.0.2 with %s: identity %+v, error %v", pi.Contract, identity, err)
	}
	primitives := make([]string, len(calls))
	for i, call := range calls {
		primitives[i] = call.name
	}
	sink := &runtimetest.Recorder{}
	turn := runner.RunTurn(ctx, app.TurnRequest{
		Cwd: cwd, Prompt: "Execute the provider's fixture checks.", Model: "contract/primitives", Effort: "off",
		Primitives: primitives, Timeout: 30 * time.Second,
	}, sink)
	if turn.Status != run.Completed || turn.Text != "pi-102-contract-complete" {
		t.Fatalf("Pi primitive turn: %+v; stderr %q", turn, turn.StderrTail)
	}
	if len(sink.Tools) != len(calls) || len(sink.Results) != len(calls) {
		t.Fatalf("want seven executed primitives, got calls %+v, results %+v", sink.Tools, sink.Results)
	}
	for _, event := range sink.Events {
		if event.Kind == "TOOL_RESULT" && event.Data["is_error"] != false {
			t.Errorf("primitive failed: %+v", event)
		}
	}
	for i, call := range calls {
		tool, result := sink.Tools[i], sink.Results[i]
		if tool.Name != call.name || tool.ID != call.name || result.ID != tool.ID || tool.Command != (call.name == "bash") {
			t.Errorf("%s: call %+v, result %+v", call.name, tool, result)
		}
		var args map[string]any
		if err := json.Unmarshal([]byte(tool.Input), &args); err != nil || !reflect.DeepEqual(args, call.args) {
			t.Errorf("%s arguments: %s, want %v; decode %v", call.name, tool.Input, call.args, err)
		}
		if call.output != "" && (!result.Reported || strings.TrimSpace(result.Output) != call.output) {
			t.Errorf("%s output = %q (reported %t), want %q", call.name, result.Output, result.Reported, call.output)
		}
	}
	for path, want := range map[string]string{
		filepath.Join(host, "edit.txt"):            "before\nedit-effect-102\nafter\n",
		filepath.Join(host, "written", "new.txt"):  "write-effect-102\n",
		filepath.Join(cwd, "bash.txt"):             "bash-effect-102\n",
		filepath.Join(cwd, "read.txt"):             "read-effect-102\n",
		filepath.Join(host, "search", "decoy.txt"): "unmatched\n",
	} {
		got, err := os.ReadFile(path)
		if err != nil || string(got) != want {
			t.Errorf("file %s = %q, want %q; error %v", path, got, want, err)
		}
	}
}

type piPrimitiveCall struct {
	name   string
	args   map[string]any
	output string
}

// piContractStarter gives only the child an isolated home and configuration;
// the process starter and every environment override are explicitly supplied.
type piContractStarter struct {
	next supervisor.Starter
	env  []string
}

func (s piContractStarter) Start(command supervisor.Command) (supervisor.Process, error) {
	command.Env = append(slices.Clone(command.Env), s.env...)
	return s.next.Start(command)
}

// piPrimitiveProvider scripts only model replies, never Pi events or tools.
// The request's completed tool results determine the next call, with no clock
// or shared counter. Unexpected requests fail the test instead of retrying.
func piPrimitiveProvider(t *testing.T, calls []piPrimitiveCall) http.Handler {
	t.Helper()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Model    string
			Stream   bool
			Messages []struct {
				Role       string `json:"role"`
				ToolCallID string `json:"tool_call_id"`
			}
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("provider request: %v", err)
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		if r.Method != http.MethodPost || r.URL.Path != "/v1/chat/completions" || request.Model != "primitives" || !request.Stream {
			t.Errorf("unexpected provider request: %s %s, model %q, stream %t", r.Method, r.URL.Path, request.Model, request.Stream)
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		completed := 0
		for _, message := range request.Messages {
			if message.Role != "tool" {
				continue
			}
			if completed >= len(calls) || message.ToolCallID != calls[completed].name {
				t.Errorf("unexpected tool result at %d: %q", completed, message.ToolCallID)
				http.Error(w, "unexpected tool result", http.StatusBadRequest)
				return
			}
			completed++
		}
		delta, reason := map[string]any{"role": "assistant", "content": "pi-102-contract-complete"}, "stop"
		if completed < len(calls) {
			call := calls[completed]
			args, err := json.Marshal(call.args)
			if err != nil {
				t.Errorf("provider arguments: %v", err)
				http.Error(w, "invalid arguments", http.StatusBadRequest)
				return
			}
			delta, reason = map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{
				"index": 0, "id": call.name, "type": "function",
				"function": map[string]any{"name": call.name, "arguments": string(args)},
			}}}, "tool_calls"
		}
		chunk := map[string]any{
			"id": "pi-contract", "object": "chat.completion.chunk", "created": 0, "model": "primitives",
			"choices": []any{map[string]any{"index": 0, "delta": delta, "finish_reason": reason}},
		}
		data, err := json.Marshal(chunk)
		if err != nil {
			t.Errorf("provider chunk: %v", err)
			http.Error(w, "invalid chunk", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		if _, err := fmt.Fprintf(w, "data: %s\n\ndata: [DONE]\n\n", data); err != nil {
			t.Errorf("provider response: %v", err)
		}
	})
}
