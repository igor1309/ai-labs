package fsdefs

// Observing returns the store with f called at each step of Write that the
// lock must cover: "create", "compare" and "rename"; and at "open", when Read
// has listed a skill's folder and is about to open its SKILL.md.
func (s Store) Observing(f func(point string)) Store {
	s.at = f
	return s
}

// LockName is the writers' lock file.
const LockName = lockName

// Writing returns the backups with each file written by write.
func (b Backups) Writing(write func(path string, data []byte) error) Backups {
	b.write = write
	return b
}
