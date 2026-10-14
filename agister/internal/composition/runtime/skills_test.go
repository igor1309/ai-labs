package runtime

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// The real adapters and composition hand recorded skills to each fake runtime.
// The fake reads the files before it exits, rather than trusting argv alone.
func TestSkillsReachEachRuntimeOnEveryTurn(t *testing.T) {
	t.Parallel()
	for _, adapter := range []string{"claude-code", "pi", "opencode"} {
		t.Run(adapter, func(t *testing.T) {
			t.Parallel()
			runner, primitives := skillRunner(t, adapter)
			r := app.TurnRequest{Prompt: "SCENARIO:approve", Cwd: t.TempDir(), Timeout: time.Minute, Primitives: primitives}
			identity, err := runner.Identity(context.Background())
			if err != nil || !identity.Skills {
				t.Fatalf("identity %+v, %v", identity, err)
			}
			var previous map[string]map[string]string
			for _, turnCase := range []struct {
				withSkills bool
				scenario   string
			}{{false, "approve"}, {true, "approve"}, {true, "approve"}, {true, "exit_silent"}} {
				r.Prompt = "SCENARIO:" + turnCase.scenario
				if turnCase.withSkills {
					r.Skills = []app.TurnSkill{{Name: "review", Bytes: []byte("recorded review\n")}, {Name: "style", Bytes: []byte("recorded style\n")}}
				}
				sink := &runtimetest.Recorder{}
				turn := runner.RunTurn(context.Background(), r, sink)
				if turnCase.scenario == "approve" && turn.Status != run.Completed || turnCase.scenario != "approve" && (turn.Status == run.Completed || turn.Error == nil) {
					t.Fatalf("%s turn %+v", turnCase.scenario, turn)
				}
				var echo struct {
					Argv   []string
					Config string
					Skills map[string]map[string]string
				}
				if len(sink.Lines) == 0 {
					t.Fatal("no fake runtime echo")
				}
				if err := json.Unmarshal([]byte(sink.Lines[0]), &echo); err != nil {
					t.Fatal(err)
				}
				wantFolders := 1
				if adapter == "pi" {
					wantFolders = 2
				}
				if !turnCase.withSkills {
					wantFolders = 0
				}
				if len(echo.Skills) != wantFolders {
					t.Fatalf("folders = %+v", echo)
				}
				for dir, files := range echo.Skills {
					rel, err := filepath.Rel(r.Cwd, dir)
					if err != nil || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))) {
						t.Fatalf("skills folder %s is inside workspace %s", dir, r.Cwd)
					}
					if _, err := os.Stat(dir); !os.IsNotExist(err) {
						t.Fatalf("skills folder %s survived turn: %v", dir, err)
					}
					if _, reused := previous[dir]; reused {
						t.Fatalf("folder reused across turns: %s", dir)
					}
					var want map[string]string
					switch adapter {
					case "claude-code":
						want = map[string]string{".claude-plugin/plugin.json": "{\"name\":\"agister\"}\n", "skills/review/SKILL.md": "recorded review\n", "skills/style/SKILL.md": "recorded style\n"}
						if !hasSkillFlag(echo.Argv, "--plugin-dir", dir) {
							t.Fatalf("argv %q does not give %s", echo.Argv, dir)
						}
					case "pi":
						name := filepath.Base(dir)
						want = map[string]string{"SKILL.md": "recorded " + name + "\n"}
						if !hasSkillFlag(echo.Argv, "--skill", dir) {
							t.Fatalf("argv %q does not give %s", echo.Argv, dir)
						}
					case "opencode":
						want = map[string]string{"review/SKILL.md": "recorded review\n", "style/SKILL.md": "recorded style\n"}
						var config struct{ Skills struct{ Paths []string } }
						if err := json.Unmarshal([]byte(echo.Config), &config); err != nil || !reflect.DeepEqual(config.Skills.Paths, []string{dir}) {
							t.Fatalf("config %s, %v", echo.Config, err)
						}
					}
					if !reflect.DeepEqual(files, want) {
						t.Fatalf("files in %s = %+v, want %+v", dir, files, want)
					}
				}
				previous = echo.Skills
				// The skill-bearing turns resume a session created without skills under
				// the existing contract; adding skills must not break its continuation.
				r.ResumeSessionID = turn.ProviderSessionID
			}
		})
	}
}

func hasSkillFlag(args []string, flag, dir string) bool {
	for i := 0; i+1 < len(args); i++ {
		if args[i] == flag && args[i+1] == dir {
			return true
		}
	}
	return false
}

// stillRuntime is the real supervisor over the fakes run in process, its
// waits on a manual clock nothing advances: no turn times out and no grace
// passes.
func stillRuntime() supervisor.Runtime {
	return supervisor.Runtime{Starter: runtimetest.InProcess{Groups: supervisortest.NewGroups()}, Timer: clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)).Timer}
}

func skillRunner(t *testing.T, adapter string) (app.TurnRunner, []string) {
	t.Helper()
	transport := stillRuntime()
	switch adapter {
	case "claude-code":
		return AdaptClaudeCode(claudecode.New("claude", ClaudeCodeTransport{Supervisor: transport})), []string{"Read"}
	case "pi":
		return AdaptPi(pi.New("pi", t.TempDir(), PiTransport{Supervisor: transport})), []string{"read"}
	case "opencode":
		return AdaptOpenCode(opencode.New("opencode", OpenCodeTransport{Supervisor: transport})), []string{"skill"}
	case "codex":
		user := t.TempDir()
		return NewCodex("codex", filepath.Join(t.TempDir(), "homes"), func() (string, error) { return user, nil }, transport), []string{"read-only"}
	default:
		t.Fatalf("unknown adapter %s", adapter)
		return nil, nil
	}
}

// Bad input makes writing fail; the transport must never start the runtime.
func TestASkillWriteFailureStopsEachRuntimeBeforeItStarts(t *testing.T) {
	t.Parallel()
	for _, adapter := range []string{"claude-code", "pi", "opencode", "codex"} {
		t.Run(adapter, func(t *testing.T) {
			t.Parallel()
			runner, primitives := skillRunner(t, adapter)
			sink := &runtimetest.Recorder{}
			turn := runner.RunTurn(context.Background(), app.TurnRequest{Cwd: t.TempDir(), Prompt: "SCENARIO:approve", Timeout: time.Minute, Primitives: primitives, Skills: []app.TurnSkill{{Name: "../escape", Bytes: []byte("bad")}}}, sink)
			if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassInternal || !strings.Contains(turn.Error.Message, "not a folder's name") || len(sink.Processes) != 0 {
				t.Fatalf("turn %+v, processes %v", turn, sink.Processes)
			}
		})
	}
}

// Codex, as composed, gets a call's skills through a home of its thread's
// (ADR-021 rule 6): the fake reads its CODEX_HOME's skills/ while it runs.
// A fresh thread without skills runs with the user's home; one with skills
// gets a home, linking the user's skills but .system, kept by the thread
// it reported; a turn resuming it runs there with its own skills; a turn
// with skills resuming a thread of the user's home is refused unstarted.
func TestSkillsReachCodexThroughAHomeOfItsThread(t *testing.T) {
	t.Parallel()
	const thread = "01a0e850-b808-71c2-8401-53ba16d8ae18" // the fake's fresh thread
	user, root := t.TempDir(), filepath.Join(t.TempDir(), "homes")
	for path, text := range map[string]string{"auth.json": "{}", "skills/mine/SKILL.md": "user's mine\n", "skills/.system/bundled/SKILL.md": "codex's\n"} {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(user, path)), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(user, path), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	transport := stillRuntime()
	runner := NewCodex("codex", root, func() (string, error) { return user, nil }, transport)
	if identity, err := runner.Identity(context.Background()); err != nil || !identity.Skills {
		t.Fatalf("identity %+v, %v", identity, err)
	}
	review, style := app.TurnSkill{Name: "review", Bytes: []byte("recorded review\n")}, app.TurnSkill{Name: "style", Bytes: []byte("recorded style\n")}
	type echo struct {
		CodexHome  string   `json:"codex_home"`
		SkillNames []string `json:"skill_names"`
		Skills     map[string]map[string]string
	}
	home := filepath.Join(root, thread)
	for _, c := range []struct {
		resume string
		skills []app.TurnSkill
		home   string // "new": a fresh one under root
		names  []string
		files  map[string]string
	}{
		{"", nil, "", []string{}, nil},
		{"", []app.TurnSkill{review, style}, "new", []string{"mine", "review", "style"}, map[string]string{"review/SKILL.md": "recorded review\n", "style/SKILL.md": "recorded style\n"}},
		{thread, []app.TurnSkill{review}, home, []string{"mine", "review"}, map[string]string{"review/SKILL.md": "recorded review\n"}},
	} {
		sink := &runtimetest.Recorder{}
		turn := runner.RunTurn(context.Background(), app.TurnRequest{Prompt: "SCENARIO:approve", Cwd: t.TempDir(), Timeout: time.Minute, Primitives: []string{"read-only"}, ResumeSessionID: c.resume, Skills: c.skills}, sink)
		if turn.Status != run.Completed || turn.ProviderSessionID != thread || len(sink.Lines) == 0 {
			t.Fatalf("turn %+v", turn)
		}
		var got echo
		if err := json.Unmarshal([]byte(sink.Lines[0]), &got); err != nil {
			t.Fatal(err)
		}
		if c.home == "new" {
			if filepath.Dir(got.CodexHome) != root || got.CodexHome == home {
				t.Fatalf("fresh home %q is not a new one under %s", got.CodexHome, root)
			}
			c.home = got.CodexHome
		}
		var files map[string]map[string]string
		if c.files != nil {
			files = map[string]map[string]string{filepath.Join(c.home, "skills"): c.files}
		}
		if got.CodexHome != c.home || !reflect.DeepEqual(got.SkillNames, c.names) || len(got.Skills) != len(files) || len(files) > 0 && !reflect.DeepEqual(got.Skills, files) {
			t.Fatalf("resume %q, skills %d: echo %+v, want home %q, names %q, files %v", c.resume, len(c.skills), got, c.home, c.names, files)
		}
	}
	if names, _ := os.ReadDir(root); len(names) != 1 || names[0].Name() != thread {
		t.Fatalf("homes = %v, want the thread's alone", names)
	}

	sink := &runtimetest.Recorder{}
	turn := runner.RunTurn(context.Background(), app.TurnRequest{Prompt: "SCENARIO:approve", Cwd: t.TempDir(), Timeout: time.Minute, Primitives: []string{"read-only"}, ResumeSessionID: "019a0000-0000-7000-8000-000000000000", Skills: []app.TurnSkill{review}}, sink)
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassRefused || !strings.Contains(turn.Error.Message, "ran in the user's CODEX_HOME") || len(sink.Processes) != 0 {
		t.Fatalf("turn %+v, processes %v", turn, sink.Processes)
	}
}
