package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// RuntimeProber probes the runtime it was built for.
type RuntimeProber interface {
	Probe(ctx context.Context) (RuntimeProbe, error)
}

// RuntimeProbe is what a probe found: the version it probed, the primitives
// that held, and each outcome, as the adapter tells them.
type RuntimeProbe struct {
	Version    string    `json:"version"`
	Primitives []string  `json:"primitives"`
	Report     string    `json:"report"`
	ProbedAt   time.Time `json:"probed_at"`
}

// ProbeRecords keep the probes that passed, by adapter and version.
type ProbeRecords interface {
	Read(adapter, version string) (probe RuntimeProbe, found bool, err error)
	Write(adapter string, probe RuntimeProbe) error
}

// ProbeClock tells when a probe ran.
type ProbeClock interface{ Now() time.Time }

// Probes probe a runtime version once: a probe that passed is recorded
// and read back by every later call, in any process; one that failed is
// remembered by this process, which does not probe that version again.
// One probe runs at a time.
type Probes struct {
	probers map[string]func(command string) RuntimeProber
	records ProbeRecords
	clock   ProbeClock

	mu     sync.Mutex
	failed map[string]error
}

// NewProbes returns the probes of the adapters probers has a prober for,
// recorded in records.
func NewProbes(probers map[string]func(command string) RuntimeProber, records ProbeRecords, clock ProbeClock) *Probes {
	return &Probes{probers: probers, records: records, clock: clock, failed: map[string]error{}}
}

// Verified are the primitives a probe of the adapter's runtime found
// holding for version (ADR-029): none when the adapter has no prober, and
// an error when the probe failed.
func (p *Probes) Verified(ctx context.Context, adapter, command, version string) ([]string, error) {
	prober, ok := p.probers[adapter]
	if !ok {
		return nil, nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	key := adapter + " " + version
	if err := p.failed[key]; err != nil {
		return nil, err
	}
	recorded, found, err := p.records.Read(adapter, version)
	if err != nil {
		return nil, fmt.Errorf("reading the probe of %s %s: %w", adapter, version, err)
	}
	if found {
		return recorded.Primitives, nil
	}
	probe, err := prober(command).Probe(ctx)
	switch {
	case ctx.Err() != nil:
		return nil, errors.Join(ctx.Err(), err)
	case err != nil:
	case probe.Version != version:
		err = fmt.Errorf("the probe found version %s, not %s", probe.Version, version)
	case len(probe.Primitives) == 0:
		err = fmt.Errorf("no primitive held:\n%s", probe.Report)
	}
	if err != nil {
		p.failed[key] = err
		return nil, err
	}
	probe.ProbedAt = p.clock.Now()
	if err := p.records.Write(adapter, probe); err != nil {
		return nil, fmt.Errorf("recording the probe of %s %s: %w", adapter, version, err)
	}
	return probe.Primitives, nil
}

// probeRefusal is why a runtime version is refused when the settings verify
// no primitive for it and probing it failed.
func probeRefusal(err error) string {
	return ", and probing it failed: " + strings.ReplaceAll(err.Error(), "\n", "\n  ")
}
