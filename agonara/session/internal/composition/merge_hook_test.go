package composition

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Contract test: the merge-hook shell runs against isolated git, Go and activation processes.
func TestMergeHookStagesUntilExplicitHandoffAndNeverActivatesFailedBuilds(t *testing.T) {
	t.Parallel()
	hook, err := filepath.Abs("../../deploy/merge-hook.sh")
	if err != nil {
		t.Fatal(err)
	}
	for _, marked := range []bool{false, true} {
		for _, scenario := range []string{"success", "tests-fail", "build-fail"} {
			name := scenario + "/unmarked"
			if marked {
				name = scenario + "/marked"
			}
			t.Run(name, func(t *testing.T) {
				t.Parallel()
				dir := t.TempDir()
				module := filepath.Join(dir, "agonara", "session")
				home := filepath.Join(dir, "runtime")
				if err := os.MkdirAll(filepath.Join(home, "bin"), 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.MkdirAll(module, 0o700); err != nil {
					t.Fatal(err)
				}
				// Prepared configuration and legacy services exist; a merge must leave their first handoff explicit.
				unchanged := map[string]string{"bin/agonara-session": "legacy-binary", "legacy.plist": "prepared-plist", "probe.env": "prepared-settings", "session-loaded": "loaded", "web-loaded": "loaded"}
				for path, data := range unchanged {
					writeFile(t, filepath.Join(home, path), []byte(data))
				}
				if marked {
					writeFile(t, filepath.Join(home, "single-owner"), []byte("mode"))
				}
				script(t, filepath.Join(dir, "git"), `#!/bin/sh
case "$*" in
 'rev-parse --abbrev-ref HEAD') echo trunk ;;
 'rev-parse -q --verify ORIG_HEAD') echo previous ;;
 'rev-parse --short HEAD') echo candidate ;;
 diff*) echo agonara/session/internal/flow/service.go ;;
 *) exit 2 ;;
esac
`)
				script(t, filepath.Join(dir, "go"), `#!/bin/sh
printf '%s\n' "$*" >> "$HOOK_TEST_DIR/go-calls"
case "$1" in
 test) [ "$HOOK_TEST_CASE" != tests-fail ] ;;
 build)
  [ "$HOOK_TEST_CASE" != build-fail ] || exit 1
  printf staged-runner > "$3" ;;
 *) exit 2 ;;
esac
`)
				script(t, filepath.Join(dir, "activate"), `#!/bin/sh
[ -f "$AGONARA_SESSION_HOME/bin/agonara-session.new" ] || exit 2
printf '%s\n' "$*" >> "$HOOK_TEST_DIR/activations"
`)
				log := filepath.Join(dir, "hook.log")
				cmd := exec.Command("bash", hook, "run")
				cmd.Dir = dir
				cmd.Env = append(os.Environ(), "AGONARA_SESSION_HOME="+home, "AGONARA_SESSION_MERGE_LOG="+log, "AGONARA_SESSION_GIT="+filepath.Join(dir, "git"), "AGONARA_SESSION_GO="+filepath.Join(dir, "go"), "AGONARA_SESSION_MIGRATE="+filepath.Join(dir, "activate"), "HOOK_TEST_DIR="+dir, "HOOK_TEST_CASE="+scenario)
				if output, err := cmd.CombinedOutput(); err != nil {
					t.Fatalf("hook: %v %s", err, output)
				}
				calls, err := os.ReadFile(filepath.Join(dir, "go-calls"))
				if err != nil {
					t.Fatal(err)
				}
				want := []string{"test -count=1 -timeout 1m ./..."}
				if scenario != "tests-fail" {
					want = append(want, "build -o "+filepath.Join(home, "bin", "agonara-session.new")+" ./cmd/agonara-session")
				}
				if !reflect.DeepEqual(strings.Split(strings.TrimSpace(string(calls)), "\n"), want) {
					t.Fatalf("checks/build: %s", calls)
				}
				activation, activationErr := os.ReadFile(filepath.Join(dir, "activations"))
				if marked && scenario == "success" {
					if activationErr != nil || string(activation) != "activate\n" {
						t.Fatalf("established mode did not activate: %s %v", activation, activationErr)
					}
				} else if !os.IsNotExist(activationErr) {
					t.Fatalf("unexpected activation: %s %v", activation, activationErr)
				}
				staged, stageErr := os.ReadFile(filepath.Join(home, "bin", "agonara-session.new"))
				if scenario == "success" {
					if stageErr != nil || string(staged) != "staged-runner" {
						t.Fatalf("not staged: %s %v", staged, stageErr)
					}
				} else if !os.IsNotExist(stageErr) {
					t.Fatalf("failed build staged: %s %v", staged, stageErr)
				}
				for path, want := range unchanged {
					data, err := os.ReadFile(filepath.Join(home, path))
					if err != nil || string(data) != want {
						t.Fatalf("merge changed live %s: %s %v", path, data, err)
					}
				}
				content, err := os.ReadFile(log)
				if err != nil {
					t.Fatal(err)
				}
				if !marked && scenario == "success" && !strings.Contains(string(content), "activate explicitly") {
					t.Fatalf("missing staging result: %s", content)
				}
				if scenario != "success" && !strings.Contains(string(content), "FAILED") {
					t.Fatalf("missing failure result: %s", content)
				}
			})
		}
	}
}
