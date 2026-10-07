package supervisor

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"strconv"
	"syscall"
)

// errUnsettled is what the listing answers when it found no process of
// the group alive but cannot prove the group had no other: a member found
// only as a zombie, which a kill may have made one, or a process gone
// before its stat was read, which may have been the group's. Whether the
// kill reached a leftover cannot be told.
var errUnsettled = errors.New("supervisor: the group's processes cannot be told from /proc")

// procOthers says whether the group has a process other than its leader
// that has not exited, from proc, a Linux /proc: each <pid>/stat's state
// and process group. It answers false with no error only when it proves
// the group has no other process: one found as a zombie, one whose stat
// is gone since the listing or cannot be parsed, leaves it unsettled
// (errUnsettled), and any other failure to read one fails the listing, as
// the process it hides may be the group's. A live process of the group
// settles it whatever else the listing finds.
func procOthers(proc fs.FS, group int) (bool, error) {
	entries, err := fs.ReadDir(proc, ".")
	if err != nil {
		return false, err
	}
	var unsettled error
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid == group {
			continue
		}
		live, err := procMember(proc, entry.Name(), group)
		if live {
			return true, nil
		}
		if err != nil && unsettled == nil {
			unsettled = fmt.Errorf("process %d: %w", pid, err)
		}
	}
	return false, unsettled
}

// procMember says whether the process named is a live member of the
// group; it fails when it cannot prove the process is not one.
func procMember(proc fs.FS, name string, group int) (bool, error) {
	stat, err := fs.ReadFile(proc, name+"/stat")
	if errors.Is(err, fs.ErrNotExist) || errors.Is(err, syscall.ESRCH) {
		return false, fmt.Errorf("gone since the listing: %w", errUnsettled)
	}
	if err != nil {
		return false, fmt.Errorf("reading its stat: %w", err)
	}
	// "pid (comm) state ppid pgrp ...", where comm may hold anything.
	end := bytes.LastIndexByte(stat, ')')
	if end < 0 {
		return false, fmt.Errorf("stat %q: %w", stat, errUnsettled)
	}
	fields := bytes.Fields(stat[end+1:])
	if len(fields) < 3 {
		return false, fmt.Errorf("stat %q: %w", stat, errUnsettled)
	}
	pgrp, err := strconv.Atoi(string(fields[2]))
	if err != nil {
		return false, fmt.Errorf("stat %q: %w", stat, errUnsettled)
	}
	if pgrp != group {
		return false, nil
	}
	if state := string(fields[0]); state == "Z" || state == "X" {
		return false, fmt.Errorf("a zombie of the group: %w", errUnsettled)
	}
	return true, nil
}
