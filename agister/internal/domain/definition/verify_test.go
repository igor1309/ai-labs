package definition_test

import (
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// verifyingProcess is a process with a checkout and the given verify block,
// indented under verify:.
func verifyingProcess(verify string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Implement it.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
workspace:
  checkout: candidate_revision
output:
  format: text
verify:
` + verify
}

const verifyBlock = `  command: go test ./...
  timeout: 10m
  max_attempts: 3
  instruction: The verification command failed. Fix the cause, not the check.
`

func TestVerifyIsParsedAsDeclared(t *testing.T) {
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(verifyBlock)))
	if err != nil {
		t.Fatal(err)
	}
	want := definition.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "The verification command failed. Fix the cause, not the check."}
	if process.Verify == nil || *process.Verify != want {
		t.Fatalf("verify = %+v", process.Verify)
	}
	without, err := definition.ParseProcess(doc(definition.KindProcess, "p", strings.TrimSuffix(verifyingProcess(""), "verify:\n")))
	if err != nil || without.Verify != nil {
		t.Fatalf("a process without verify: %+v, %v", without.Verify, err)
	}
}

// Rule 1: every field is required, and there is no default for any of them.
func TestVerifyWithoutAFieldIsInvalid(t *testing.T) {
	for _, field := range []string{"command", "timeout", "max_attempts", "instruction"} {
		t.Run(field, func(t *testing.T) {
			var kept []string
			for _, line := range strings.SplitAfter(verifyBlock, "\n") {
				if !strings.HasPrefix(line, "  "+field+":") {
					kept = append(kept, line)
				}
			}
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(strings.Join(kept, ""))))
			if err == nil || !strings.Contains(err.Error(), "verify."+field+": is required") {
				t.Fatalf("err = %v", err)
			}
		})
	}
	cases := map[string]struct{ verify, want string }{
		"empty command":     {strings.Replace(verifyBlock, "go test ./...", `""`, 1), "verify.command: must not be empty"},
		"empty instruction": {strings.Replace(verifyBlock, "The verification command failed. Fix the cause, not the check.", `""`, 1), "verify.instruction: must not be empty"},
		"zero timeout":      {strings.Replace(verifyBlock, "10m", "0s", 1), `verify.timeout: invalid duration "0s"`},
		"negative timeout":  {strings.Replace(verifyBlock, "10m", "-1m", 1), `verify.timeout: invalid duration "-1m"`},
		"unknown field":     {verifyBlock + "  on_failure: stop\n", "verify.on_failure: unknown field"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(c.verify)))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}

// Rule 2: the first run is attempt 1, so fewer is invalid, never clamped.
func TestVerifyMaxAttemptsBelowOneIsInvalid(t *testing.T) {
	for _, attempts := range []string{"0", "-1"} {
		t.Run(attempts, func(t *testing.T) {
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(strings.Replace(verifyBlock, "max_attempts: 3", "max_attempts: "+attempts, 1))))
			if err == nil || !strings.Contains(err.Error(), "verify.max_attempts: must be at least 1") {
				t.Fatalf("err = %v", err)
			}
		})
	}
	if _, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(strings.Replace(verifyBlock, "max_attempts: 3", "max_attempts: 1", 1)))); err != nil {
		t.Fatalf("one attempt: %v", err)
	}
}

// Rule 5 (ADR-002 rule 2): verification runs only in a checkout the call
// owns.
func TestVerifyWithoutACheckoutIsInvalid(t *testing.T) {
	text := strings.Replace(verifyingProcess(verifyBlock), "workspace:\n  checkout: candidate_revision\n", "", 1)
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", text))
	if err == nil || !strings.Contains(err.Error(), "verify: requires workspace.checkout") {
		t.Fatalf("err = %v", err)
	}
}

// The ceiling of verify.max_attempts is a service setting, 1 unless set.
func TestServiceMaxVerifyAttempts(t *testing.T) {
	base := "schema = \"agister.service/v1alpha1\"\nmax_timeout = \"1h\"\npermissions = [\"read\"]\nwriting = []\n"
	cases := []struct {
		setting string
		want    int
		problem string
	}{
		{"", 1, ""},
		{"max_verify_attempts = 3\n", 3, ""},
		{"max_verify_attempts = 0\n", 0, "max_verify_attempts: must be a positive integer"},
		{"max_verify_attempts = \"3\"\n", 0, "max_verify_attempts: must be a positive integer"},
	}
	for _, c := range cases {
		service, err := definition.ParseService(doc(definition.KindService, "service", base+c.setting))
		if c.problem == "" && (err != nil || service.MaxVerifyAttempts != c.want) {
			t.Errorf("%q: %d, %v", c.setting, service.MaxVerifyAttempts, err)
		}
		if c.problem != "" && (err == nil || !strings.Contains(err.Error(), c.problem)) {
			t.Errorf("%q: err = %v", c.setting, err)
		}
	}
}
