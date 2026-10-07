package supervisor

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"strconv"
	"syscall"
)

// procOthers says whether the group has a process other than its leader
// that has not exited, from proc, a Linux /proc: each <pid>/stat's state
// and process group. A process whose stat is gone since the listing has
// exited and been reaped, and is skipped; any other failure to read one
// fails the listing, as the process it hides may be the group's.
func procOthers(proc fs.FS, group int) (bool, error) {
	entries, err := fs.ReadDir(proc, ".")
	if err != nil {
		return false, err
	}
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid == group {
			continue
		}
		stat, err := fs.ReadFile(proc, entry.Name()+"/stat")
		if errors.Is(err, fs.ErrNotExist) || errors.Is(err, syscall.ESRCH) {
			continue // gone since the listing
		}
		if err != nil {
			return false, fmt.Errorf("reading process %d: %w", pid, err)
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
