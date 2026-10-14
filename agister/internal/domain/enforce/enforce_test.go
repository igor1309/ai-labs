package enforce_test

import (
	"errors"
	"math/rand"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
)

var claude = enforce.Offer{Primitives: []enforce.Primitive{
	{Name: "Read", Grants: []string{"repository.read"}},
	{Name: "Glob", Grants: []string{"repository.read"}},
	{Name: "Grep", Grants: []string{"repository.search"}},
	{Name: "Bash", Grants: []string{"process.execute", "repository.read", "repository.search", "repository.diff", "repository.history.read", "host.read"}},
}}

var codex = enforce.Offer{One: true, Primitives: []enforce.Primitive{
	{Name: "read-only", Grants: []string{"repository.read", "repository.search", "repository.diff", "process.execute"}},
	{Name: "workspace-write", Grants: []string{"repository.read", "repository.search", "repository.diff", "process.execute", "repository.write"}},
}}

func TestAnySelectsEveryFittingPrimitiveAndWithholdsTheRest(t *testing.T) {
	t.Parallel()
	plan, err := enforce.Make([]string{"repository.read", "repository.diff", "repository.search"}, claude, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(plan.Primitives, ",") != "Read,Glob,Grep" || strings.Join(plan.Withheld, ",") != "repository.diff" {
		t.Fatalf("plan = %+v", plan)
	}
}

func TestRequiredPermissionsCannotBeWithheld(t *testing.T) {
	t.Parallel()
	plan, err := enforce.Make([]string{"repository.read", "repository.diff", "network"}, claude, []string{"repository.diff"}, nil)
	if err == nil || !strings.Contains(err.Error(), "required permissions would be withheld: repository.diff") {
		t.Fatalf("err = %v", err)
	}
	if plan.Primitives != nil {
		t.Fatalf("a refused call is given a plan: %+v", plan)
	}
	// The refusal keeps the plan it refused, for a view to show.
	var refused *enforce.RefusedError
	if !errors.As(err, &refused) || refused.Plan == nil || strings.Join(refused.Plan.Primitives, ",") != "Read,Glob" || strings.Join(refused.Plan.Withheld, ",") != "repository.diff,network" {
		t.Fatalf("refused plan of %v", err)
	}
}

func TestStateReachingPermissionsAreNeverGranted(t *testing.T) {
	t.Parallel()
	all := []string{"process.execute", "repository.read", "repository.search", "repository.diff", "repository.history.read", "host.read"}
	plan, err := enforce.Make(all, claude, nil, []string{"host.read"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.Join(plan.Primitives, ","), "Bash") {
		t.Fatalf("Bash reaches host.read and must not be granted: %+v", plan)
	}
}

// ADR-036: the narrowest mode covers require and reports extra grants.
func TestOnePlansTheNarrowestRequiredMode(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		required  []string
		primitive string
		extra     string
	}{
		{nil, "read-only", "process.execute"},
		{[]string{"repository.write"}, "workspace-write", "process.execute,repository.write"},
	} {
		plan, err := enforce.Make([]string{"repository.read", "repository.diff", "repository.search"}, codex, c.required, nil)
		if err != nil || strings.Join(plan.Primitives, ",") != c.primitive || strings.Join(plan.Extra, ",") != c.extra {
			t.Fatalf("plan %+v, %v", plan, err)
		}
	}
	_, err := enforce.Make([]string{"repository.read"}, codex, []string{"network"}, nil)
	if err == nil || !strings.Contains(err.Error(), "required permissions would be withheld: network") {
		t.Fatalf("missing require: %v", err)
	}
	_, err = enforce.Make([]string{"repository.read"}, codex, nil, []string{"process.execute"})
	if err == nil || !strings.Contains(err.Error(), "state_reaching permissions: process.execute") {
		t.Fatalf("state reach: %v", err)
	}
}

// ADR-036 permits extras only for select: one; state reach never crosses the plan.
func TestPlansKeepTheHardChecksAndReportEveryExtra(t *testing.T) {
	t.Parallel()
	names := []string{"a", "b", "c", "d", "e", "f"}
	random := rand.New(rand.NewSource(1))
	pick := func() []string {
		var out []string
		for _, name := range names {
			if random.Intn(2) == 0 {
				out = append(out, name)
			}
		}
		return out
	}
	for i := 0; i < 5000; i++ {
		offer := enforce.Offer{One: random.Intn(2) == 0}
		for j := 0; j < 1+random.Intn(5); j++ {
			offer.Primitives = append(offer.Primitives, enforce.Primitive{Name: string(rune('P' + j)), Grants: pick()})
		}
		permissions, reaching, required := pick(), pick(), pick()
		plan, err := enforce.Make(permissions, offer, required, reaching)
		if err != nil {
			continue
		}
		for _, grant := range plan.Granted {
			if contains(reaching, grant) || (!contains(permissions, grant) && (!offer.One || !contains(plan.Extra, grant))) {
				t.Fatalf("unsafe or unreported grant: %+v", plan)
			}
		}
		for _, extra := range plan.Extra {
			if contains(permissions, extra) || !contains(plan.Granted, extra) {
				t.Fatalf("incorrect extra: %+v", plan)
			}
		}
		for _, need := range required {
			if !contains(plan.Granted, need) {
				t.Fatalf("missing require: %+v", plan)
			}
		}
		if offer.One && len(plan.Primitives) != 1 {
			t.Fatalf("select one granted %v", plan.Primitives)
		}
	}
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// Narrowness is the grant count, with mapping order deciding equal counts;
// neither a smaller unsafe mode nor one missing require can displace it.
func TestOneSelectsTheNarrowestSafeRequiredPrimitive(t *testing.T) {
	t.Parallel()
	offer := enforce.Offer{One: true, Primitives: []enforce.Primitive{
		{Name: "unsafe", Grants: []string{"read", "state"}},
		{Name: "wide", Grants: []string{"read", "exec", "write"}},
		{Name: "empty"},
		{Name: "narrow", Grants: []string{"read", "exec"}},
		{Name: "tied", Grants: []string{"read", "diff"}},
	}}
	for _, allow := range [][]string{{"read"}, {"read", "exec", "write", "diff"}} {
		plan, err := enforce.Make(allow, offer, []string{"read"}, []string{"state"})
		if err != nil || strings.Join(plan.Primitives, ",") != "narrow" || strings.Join(plan.Granted, ",") != "read,exec" {
			t.Fatalf("plan %+v, %v", plan, err)
		}
	}
}
