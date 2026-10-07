package supervisor

import (
	"os"
	"syscall"
	"unsafe"
)

// pPID is waitid's idtype for one process (P_PID), which syscall does not
// name.
const pPID = 1

// exited returns once the child pid has exited, leaving it to be reaped:
// waitid with WEXITED|WNOWAIT.
func exited(pid int) error {
	// siginfo_t, which waitid fills in and nothing here reads.
	var info [128]byte
	for {
		_, _, errno := syscall.Syscall6(syscall.SYS_WAITID, pPID, uintptr(pid), uintptr(unsafe.Pointer(&info[0])), syscall.WEXITED|syscall.WNOWAIT, 0, 0)
		switch errno {
		case 0:
			return nil
		case syscall.EINTR:
			continue
		}
		return errno
	}
}

// zombieAlone is what kill answers for the group of an exited, unreaped
// leader alone: Linux signals the zombie.
func zombieAlone() error { return nil }

// others says whether the group has a process other than its leader that
// has not exited, from /proc.
func others(group int) (bool, error) { return procOthers(os.DirFS("/proc"), group) }
