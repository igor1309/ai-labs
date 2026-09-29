package supervisor

import (
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

var errNoProcess = errors.New("no such process")

// Token identifies a process instance: its start time as ps reports it. A
// process that reuses the ID starts at another time.
func Token(pid int) (string, error) {
	command := exec.Command("ps", "-o", "lstart=", "-p", strconv.Itoa(pid))
	command.Env = append(command.Environ(), "LC_ALL=C")
	out, err := command.Output()
	token := strings.TrimSpace(string(out))
	var exit *exec.ExitError
	switch {
	case token != "":
		return token, nil
	case errors.As(err, &exit) || err == nil:
		return "", errNoProcess
	}
	return "", err
}

// Processes ends process groups their owner left behind.
type Processes struct{}

var _ app.Processes = Processes{}

// Reap kills the group led by process group unless a live process holds
// that ID and is not the one token names. With no such process the group
// is killed anyway: its ID cannot be reused while any member remains.
func (Processes) Reap(group int, token string) (app.Reaping, error) {
	if group <= 1 {
		return "", fmt.Errorf("%d is not a process group", group)
	}
	current, err := Token(group)
	switch {
	case err == nil && (token == "" || current != token):
		return app.ReapLeft, fmt.Errorf("process %d is alive and is not known to be the recorded one; left alone", group)
	case err != nil && !errors.Is(err, errNoProcess):
		return app.ReapLeft, fmt.Errorf("checking process %d: %w", group, err)
	}
	switch err := syscall.Kill(-group, syscall.SIGKILL); {
	case err == nil:
		return app.ReapKilled, nil
	case errors.Is(err, syscall.ESRCH):
		return app.ReapGone, nil
	default:
		return app.ReapLeft, err
	}
}
