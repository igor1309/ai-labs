package supervisor

import (
	"bytes"
	"os"
	"strconv"
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
// has not exited, from /proc/<pid>/stat: its state and process group.
func others(group int) (bool, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return false, err
	}
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid == group {
			continue
		}
		stat, err := os.ReadFile("/proc/" + entry.Name() + "/stat")
		if err != nil {
			continue // gone since the listing
		}
		// "pid (comm) state ppid pgrp ...", where comm may hold anything.
		end := bytes.LastIndexByte(stat, ')')
		if end < 0 {
			continue
		}
		fields := bytes.Fields(stat[end+1:])
		if len(fields) < 3 || string(fields[0]) == "Z" || string(fields[0]) == "X" {
			continue
		}
		if pgrp, err := strconv.Atoi(string(fields[2])); err == nil && pgrp == group {
			return true, nil
		}
	}
	return false, nil
}
