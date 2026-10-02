package fsdefs

// Observing returns the store with f called at each step of Write that the
// lock must cover: "create", "compare" and "rename".
func (s Store) Observing(f func(point string)) Store {
	s.at = f
	return s
}

// LockName is the writers' lock file.
const LockName = lockName

// StagingIn returns the store with its stages made in root.
func (s Store) StagingIn(root string) Store {
	s.temp = root
	return s
}

// Writing returns the backups with each file written by write.
func (b Backups) Writing(write func(path string, data []byte) error) Backups {
	b.write = write
	return b
}
