package policy_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

func verify(timeout string, attempts int) string {
	return fmt.Sprintf("verify:\n  command: go test ./...\n  timeout: %s\n  max_attempts: %d\n  instruction: Fix the cause.\n", timeout, attempts)
}

// Rule 3: verify.max_attempts may not exceed the service's
// max_verify_attempts; it is invalid, never clamped.
func TestVerifyAttemptsAboveTheServiceCeilingAreInvalid(t *testing.T) {
	pol := researchPolicy(t)
	cases := []struct {
		ceiling, attempts int
		problem           string
	}{
		{1, 1, ""},
		{3, 3, ""},
		{1, 2, "verify.max_attempts 2 exceeds the service limit max_verify_attempts 1"},
		{3, 4, "verify.max_attempts 4 exceeds the service limit max_verify_attempts 3"},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("%d of %d", c.attempts, c.ceiling), func(t *testing.T) {
			ceilinged := service
			ceilinged.MaxVerifyAttempts = c.ceiling
			_, err := policy.Compose(ceilinged, &pol, process(t, verify("5m", c.attempts)), policy.Caller{})
			if c.problem == "" && err != nil {
				t.Fatal(err)
			}
			if c.problem != "" && (err == nil || !strings.Contains(err.Error(), c.problem)) {
				t.Fatalf("err = %v, want %q", err, c.problem)
			}
		})
	}
}

// Rule 4: a run may not outlast the call, whether the effective timeout
// comes from the policy, the process or the caller.
func TestVerifyTimeoutAboveTheEffectiveTimeoutIsInvalid(t *testing.T) {
	pol := researchPolicy(t) // timeout 20m
	withCeiling := service
	withCeiling.MaxVerifyAttempts = 1
	minutes := func(n time.Duration) *time.Duration { d := n * time.Minute; return &d }
	cases := []struct {
		name    string
		extra   string
		caller  policy.Caller
		problem string
	}{
		{"within the policy's", verify("20m", 1), policy.Caller{}, ""},
		{"above the policy's", verify("21m", 1), policy.Caller{}, "verify.timeout 21m0s exceeds the effective timeout 20m0s"},
		{"above the process's", "timeout: 5m\n" + verify("10m", 1), policy.Caller{}, "verify.timeout 10m0s exceeds the effective timeout 5m0s"},
		{"above the caller's", verify("10m", 1), policy.Caller{Timeout: minutes(5)}, "verify.timeout 10m0s exceeds the effective timeout 5m0s"},
		{"within the caller's", verify("5m", 1), policy.Caller{Timeout: minutes(5)}, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := policy.Compose(withCeiling, &pol, process(t, c.extra), c.caller)
			if c.problem == "" && err != nil {
				t.Fatal(err)
			}
			if c.problem != "" && (err == nil || !strings.Contains(err.Error(), c.problem)) {
				t.Fatalf("err = %v, want %q", err, c.problem)
			}
		})
	}
}
