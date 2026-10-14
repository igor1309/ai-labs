package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"testing"
	"time"
)

// Closing the terminal cancels the call like Ctrl-C and kill do.
//
// Contract test: the OS signals shutdown is wired to, sent to this process.
// The timer only guards a hang.
//
// Serial: a signal is process-wide; it reaches whatever else the test
// binary runs.
func TestShutdownSignalsCancel(t *testing.T) {
	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP} {
		t.Run(sig.String(), func(t *testing.T) {
			// Keep an unhandled signal from ending the test binary.
			guard := make(chan os.Signal, 1)
			signal.Notify(guard, sig)
			defer signal.Stop(guard)

			ctx, stop := shutdown(context.Background())
			defer stop()
			if err := syscall.Kill(os.Getpid(), sig); err != nil {
				t.Fatal(err)
			}
			select {
			case <-ctx.Done():
			case <-time.After(10 * time.Second):
				t.Fatalf("%s did not cancel the context", sig)
			}
		})
	}
}
