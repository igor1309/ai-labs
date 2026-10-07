//go:build !linux && !darwin

package supervisor

import "errors"

// exited cannot observe an exit without reaping it here: the process is
// reaped by Wait alone, and what it left running is not signalled.
func exited(int) error { return errors.ErrUnsupported }

// zombieAlone is never asked: no exit is observed before its reap.
func zombieAlone() error { return nil }

func others(int) (bool, error) { return false, errors.ErrUnsupported }
