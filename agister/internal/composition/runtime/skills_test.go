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

func skillRunner(t *testing.T, adapter string) (app.TurnRunner, []string) {
	t.Helper()
	transport := supervisor.Runtime{Starter: runtimetest.InProcess{Groups: supervisortest.NewGroups()}}
	switch adapter {
	case "claude-code":
		return AdaptClaudeCode(claudecode.New("claude", ClaudeCodeTransport{Supervisor: transport})), []string{"Read"}
	case "pi":
		return AdaptPi(pi.New("pi", t.TempDir(), PiTransport{Supervisor: transport})), []string{"read"}
	case "opencode":
		return AdaptOpenCode(opencode.New("opencode", OpenCodeTransport{Supervisor: transport})), []string{"skill"}
	default:
		t.Fatalf("unknown adapter %s", adapter)
		return nil, nil
	}
}

// Bad input makes writing fail; the transport must never start the runtime.
func TestASkillWriteFailureStopsEachRuntimeBeforeItStarts(t *testing.T) {
	t.Parallel()
	for _, adapter := range []string{"claude-code", "pi", "opencode"} {
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
