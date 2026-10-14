package codex

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// The probe's turns run on the cheapest model at its lowest effort: each
// only runs one command.
const (
	ProbeModel  = "gpt-6-luna"
	ProbeEffort = "low"
)

// probeTimeout bounds each of the probe's turns and commands.
const probeTimeout = 5 * time.Minute

// probeActions are what the probe script tries, each a name and a shell
// command; TOKEN is the run's own, so what an action wrote is known and
// removed.
var probeActions = []struct{ name, command string }{
	{"read file", "cat README"},
	{"git show", "git show --stat HEAD"},
	{"write in repository", "echo x > written"},
	{"write under /tmp", "echo x > /tmp/agister-probe-TOKEN"},
	{"write in home", `echo x > "$HOME/.agister-probe-TOKEN"`},
	{"touch in .git", "touch .git/agister-probe"},
	{"git tag", "git tag agister-probe-TOKEN"},
	{"git commit", "git -c user.name=agister -c user.email=agister@localhost commit -q --allow-empty -m probe"},
	{"network", "curl -sS -m 5 -o /dev/null https://example.com"},
}

// probeAllowed are the actions each sandbox mode lets through; it refuses
// every other.
var probeAllowed = map[string][]string{
	"read-only":       {"read file", "git show"},
	"workspace-write": {"read file", "git show", "write in repository", "write under /tmp"},
}

const probePrompt = "Run this exact command once, as a single shell command, and nothing else: sh probe.sh\nThen reply with its output."

// Probe is what probing Codex's sandbox found: the version probed, the
// sandbox modes that held, and every action's outcome in each turn.
type Probe struct {
	Version    string
	Primitives []string
	Report     string
}

// Probe asks Codex to run one probe script in each of its sandbox modes,
// each turn in a scratch git repository of its own: read-only,
// workspace-write, and the workspace-write thread resumed read-only. The
// turns are the adapter's own, with the arguments a call's turn gets. The
// sandbox, not the model, decides each action; its outcome is read from the
// command's output Codex reports, never from the model's reply.
//
// The script first runs outside the sandbox, where every action must
// succeed, so a refusal inside it is the sandbox's, not the host's. A mode
// holds when each action's outcome is the one it allows or refuses;
// read-only holds only when it holds resumed too. An error is a probe that
// proves nothing: the script failed outside the sandbox, a turn failed, or
// the model did not run it.
func (r *Runner) Probe(ctx context.Context) (Probe, error) {
	identity, err := r.Identity(ctx)
	if err != nil {
		return Probe{}, err
	}
	probe := Probe{Version: identity.Version}
	turns := *r
	turns.Sessions = nil // a probe's cost is not looked up
	root, err := os.MkdirTemp("", "agister-probe-")
	if err != nil {
		return probe, err
	}
	defer os.RemoveAll(root)

	control, token, err := r.scratch(ctx, root, "control")
	if err != nil {
		return probe, err
	}
	output, err := r.shell(ctx, control, token, "probe.sh")
	if err != nil {
		return probe, fmt.Errorf("the probe outside the sandbox: %w", err)
	}
	if got := probeOutcomes(output); !slices.Equal(got, everyOK()) {
		return probe, fmt.Errorf("outside the sandbox the probe gets %s, not every action ok: nothing is proved", strings.Join(got, ", "))
	}

	var report []string
	held := map[string]bool{}
	var thread, repo string
	for _, mode := range []string{"read-only", "workspace-write", "resumed read-only"} {
		request := TurnRequest{Prompt: probePrompt, Model: ProbeModel, Effort: ProbeEffort, Timeout: probeTimeout}
		primitive := strings.TrimPrefix(mode, "resumed ")
		request.Primitives = []string{primitive}
		if mode == "resumed read-only" {
			if token, err = newToken(); err != nil {
				return probe, err
			}
			if err := os.WriteFile(filepath.Join(repo, "probe.sh"), probeScript(token), 0o600); err != nil {
				return probe, err
			}
			request.ResumeSessionID = thread
		} else if repo, token, err = r.scratch(ctx, root, primitive); err != nil {
			return probe, err
		}
		request.Cwd = repo
		started, output, err := turns.probeTurn(ctx, request, token)
		if err != nil {
			return probe, fmt.Errorf("%s: %w", mode, err)
		}
		if mode == "workspace-write" {
			thread = started
		}
		got, want := probeOutcomes(output), probeExpected(primitive)
		for i, action := range probeActions {
			mark := ""
			if got[i] != want[i] {
				mark = " (want " + want[i] + ")"
			}
			report = append(report, fmt.Sprintf("%s: %s: %s%s", mode, action.name, got[i], mark))
		}
		if mode == "resumed read-only" {
			held[primitive] = held[primitive] && slices.Equal(got, want)
		} else {
			held[primitive] = slices.Equal(got, want)
		}
	}
	for _, mode := range sandboxModes {
		if held[mode] {
			probe.Primitives = append(probe.Primitives, mode)
		}
	}
	probe.Report = strings.Join(report, "\n")
	return probe, nil
}

// probeTurn runs one of the probe's turns: the thread it ran in and the
// output of the probe script, which the model must have run.
func (r *Runner) probeTurn(ctx context.Context, request TurnRequest, token string) (thread, output string, err error) {
	defer removeWritten(token)
	tools := &probeSink{commands: map[string]string{}}
	turn := r.RunTurn(ctx, request, tools)
	if turn.Error != nil {
		return "", "", fmt.Errorf("the turn failed: %s", turn.Error.String())
	}
	if turn.ProviderSessionID == "" {
		return "", "", fmt.Errorf("the turn reported no thread")
	}
	for _, id := range tools.order {
		if strings.Contains(tools.commands[id], "probe.sh") {
			if result, ok := tools.results[id]; ok {
				return turn.ProviderSessionID, result, nil
			}
		}
	}
	return "", "", fmt.Errorf("the model did not run the probe: nothing is proved")
}

// scratch makes a git repository under root, named name, holding the probe
// script of a new token, and returns it and the token.
func (r *Runner) scratch(ctx context.Context, root, name string) (dir, token string, err error) {
	if token, err = newToken(); err != nil {
		return "", "", err
	}
	dir = filepath.Join(root, name)
	if err := os.Mkdir(dir, 0o700); err != nil {
		return "", "", err
	}
	if err := os.WriteFile(filepath.Join(dir, "README"), []byte("scratch\n"), 0o600); err != nil {
		return "", "", err
	}
	if err := os.WriteFile(filepath.Join(dir, "probe.sh"), probeScript(token), 0o600); err != nil {
		return "", "", err
	}
	if _, err := r.shell(ctx, dir, token, "-c", "git init -q && git add . && git -c user.name=agister -c user.email=agister@localhost commit -q -m scratch"); err != nil {
		return "", "", fmt.Errorf("making a scratch repository: %w", err)
	}
	return dir, token, nil
}

// shell runs sh with args in dir, outside any sandbox, and returns its
// output; it fails unless sh exits 0.
func (r *Runner) shell(ctx context.Context, dir, token string, args ...string) (string, error) {
	defer removeWritten(token)
	var output strings.Builder
	evidence := r.Transport.Run(ctx, Spec{Command: "sh", Args: args, Dir: dir, Timeout: probeTimeout, KillGrace: r.KillGrace}, &probeSink{}, func(line string) {
		output.WriteString(line + "\n")
	})
	if exit := evidence.Exit; evidence.SpawnError != "" || exit == nil || exit.Code == nil || *exit.Code != 0 {
		return "", fmt.Errorf("sh %s: %s", strings.Join(args, " "), reason(evidence))
	}
	return output.String(), nil
}

// removeWritten removes what the probe of token wrote outside its
// repository.
func removeWritten(token string) {
	os.Remove("/tmp/agister-probe-" + token)
	if home, err := os.UserHomeDir(); err == nil {
		os.Remove(filepath.Join(home, ".agister-probe-"+token))
	}
}

func newToken() (string, error) {
	random := make([]byte, 6)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return hex.EncodeToString(random), nil
}

// probeScript prints name=ok or name=refused for each action, in order.
func probeScript(token string) []byte {
	lines := []string{"#!/bin/sh"}
	for _, action := range probeActions {
		command := strings.ReplaceAll(action.command, "TOKEN", token)
		lines = append(lines, fmt.Sprintf("if ( %s ) >/dev/null 2>&1; then echo '%s=ok'; else echo '%s=refused'; fi", command, action.name, action.name))
	}
	return []byte(strings.Join(lines, "\n") + "\n")
}

// probeOutcomes are each action's outcome in output, in order: ok, refused,
// or missing.
func probeOutcomes(output string) []string {
	found := map[string]string{}
	for _, line := range strings.Split(output, "\n") {
		name, result, ok := strings.Cut(strings.TrimSpace(line), "=")
		if ok && (result == "ok" || result == "refused") {
			found[name] = result
		}
	}
	outcomes := make([]string, len(probeActions))
	for i, action := range probeActions {
		if outcomes[i] = found[action.name]; outcomes[i] == "" {
			outcomes[i] = "missing"
		}
	}
	return outcomes
}

func probeExpected(mode string) []string {
	want := make([]string, len(probeActions))
	for i, action := range probeActions {
		want[i] = "refused"
		if slices.Contains(probeAllowed[mode], action.name) {
			want[i] = "ok"
		}
	}
	return want
}

func everyOK() []string {
	ok := make([]string, len(probeActions))
	for i := range ok {
		ok[i] = "ok"
	}
	return ok
}

// probeSink keeps the commands a probe turn started and their output.
type probeSink struct {
	order    []string
	commands map[string]string
	results  map[string]string
}

func (*probeSink) Event(string, string, map[string]any) {}
func (*probeSink) Raw(string)                           {}
func (*probeSink) ProcessStarted(string) error          { return nil }

func (s *probeSink) ToolStarted(call ToolCall) {
	if call.Command {
		s.order = append(s.order, call.ID)
		s.commands[call.ID] = call.Input
	}
}

func (s *probeSink) ToolFinished(result ToolResult) {
	if result.Reported {
		if s.results == nil {
			s.results = map[string]string{}
		}
		s.results[result.ID] = result.Output
	}
}
