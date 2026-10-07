//go:build !darwin

package supervisor

import "errors"

// exited cannot observe an exit without reaping it here: macOS is the only
// platform observed so. The supervisor, told so, kills the group before it
// reaps the process, as it does with any exit it cannot observe.
func exited(int) error { return errors.ErrUnsupported }

// zombieAlone is never asked: no exit is observed before its reap.
func zombieAlone() error { return nil }

func others(int) (bool, error) { return false, errors.ErrUnsupported }
