package composition

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
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
  if [ -f "$SESSION_TEST_DIR/$label.disabled" ]; then echo disabled-start >&2; exit 1; fi
  touch "$SESSION_TEST_DIR/$label" ;;
 enable) rm -f "$SESSION_TEST_DIR/$label.disabled" ;;
 disable) touch "$SESSION_TEST_DIR/$label.disabled" ;;
esac
`)
	script(t, filepath.Join(dir, "touch"), `#!/bin/sh
if [ "$SESSION_TEST_CASE" = bad-marker ] && [ "$1" = "$SESSION_TEST_DIR/single-owner" ]; then
 printf '%s\n' "$1" >> "$SESSION_TEST_DIR/marker-write-failures"
 echo 'marker write failed' >&2
 exit 1
fi
exec /usr/bin/touch "$@"
`)
	script(t, filepath.Join(dir, "sleep"), "#!/bin/sh\nexit 0\n")
	script(t, filepath.Join(dir, "curl"), `#!/bin/sh
printf '%s\n' "$*" >> "$SESSION_TEST_DIR/http-probes"
if [ -f "$SESSION_TEST_DIR/restore-unavailable" ]; then printf 000; else printf 401; fi
`)
	// Unloaded jobs start disabled so bootstrap must enable them persistently.
	if !h.initialSession {
		writeFile(t, filepath.Join(dir, "ai.labs.agonara-session.disabled"), nil)
	}
	if !h.initialWeb {
		writeFile(t, filepath.Join(dir, "ai.labs.agonara-web.disabled"), nil)
	}
	h.env = append(os.Environ(), "AGONARA_SESSION_HOME="+dir, "AGONARA_SESSION_LAUNCH_DIR="+launchDir, "AGONARA_SESSION_ENV_FILE="+filepath.Join(dir, "env"), "AGONARA_SESSION_LAUNCHCTL="+filepath.Join(dir, "launchctl"), "AGONARA_SESSION_CURL="+filepath.Join(dir, "curl"), "AGONARA_SESSION_SLEEP="+filepath.Join(dir, "sleep"), "SESSION_TEST_DIR="+dir, "SESSION_TEST_CASE="+scenario, "PATH="+dir+string(os.PathListSeparator)+os.Getenv("PATH"))
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
 *-check-running*) [ "$SESSION_TEST_CASE" != bad-health ] && [ "$SESSION_TEST_CASE" != standalone-port ] ;;
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
	if h.initialWeb {
		h.assertExists("ai.labs.agonara-web.disabled", false)
	}
	if h.initialSession {
		h.assertExists("ai.labs.agonara-session.disabled", false)
	}
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
	h.assertExists("ai.labs.agonara-web.disabled", true)
	h.assertExists("ai.labs.agonara-session.disabled", false)
	h.assertTransitions(h.activationCalls())
}

// Assert every persistent enable/disable transition together with the owner handoff.
func (h *deploymentHarness) assertTransitions(want []string) {
	h.t.Helper()
	data, err := os.ReadFile(filepath.Join(h.dir, "calls"))
	if err != nil {
		h.t.Fatal(err)
	}
	var got []string
	domain := "gui/" + strconv.Itoa(os.Getuid())
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 || fields[0] == "print" {
			continue
		}
		label := filepath.Base(fields[1])
		if fields[0] == "bootstrap" {
			if len(fields) != 3 {
				h.t.Fatalf("invalid bootstrap: %q", line)
			}
			label = strings.TrimSuffix(filepath.Base(fields[2]), ".plist")
			if fields[1] != domain || fields[2] != filepath.Join(h.dir, "launch", label+".plist") {
				h.t.Fatalf("wrong bootstrap target: %q", line)
			}
		} else if len(fields) != 2 || fields[1] != domain+"/"+label {
			h.t.Fatalf("wrong service target: %q", line)
		}
		got = append(got, fields[0]+":"+label)
	}
	if !reflect.DeepEqual(got, want) {
		h.t.Fatalf("launchd transitions=%v want=%v", got, want)
	}
}
func (h *deploymentHarness) activationCalls() []string {
	var calls []string
	if h.initialWeb {
		calls = append(calls, "bootout:ai.labs.agonara-web")
	}
	if h.initialSession {
		calls = append(calls, "bootout:ai.labs.agonara-session")
	}
	return append(calls, "disable:ai.labs.agonara-web", "enable:ai.labs.agonara-session", "bootstrap:ai.labs.agonara-session")
}
func (h *deploymentHarness) restorationCalls(stopReplacement bool) []string {
	var calls []string
	if stopReplacement {
		calls = append(calls, "bootout:ai.labs.agonara-session")
	}
	if h.initialWeb {
		calls = append(calls, "enable:ai.labs.agonara-web", "bootstrap:ai.labs.agonara-web")
	}
	if h.initialSession {
		calls = append(calls, "enable:ai.labs.agonara-session", "bootstrap:ai.labs.agonara-session")
	}
	return calls
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
			h.assertTransitions(append(h.activationCalls(), h.restorationCalls(true)...))
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
	for _, topology := range []string{"both", "web", "session", "none", "combined"} {
		for _, scenario := range []string{"bad-config", "bad-stop", "bad-bootstrap", "bad-health", "bad-marker"} {
			// Only installations with a loaded standalone web job can fail stopping it.
			if topology != "both" && topology != "web" && scenario == "bad-stop" {
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
				if scenario == "bad-marker" {
					data, readErr := os.ReadFile(filepath.Join(h.dir, "marker-write-failures"))
					if readErr != nil || string(data) != filepath.Join(h.dir, "single-owner")+"\n" || !strings.Contains(out, "activation failed; restoring previous services") || strings.Contains(out, "single reading owner active") {
						t.Fatalf("marker failure skipped rollback: %v %s %s", readErr, data, out)
					}
				}
				if scenario != "bad-config" {
					want := h.activationCalls()
					if scenario == "bad-stop" {
						want = []string{"bootout:ai.labs.agonara-web"}
					} else {
						want = append(want, h.restorationCalls(scenario != "bad-bootstrap")...)
					}
					h.assertTransitions(want)
				}
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

// Contract test: activation rolls back when its combined probe rejects an isolated server at the configured port.
func TestDeploymentRollsBackWhenStandaloneOwnsExpectedPort(t *testing.T) {
	t.Parallel()
	h := deploymentFixture(t, "both", "standalone-port")
	out, err := h.run("activate")
	if err == nil || !strings.Contains(out, "activation failed") || strings.Contains(out, "single reading owner active") {
		t.Fatalf("%v %s", err, out)
	}
	h.assertRestored()
	probes, err := os.ReadFile(filepath.Join(h.dir, "probes"))
	if err != nil || strings.Count(string(probes), "-check-running") != 10 {
		t.Fatalf("probes %s %v", probes, err)
	}
}
