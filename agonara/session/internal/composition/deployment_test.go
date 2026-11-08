package composition

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type deploymentHarness struct {
	t                                    *testing.T
	dir, runner, old                     string
	env                                  []string
	initialWeb, initialSession, combined bool
}

func deploymentFixture(t *testing.T, topology, scenario string) *deploymentHarness {
	t.Helper()
	dir := t.TempDir()
	h := &deploymentHarness{t: t, dir: dir, runner: filepath.Join(dir, "bin", "agonara-session"), initialWeb: topology == "both" || topology == "web", initialSession: topology == "both" || topology == "session" || topology == "combined", combined: topology == "combined"}
	launchDir := filepath.Join(dir, "launch")
	for _, path := range []string{filepath.Dir(h.runner), launchDir} {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	h.old = "#!/bin/sh\n# old-runner\nexit 0\n"
	if h.combined {
		h.old = "#!/bin/sh\n# old-combined\nexit 0\n"
		writeFile(t, filepath.Join(dir, "single-owner"), []byte("previous-mode"))
	}
	script(t, h.runner, h.old)
	h.stage()
	for _, label := range []string{"ai.labs.agonara-session", "ai.labs.agonara-web"} {
		writeFile(t, filepath.Join(launchDir, label+".plist"), []byte("plist"))
	}
	if h.initialWeb {
		writeFile(t, filepath.Join(dir, "ai.labs.agonara-web"), nil)
	}
	if h.initialSession {
		writeFile(t, filepath.Join(dir, "ai.labs.agonara-session"), nil)
	}
	script(t, filepath.Join(dir, "launchctl"), `#!/bin/sh
printf '%s\n' "$*" >> "$SESSION_TEST_DIR/calls"
label=${2##*/}
case "$1" in
 print) [ -f "$SESSION_TEST_DIR/$label" ] && echo 'state = running' ;;
 bootout)
  if [ "$SESSION_TEST_CASE" = bad-stop ] && [ "$label" = ai.labs.agonara-web ]; then exit 1; fi
  rm -f "$SESSION_TEST_DIR/$label" ;;
 bootstrap)
  label=${3##*/}; label=${label%.plist}
  if [ -f "$SESSION_TEST_DIR/$label" ]; then echo duplicate-start >&2; exit 1; fi
  if [ "$label" = ai.labs.agonara-session ]; then
   if grep -Eq 'new-runner|old-combined' "$SESSION_TEST_DIR/bin/agonara-session" && [ -f "$SESSION_TEST_DIR/ai.labs.agonara-web" ]; then echo overlapping-owners >&2; exit 1; fi
   if [ "$SESSION_TEST_CASE" = bad-bootstrap ] && grep -q new-runner "$SESSION_TEST_DIR/bin/agonara-session"; then exit 1; fi
  fi
  touch "$SESSION_TEST_DIR/$label" ;;
 enable|disable) exit 0 ;;
esac
`)
	script(t, filepath.Join(dir, "sleep"), "#!/bin/sh\nexit 0\n")
	script(t, filepath.Join(dir, "curl"), `#!/bin/sh
printf '%s\n' "$*" >> "$SESSION_TEST_DIR/http-probes"
if [ -f "$SESSION_TEST_DIR/restore-unavailable" ]; then printf 000; else printf 401; fi
`)
	h.env = append(os.Environ(), "AGONARA_SESSION_HOME="+dir, "AGONARA_SESSION_LAUNCH_DIR="+launchDir, "AGONARA_SESSION_ENV_FILE="+filepath.Join(dir, "env"), "AGONARA_SESSION_LAUNCHCTL="+filepath.Join(dir, "launchctl"), "AGONARA_SESSION_CURL="+filepath.Join(dir, "curl"), "AGONARA_SESSION_SLEEP="+filepath.Join(dir, "sleep"), "SESSION_TEST_DIR="+dir, "SESSION_TEST_CASE="+scenario)
	return h
}
func script(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o700); err != nil {
		t.Fatal(err)
	}
}
func (h *deploymentHarness) stage() {
	script(h.t, h.runner+".new", `#!/bin/sh
# new-runner
printf '%s\n' "$*" >> "$SESSION_TEST_DIR/probes"
case "$*" in
 *-check-config*) [ "$SESSION_TEST_CASE" != bad-config ] ;;
 *-check-running*) [ "$SESSION_TEST_CASE" != bad-health ] ;;
esac
`)
}
func (h *deploymentHarness) run(action string) (string, error) {
	h.t.Helper()
	cmd := exec.Command("bash", "../../deploy/migrate.sh", action)
	cmd.Env = h.env
	data, err := cmd.CombinedOutput()
	return string(data), err
}
func (h *deploymentHarness) assertExists(name string, want bool) {
	h.t.Helper()
	_, err := os.Stat(filepath.Join(h.dir, name))
	if want && err != nil || !want && !os.IsNotExist(err) {
		h.t.Fatalf("%s exists=%v want=%v err=%v", name, err == nil, want, err)
	}
}
func (h *deploymentHarness) assertRestored() {
	h.t.Helper()
	data, err := os.ReadFile(h.runner)
	if err != nil || string(data) != h.old {
		h.t.Fatalf("restored binary: %s %v", data, err)
	}
	h.assertExists("ai.labs.agonara-web", h.initialWeb)
	h.assertExists("ai.labs.agonara-session", h.initialSession)
	h.assertExists("single-owner", h.combined)
	if h.combined {
		data, err := os.ReadFile(filepath.Join(h.dir, "single-owner"))
		if err != nil || string(data) != "previous-mode" {
			h.t.Fatalf("previous mode lost: %s %v", data, err)
		}
	}
}
func (h *deploymentHarness) assertHandoff() {
	h.t.Helper()
	data, err := os.ReadFile(filepath.Join(h.dir, "calls"))
	if err != nil {
		h.t.Fatal(err)
	}
	calls := strings.Split(strings.TrimSpace(string(data)), "\n")
	stopped := map[string]bool{}
	starts := 0
	for _, call := range calls {
		fields := strings.Fields(call)
		if fields[0] == "bootout" {
			stopped[filepath.Base(fields[1])] = true
		}
		if fields[0] == "bootstrap" {
			starts++
			if h.initialWeb && !stopped["ai.labs.agonara-web"] || h.initialSession && !stopped["ai.labs.agonara-session"] {
				h.t.Fatalf("started before each previous owner stopped: %s", data)
			}
		}
	}
	if starts != 1 {
		h.t.Fatalf("replacement starts=%d: %s", starts, data)
	}
	h.assertExists("ai.labs.agonara-web", false)
	h.assertExists("ai.labs.agonara-session", true)
	h.assertExists("single-owner", true)
}

// Contract test: the deployment shell uses isolated launchctl, runner, HTTP and wait processes.
func TestDeploymentHandoffAndRollbackNeverOverlapPollers(t *testing.T) {
	t.Parallel()
	for _, topology := range []string{"both", "web", "session", "none", "combined"} {
		t.Run(topology, func(t *testing.T) {
			t.Parallel()
			h := deploymentFixture(t, topology, "success")
			if out, err := h.run("activate"); err != nil {
				t.Fatalf("activate: %v %s", err, out)
			}
			h.assertHandoff()
			if out, err := h.run("rollback"); err != nil {
				t.Fatalf("rollback: %v %s", err, out)
			}
			h.assertRestored()
			if h.initialWeb || h.combined {
				data, err := os.ReadFile(filepath.Join(h.dir, "http-probes"))
				if err != nil || !strings.Contains(string(data), "http://127.0.0.1:8740/") {
					t.Fatalf("restored HTTP not gated: %s %v", data, err)
				}
			}
		})
	}
}

// Contract test: activation failures restore each deployment topology through real shell processes.
func TestDeploymentFailuresPreservePreviousBinaryJobsAndMode(t *testing.T) {
	t.Parallel()
	for _, topology := range []string{"both", "combined"} {
		for _, scenario := range []string{"bad-config", "bad-stop", "bad-bootstrap", "bad-health"} {
			// A combined-only installation has no standalone web job to fail stopping.
			if topology == "combined" && scenario == "bad-stop" {
				continue
			}
			t.Run(topology+"/"+scenario, func(t *testing.T) {
				t.Parallel()
				h := deploymentFixture(t, topology, scenario)
				out, err := h.run("activate")
				if err == nil {
					t.Fatalf("failure accepted: %s", out)
				}
				h.assertRestored()
				if scenario == "bad-config" {
					if data, _ := os.ReadFile(filepath.Join(h.dir, "calls")); len(data) != 0 {
						t.Fatalf("configuration touched services: %s", data)
					}
				}
			})
		}
	}
}

// Contract test: a second shell activation and rollback retain automatic-update mode.
func TestSecondDeploymentRollbackKeepsCombinedMode(t *testing.T) {
	t.Parallel()
	h := deploymentFixture(t, "both", "success")
	if out, err := h.run("activate"); err != nil {
		t.Fatalf("first: %v %s", err, out)
	}
	previous, err := os.ReadFile(h.runner)
	if err != nil {
		t.Fatal(err)
	}
	h.stage()
	if out, err := h.run("activate"); err != nil {
		t.Fatalf("second: %v %s", err, out)
	}
	if out, err := h.run("rollback"); err != nil {
		t.Fatalf("rollback: %v %s", err, out)
	}
	data, err := os.ReadFile(h.runner)
	if err != nil || string(data) != string(previous) {
		t.Fatalf("previous combined binary: %s %v", data, err)
	}
	h.assertExists("single-owner", true)
	h.assertExists("ai.labs.agonara-session", true)
	h.assertExists("ai.labs.agonara-web", false)
	if data, err := os.ReadFile(filepath.Join(h.dir, "http-probes")); err != nil || len(data) == 0 {
		t.Fatalf("combined restore skipped HTTP: %v", err)
	}
}

// Contract test: launchctl registration succeeds but the restored HTTP owner exits before serving.
func TestRollbackRefusesUnavailableRestoredHTTPAndKeepsPreviousMode(t *testing.T) {
	t.Parallel()
	for _, topology := range []string{"both", "combined"} {
		t.Run(topology, func(t *testing.T) {
			t.Parallel()
			h := deploymentFixture(t, topology, "success")
			if out, err := h.run("activate"); err != nil {
				t.Fatalf("activate: %v %s", err, out)
			}
			writeFile(t, filepath.Join(h.dir, "restore-unavailable"), nil)
			out, err := h.run("rollback")
			if err == nil || strings.Contains(out, "previous services restored") {
				t.Fatalf("unavailable restore reported success: %v %s", err, out)
			}
			h.assertRestored()
			if data, err := os.ReadFile(filepath.Join(h.dir, "http-probes")); err != nil || len(strings.Split(strings.TrimSpace(string(data)), "\n")) != 10 {
				t.Fatalf("restore availability checks: %s %v", data, err)
			}
			h.assertExists("rollback/agonara-session", true)
		})
	}
}

func writeFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
