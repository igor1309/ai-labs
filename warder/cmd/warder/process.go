package main

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// osProcesses executes commands as processes of the operating system. It
// is the only place the module starts one.
type osProcesses struct {
	// waitDelay is how long a command that exited or was killed is waited
	// for to release its output: a child of it that holds the pipes cannot
	// block the call for longer.
	waitDelay time.Duration
}

// Execute runs the command under ctx and returns what it wrote to its
// standard output. A command that fails returns an error with its exit
// status and what it wrote to its standard error. When ctx ends the
// process is killed and the call returns an error that wraps ctx's cause.
func (p osProcesses) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	command := exec.CommandContext(ctx, name, args...)
	command.WaitDelay = p.waitDelay
	// Output keeps the command's standard error in its exit error.
	stdout, err := command.Output()
	if err == nil {
		return stdout, nil
	}
	if ctx.Err() != nil {
		return nil, fmt.Errorf("ended with its context: %w", context.Cause(ctx))
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		if text := strings.TrimSpace(string(exit.Stderr)); text != "" {
			return nil, fmt.Errorf("%w: %s", err, text)
		}
	}
	return nil, err
}
