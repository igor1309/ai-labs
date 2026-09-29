package supervisor

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

var errNoProcess = errors.New("no such process")

// Token identifies a process instance, best effort: its start time and
// command name as ps reports them. A process that reuses the ID starts at
// another time, or runs another command; lstart has one-second resolution,
// so the same command reusing the ID within that second is not told apart.
func Token(ctx context.Context, pid int) (string, error) {
	command := exec.CommandContext(ctx, "ps", "-o", "lstart=,comm=", "-p", strconv.Itoa(pid))
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

const refPrefix = "pgid:"

// Ref names a process group and, once known, the token of the process that
// leads it, as the opaque reference the core stores: "pgid:<group>" while
// the token is unknown, else "pgid:<group>:<token>". The token is last
// because it may contain anything.
func Ref(group int, token string) string {
	if token == "" {
		return refPrefix + strconv.Itoa(group)
	}
	return refPrefix + strconv.Itoa(group) + ":" + token
}

// ParseRef reads a reference Ref made; any other is an error.
func ParseRef(ref string) (group int, token string, err error) {
	rest, ok := strings.CutPrefix(ref, refPrefix)
	if !ok {
		return 0, "", fmt.Errorf("%q is not a process reference this runtime made", ref)
	}
	number, token, _ := strings.Cut(rest, ":")
	group, err = strconv.Atoi(number)
	if err != nil {
		return 0, "", fmt.Errorf("%q is not a process reference this runtime made", ref)
	}
	return group, token, nil
}

// Processes ends process groups their owner left behind.
type Processes struct{}

var _ app.Processes = Processes{}

// Reap kills the group a reference (see Ref) names unless a live process
// holds that ID and is not the one its token names; with no token, unless
// any live process holds it. With no such process the group is killed
// anyway: its ID cannot be reused while any member remains. A reference
// Ref did not make is left, with an error.
func (Processes) Reap(ctx context.Context, ref string) (app.Reaping, error) {
	group, token, err := ParseRef(ref)
	if err != nil {
		return app.ReapLeft, err
	}
	if group <= 1 {
		return app.ReapLeft, fmt.Errorf("%d is not a process group", group)
	}
	current, err := Token(ctx, group)
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
