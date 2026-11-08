package composition

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Contract test: the deployment shell executes against per-test launchctl, runner and curl processes.
func TestDeploymentHandoffAndRollbackNeverOverlapPollers(t *testing.T) {
	t.Parallel()
	for _, scenario := range []string{"activate", "bad-config", "bad-stop", "bad-bootstrap", "bad-health", "rollback"} {
		t.Run(scenario, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			binDir := filepath.Join(dir, "bin")
			launchDir := filepath.Join(dir, "launch")
			for _, p := range []string{binDir, launchDir} {
				if err := os.Mkdir(p, 0o700); err != nil {
					t.Fatal(err)
				}
			}
			writeScript := func(path, body string) {
				t.Helper()
				if err := os.WriteFile(path, []byte(body), 0o700); err != nil {
					t.Fatal(err)
				}
			}
			runner := filepath.Join(binDir, "agonara-session")
			old := "#!/bin/sh\n# old-runner\nexit 0\n"
			writeScript(runner, old)
			writeScript(runner+".new", `#!/bin/sh
# new-runner
printf '%s\n' "$*" >> "$SESSION_TEST_DIR/probes"
case "$*" in
 *-check-config*) [ "$SESSION_TEST_CASE" != bad-config ] ;;
 *-check-running*) [ "$SESSION_TEST_CASE" != bad-health ] ;;
esac
`)
			for _, label := range []string{"ai.labs.agonara-session", "ai.labs.agonara-web"} {
				writeFile(t, filepath.Join(launchDir, label+".plist"), []byte("plist"))
				writeFile(t, filepath.Join(dir, label), []byte("loaded"))
			}
			writeScript(filepath.Join(dir, "launchctl"), `#!/bin/sh
printf '%s\n' "$*" >> "$SESSION_TEST_DIR/calls"
label=${2##*/}
case "$1" in
 print) [ -f "$SESSION_TEST_DIR/$label" ] && echo 'state = running' ;;
 bootout) if [ "$SESSION_TEST_CASE" = bad-stop ] && [ "$label" = ai.labs.agonara-web ]; then exit 1; fi; rm -f "$SESSION_TEST_DIR/$label" ;;
 bootstrap)
  label=${3##*/}; label=${label%.plist}
  if [ "$SESSION_TEST_CASE" = bad-bootstrap ] && [ "$label" = ai.labs.agonara-session ] && grep -q new-runner "$SESSION_TEST_DIR/bin/agonara-session"; then exit 1; fi
  touch "$SESSION_TEST_DIR/$label"
  ;;
 enable|disable) exit 0 ;;
esac
`)
			writeScript(filepath.Join(dir, "sleep"), "#!/bin/sh\nexit 0\n")
			writeScript(filepath.Join(dir, "curl"), "#!/bin/sh\nprintf 401\n")
			env := append(os.Environ(), "AGONARA_SESSION_HOME="+dir, "AGONARA_SESSION_LAUNCH_DIR="+launchDir, "AGONARA_SESSION_ENV_FILE="+filepath.Join(dir, "env"), "AGONARA_SESSION_LAUNCHCTL="+filepath.Join(dir, "launchctl"), "SESSION_TEST_DIR="+dir, "SESSION_TEST_CASE="+scenario, "PATH="+dir+":"+os.Getenv("PATH"))
			run := func(action string) (string, error) {
				t.Helper()
				cmd := exec.Command("bash", "../../deploy/migrate.sh", action)
				cmd.Env = env
				data, err := cmd.CombinedOutput()
				return string(data), err
			}
			output, err := run("activate")
			if scenario == "bad-config" || scenario == "bad-stop" || scenario == "bad-bootstrap" || scenario == "bad-health" {
				if err == nil {
					t.Fatalf("failure accepted %s", output)
				}
				data, _ := os.ReadFile(runner)
				if string(data) != old {
					t.Fatalf("old binary not restored: %s %s", data, output)
				}
				for _, label := range []string{"ai.labs.agonara-session", "ai.labs.agonara-web"} {
					if _, err := os.Stat(filepath.Join(dir, label)); err != nil {
						t.Fatalf("old service absent: %s %s", label, output)
					}
				}
			} else {
				if err != nil {
					t.Fatalf("%v %s", err, output)
				}
				data, _ := os.ReadFile(filepath.Join(dir, "calls"))
				calls := string(data)
				webStop := strings.Index(calls, "bootout gui/")
				sessionStart := strings.Index(calls, "bootstrap gui/")
				if webStop < 0 || sessionStart < webStop || strings.Count(calls, "bootstrap gui/") != 1 {
					t.Fatalf("handoff %s", calls)
				}
				if _, err := os.Stat(filepath.Join(dir, "ai.labs.agonara-web")); !os.IsNotExist(err) {
					t.Fatal("standalone web still loaded")
				}
				if scenario == "rollback" {
					if output, err = run("rollback"); err != nil {
						t.Fatalf("%v %s", err, output)
					}
					data, _ := os.ReadFile(runner)
					if string(data) != old {
						t.Fatalf("rollback binary %s", data)
					}
				}
			}
			if scenario == "bad-config" {
				if data, _ := os.ReadFile(filepath.Join(dir, "calls")); len(data) > 0 {
					t.Fatalf("bad config touched services: %s", data)
				}
			}
		})
	}
}

func writeFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
