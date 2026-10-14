package runner

// NewReporting is New for the package's tests, with the runner's
// completion event: handled is called with a runnable's index once the
// runner has handled that runnable's return.
func NewReporting(handled func(index int), runnables ...Runnable) (*Runner, error) {
	r, err := New(runnables...)
	if err != nil {
		return nil, err
	}
	r.handled = handled
	return r, nil
}
