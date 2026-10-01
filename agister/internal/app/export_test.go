package app

// OnCaptured sets the hook that runs between a cancel taking a run's
// callback and calling it. Set it before any run is cancelled.
func (h *Hosted) OnCaptured(hook func(id string)) { h.captured = hook }
