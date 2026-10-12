package policy_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// verifying is the review with a verification of timeout and attempts.
func verifying(timeout time.Duration, attempts int) policy.Declared {
	return with(func(d *policy.Declared) { d.Verify = &policy.Verify{Timeout: timeout, MaxAttempts: attempts} })
}

// Rule 3: verify.max_attempts may not exceed the service's
// max_verify_attempts; it is invalid, never clamped.
func TestVerifyAttemptsAboveTheServiceCeilingAreInvalid(t *testing.T) {
	t.Parallel()
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
			t.Parallel()
			ceilinged := service
			ceilinged.MaxVerifyAttempts = c.ceiling
			_, err := policy.Compose(ceilinged, verifying(5*time.Minute, c.attempts), policy.Caller{})
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
// comes from the process or the caller.
func TestVerifyTimeoutAboveTheEffectiveTimeoutIsInvalid(t *testing.T) {
	t.Parallel()
	// The process's timeout is 20m.
	withCeiling := service
	withCeiling.MaxVerifyAttempts = 1
	minutes := func(n time.Duration) *time.Duration { d := n * time.Minute; return &d }
	cases := []struct {
		name    string
		process policy.Declared
		caller  policy.Caller
		problem string
	}{
		{"within the process's", verifying(20*time.Minute, 1), policy.Caller{}, ""},
		{"above the process's", verifying(21*time.Minute, 1), policy.Caller{}, "verify.timeout 21m0s exceeds the effective timeout 20m0s"},
		{"above the process's own 5m", with(func(d *policy.Declared) {
			d.Timeout = ptr(5 * time.Minute)
			d.Verify = &policy.Verify{Timeout: 10 * time.Minute, MaxAttempts: 1}
		}), policy.Caller{}, "verify.timeout 10m0s exceeds the effective timeout 5m0s"},
		{"above the caller's", verifying(10*time.Minute, 1), policy.Caller{Timeout: minutes(5)}, "verify.timeout 10m0s exceeds the effective timeout 5m0s"},
		{"within the caller's", verifying(5*time.Minute, 1), policy.Caller{Timeout: minutes(5)}, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			_, err := policy.Compose(withCeiling, c.process, c.caller)
			if c.problem == "" && err != nil {
				t.Fatal(err)
			}
			if c.problem != "" && (err == nil || !strings.Contains(err.Error(), c.problem)) {
				t.Fatalf("err = %v, want %q", err, c.problem)
			}
		})
	}
}
