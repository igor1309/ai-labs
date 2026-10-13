package enforce

import (
	"slices"
	"sort"
	"strings"
)

// Version evidence describes the offer; planning uses the declared primitives
// even when their version is unverified (ADR-036).

// VerifiedFor reports whether version matches one of the primitive's
// verified prefixes. A prefix matches whole components: "2.1" and "2.1."
// match 2.1.3, not 2.10.0.
func (p Primitive) VerifiedFor(version string) bool {
	for _, prefix := range p.Verified {
		prefix = strings.TrimSuffix(prefix, ".")
		if prefix != "" && (version == prefix || strings.HasPrefix(version, prefix+".")) {
			return true
		}
	}
	return false
}

// ForVersion keeps the primitives verified for version and names the rest.
// It partitions evidence, not the primitives available to a plan.
func (o Offer) ForVersion(version string) (Offer, []string) {
	return o.keep(func(p Primitive) bool { return p.VerifiedFor(version) })
}

// Verified reports whether any primitive is verified for version.
func (o Offer) Verified(version string) bool {
	verified, _ := o.ForVersion(version)
	return len(verified.Primitives) > 0
}

// WithVerified is the offer with the primitives named verified for version
// too, as a probe of the runtime found them (ADR-029).
func (o Offer) WithVerified(version string, names []string) Offer {
	with := o
	with.Primitives = make([]Primitive, len(o.Primitives))
	for i, primitive := range o.Primitives {
		if slices.Contains(names, primitive.Name) {
			primitive.Verified = append(append([]string(nil), primitive.Verified...), version)
		}
		with.Primitives[i] = primitive
	}
	return with
}

// ForAnyVersion keeps the primitives verified for some version: what a
// plan can use before the runtime's version is known.
func (o Offer) ForAnyVersion() (Offer, []string) {
	return o.keep(func(p Primitive) bool { return len(p.Verified) > 0 })
}

// Versions lists the distinct version prefixes some primitive is verified
// for, sorted and without a trailing dot: each is a version a plan can be
// made for.
func (o Offer) Versions() []string {
	seen := map[string]bool{}
	var versions []string
	for _, primitive := range o.Primitives {
		for _, prefix := range primitive.Verified {
			if prefix = strings.TrimSuffix(prefix, "."); prefix != "" && !seen[prefix] {
				seen[prefix] = true
				versions = append(versions, prefix)
			}
		}
	}
	sort.Strings(versions)
	return versions
}

// UnknownPermissions lists the permissions the primitives grant that are
// not in vocabulary.
func (o Offer) UnknownPermissions(vocabulary []string) []string {
	var unknown []string
	for _, primitive := range o.Primitives {
		for _, grant := range primitive.Grants {
			if !slices.Contains(vocabulary, grant) && !slices.Contains(unknown, grant) {
				unknown = append(unknown, grant)
			}
		}
	}
	return unknown
}

func (o Offer) keep(verified func(Primitive) bool) (Offer, []string) {
	kept := o
	kept.Primitives = nil
	var unverified []string
	for _, primitive := range o.Primitives {
		if verified(primitive) {
			kept.Primitives = append(kept.Primitives, primitive)
		} else {
			unverified = append(unverified, primitive.Name)
		}
	}
	return kept, unverified
}
