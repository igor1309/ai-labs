package supervisor

import (
	"syscall"
	"unsafe"
)

// exited returns once the child pid has exited, leaving it to be reaped: a
// kqueue NOTE_EXIT. The registration on a process that has exited already,
// a zombie as nothing reaps it before, fails with ESRCH.
func exited(pid int) error {
	queue, err := syscall.Kqueue()
	if err != nil {
		return err
	}
	defer syscall.Close(queue)
	changes := []syscall.Kevent_t{{
		Ident: uint64(pid), Filter: syscall.EVFILT_PROC, Flags: syscall.EV_ADD | syscall.EV_ONESHOT, Fflags: syscall.NOTE_EXIT,
	}}
	events := make([]syscall.Kevent_t, 1)
	for {
		n, err := syscall.Kevent(queue, changes, events, nil)
		if err == syscall.EINTR {
			// The changes were made before the wait was interrupted.
			changes = nil
			continue
		}
		if err != nil {
			return err
		}
		if n == 0 {
			continue
		}
		if events[0].Flags&syscall.EV_ERROR != 0 && events[0].Data != 0 {
			if errno := syscall.Errno(events[0].Data); errno != syscall.ESRCH {
				return errno
			}
		}
		return nil
	}
}

// zombieAlone is what kill answers for the group of an exited, unreaped
// leader alone: macOS finds no process it may signal.
func zombieAlone() error { return syscall.EPERM }

// The process table as sysctl gives it: kern.proc.pgrp.<group> lists the
// group's processes as kinfo_proc records, each with its state and PID.
const (
	ctlKern       = 1
	kernProc      = 14
	kernProcPgrp  = 2
	kinfoProcSize = 648
	statOffset    = 36 // kp_proc.p_stat
	pidOffset     = 40 // kp_proc.p_pid
	stateZombie   = 5  // SZOMB
)

// others says whether the group has a process other than its leader that
// has not exited.
func others(group int) (bool, error) {
	mib := [4]int32{ctlKern, kernProc, kernProcPgrp, int32(group)}
	for {
		var size uintptr
		if err := sysctl(mib[:], nil, &size); err != nil {
			return false, err
		}
		// Room for processes that start between the two calls.
		size += 8 * kinfoProcSize
		buffer := make([]byte, size)
		err := sysctl(mib[:], &buffer[0], &size)
		if err == syscall.ENOMEM {
			continue
		}
		if err != nil {
			return false, err
		}
		for at := 0; at+kinfoProcSize <= int(size); at += kinfoProcSize {
			record := buffer[at : at+kinfoProcSize]
			pid := *(*int32)(unsafe.Pointer(&record[pidOffset]))
			if int(pid) != group && record[statOffset] != stateZombie {
				return true, nil
			}
		}
		return false, nil
	}
}

func sysctl(mib []int32, out *byte, size *uintptr) error {
	_, _, errno := syscall.Syscall6(syscall.SYS___SYSCTL, uintptr(unsafe.Pointer(&mib[0])), uintptr(len(mib)),
		uintptr(unsafe.Pointer(out)), uintptr(unsafe.Pointer(size)), 0, 0)
	if errno != 0 {
		return errno
	}
	return nil
}

// CheckExitObservation reports whether Exec can observe an exit before reaping.
func (Exec) CheckExitObservation() error { return nil }
