package supervisor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"hash"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// Commands runs verification commands: `bash -c <command>` in the call's
// checkout, in a process group of its own, with the operator's
// environment. The group is recorded like a runtime's (see Ref), so
// Processes reaps it after a killed CLI.
type Commands struct {
	// KillGrace bounds reading output that something outside the group
	// holds open after the group is gone; zero means 5s.
	KillGrace time.Duration
}

// Run runs the command until it exits, its timeout passes or ctx ends.
// On a timeout or cancellation the whole group is killed; after an exit,
// whatever the command left running in its group is killed too.
func (c Commands) Run(ctx context.Context, request app.CommandRequest, started func(ref string) error) (result app.CommandResult) {
	grace := c.KillGrace
	if grace == 0 {
		grace = defaultKillGrace
	}
	output := &boundedOutput{bound: request.Bound, digest: sha256.New()}
	defer func() {
		result.Head, result.Tail, result.Bytes, result.SHA256 = output.result()
	}()

	// A plain pipe: Wait returns when bash exits, not when every holder of
	// the output has closed it.
	reader, writer, err := os.Pipe()
	if err != nil {
		result.Error = err.Error()
		return result
	}
	defer reader.Close()
	command := exec.Command("bash", "-c", request.Command)
	command.Dir = request.Dir
	command.Stdout, command.Stderr = writer, writer
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	err = command.Start()
	writer.Close()
	if err != nil {
		result.Error = err.Error()
		return result
	}
	pid := command.Process.Pid
	// On record before anything else, as a runtime's process is; a group
	// that cannot be recorded is killed while its ID is still ours.
	recorded := started(Ref(pid, ""))
	if recorded == nil {
		if token, err := Token(ctx, pid); err == nil {
			recorded = started(Ref(pid, token))
		}
	}
	if recorded != nil {
		result.Error = recorded.Error()
		_ = syscall.Kill(-pid, syscall.SIGKILL)
	}

	read := make(chan struct{})
	go func() {
		defer close(read)
		_, _ = io.Copy(output, reader)
	}()

	// The group is killed only while it is known to exist: once bash is
	// waited for, its group ID may be reused.
	var mu sync.Mutex
	reaped := false
	kill := func() {
		mu.Lock()
		defer mu.Unlock()
		if !reaped {
			_ = syscall.Kill(-pid, syscall.SIGKILL)
		}
	}
	exited, watched := make(chan struct{}), make(chan struct{})
	var timedOut, cancelled bool
	go func() {
		defer close(watched)
		timer := time.NewTimer(request.Timeout)
		defer timer.Stop()
		select {
		case <-exited:
		case <-timer.C:
			timedOut = true
			kill()
		case <-ctx.Done():
			cancelled = true
			kill()
		}
	}()

	waitErr := command.Wait()
	mu.Lock()
	reaped = true
	// Members left in the group keep its ID from reuse; an empty group
	// fails with ESRCH.
	_ = syscall.Kill(-pid, syscall.SIGKILL)
	mu.Unlock()
	close(exited)
	<-watched
	result.TimedOut, result.Cancelled = timedOut, cancelled

	select {
	case <-read:
	case <-time.After(grace):
		// Something outside the group still holds the output open.
		reader.Close()
		<-read
	}

	if state := command.ProcessState; state != nil {
		if status, ok := state.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			result.Signal = status.Signal().String()
		} else {
			code := state.ExitCode()
			result.ExitCode = &code
		}
	} else if waitErr != nil {
		result.Signal = waitErr.Error()
	}
	return result
}

// boundedOutput keeps the first bound bytes and the last bound bytes after
// them, the size of the whole and its digest.
type boundedOutput struct {
	mu     sync.Mutex
	bound  int
	head   []byte
	tail   []byte
	bytes  int64
	digest hash.Hash
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.digest.Write(p)
	b.bytes += int64(len(p))
	rest := p
	if room := b.bound - len(b.head); room > 0 {
		n := min(room, len(rest))
		b.head = append(b.head, rest[:n]...)
		rest = rest[n:]
	}
	b.tail = append(b.tail, rest...)
	if len(b.tail) > b.bound {
		b.tail = append(b.tail[:0:0], b.tail[len(b.tail)-b.bound:]...)
	}
	return len(p), nil
}

func (b *boundedOutput) result() (head, tail []byte, size int64, digest string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.head, b.tail, b.bytes, hex.EncodeToString(b.digest.Sum(nil))
}
