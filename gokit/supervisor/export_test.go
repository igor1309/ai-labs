package supervisor

// WithJoin returns r with its watcher calling ending at its end, before it
// says it has ended, and with Run giving joining a value while it waits
// for the watcher.
func WithJoin(r Runtime, ending func(), joining chan<- struct{}) Runtime {
	r.watcherEnding, r.joining = ending, joining
	return r
}
