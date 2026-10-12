// Package enforce turns effective permissions into runtime primitives using
// what a runtime offers. A primitive is granted only if everything it grants
// is allowed, so a plan never exceeds the offer.
package enforce

import (
	"fmt"
	"strings"
)

// Primitive is one restriction a runtime offers, a tool or a sandbox mode,
// with the permissions it grants.
type Primitive struct {
	Name   string
	Grants []string
}

// Offer is what a runtime offers a plan: its primitives, of which a plan
// takes any that fit, or exactly One, the one that grants the most.
type Offer struct {
	One        bool
	Primitives []Primitive
}

// Plan is what one call grants on its runtime.
type Plan struct {
	Primitives []string
	Granted    []string // permissions the primitives provide
	Withheld   []string // allowed but not provided
}

// RefusedError explains why no acceptable plan exists.
type RefusedError struct {
	Reasons []string
	// Plan is the plan refused for withholding a required permission, for a
	// view to show what else it withholds: never one a call is given. Nil
	// where no plan fits.
	Plan *Plan
}

func (e *RefusedError) Error() string {
	return "cannot enforce the effective permissions: " + strings.Join(e.Reasons, "; ")
}

// Make computes the plan. stateReaching permissions are never granted,
// whatever is allowed; required permissions must not be withheld.
func Make(permissions []string, offer Offer, required, stateReaching []string) (Plan, error) {
	allowed := subtract(permissions, stateReaching)
	fits := func(primitive Primitive) bool { return subset(primitive.Grants, allowed) }

	var granted []Primitive
	switch {
	case offer.One:
		var best *Primitive
		var reasons []string
		for i := range offer.Primitives {
			primitive := offer.Primitives[i]
			if !fits(primitive) {
				reasons = append(reasons, fmt.Sprintf("%s also grants %s", primitive.Name, strings.Join(subtract(primitive.Grants, allowed), ", ")))
				continue
			}
			if best == nil || len(primitive.Grants) > len(best.Grants) {
				best = &offer.Primitives[i]
			}
		}
		if best == nil {
			return Plan{}, &RefusedError{Reasons: reasons}
		}
		granted = []Primitive{*best}
	default:
		for _, primitive := range offer.Primitives {
			if fits(primitive) {
				granted = append(granted, primitive)
			}
		}
	}

	plan := Plan{Primitives: []string{}, Granted: []string{}, Withheld: []string{}}
	for _, primitive := range granted {
		plan.Primitives = append(plan.Primitives, primitive.Name)
		for _, grant := range primitive.Grants {
			if !contains(plan.Granted, grant) {
				plan.Granted = append(plan.Granted, grant)
			}
		}
	}
	for _, permission := range permissions {
		if !contains(plan.Granted, permission) {
			plan.Withheld = append(plan.Withheld, permission)
		}
	}
	var missing []string
	for _, permission := range required {
		if contains(plan.Withheld, permission) {
			missing = append(missing, permission)
		}
	}
	if len(missing) > 0 {
		return Plan{}, &RefusedError{Reasons: []string{"required permissions would be withheld: " + strings.Join(missing, ", ")}, Plan: &plan}
	}
	return plan, nil
}

func subset(list, of []string) bool {
	for _, item := range list {
		if !contains(of, item) {
			return false
		}
	}
	return true
}

func subtract(list, remove []string) []string {
	var out []string
	for _, item := range list {
		if !contains(remove, item) {
			out = append(out, item)
		}
	}
	return out
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
