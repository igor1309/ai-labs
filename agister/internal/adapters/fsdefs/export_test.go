package fsdefs

// Observing returns the store with f called at each step of Write that the
// lock must cover: "create", "compare" and "rename".
func (s Store) Observing(f func(point string)) Store {
	s.at = f
	return s
}

// LockName is the writers' lock file.
const LockName = lockName
