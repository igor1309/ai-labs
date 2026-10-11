package enforce_test

import (
	"errors"
	"math/rand"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
)

var claude = definition.Mapping{Select: "any", Primitives: []definition.Primitive{
	{Name: "Read", Grants: []string{"repository.read"}},
	{Name: "Glob", Grants: []string{"repository.read"}},
	{Name: "Grep", Grants: []string{"repository.search"}},
	{Name: "Bash", Grants: []string{"process.execute", "repository.read", "repository.search", "repository.diff", "repository.history.read", "host.read"}},
}}

var codex = definition.Mapping{Select: "one", Primitives: []definition.Primitive{
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

func TestOneRefusesWhenNoModeFits(t *testing.T) {
	t.Parallel()
	_, err := enforce.Make([]string{"repository.read", "repository.diff", "repository.search"}, codex, nil, nil)
	if err == nil || !strings.Contains(err.Error(), "read-only also grants process.execute") {
		t.Fatalf("err = %v", err)
	}
	plan, err := enforce.Make([]string{"repository.read", "repository.search", "repository.diff", "process.execute", "repository.write", "network"}, codex, nil, nil)
	if err != nil || strings.Join(plan.Primitives, ",") != "workspace-write" || strings.Join(plan.Withheld, ",") != "network" {
		t.Fatalf("the widest fitting mode is chosen: %+v, %v", plan, err)
	}
}

// Property: whatever the mapping and permissions, granted primitives never
// grant anything outside the permissions, nor anything state-reaching.
func TestPlansNeverExceedThePermissions(t *testing.T) {
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
		mapping := definition.Mapping{Select: []string{"any", "one"}[random.Intn(2)]}
		for j := 0; j < 1+random.Intn(5); j++ {
			mapping.Primitives = append(mapping.Primitives, definition.Primitive{Name: string(rune('P' + j)), Grants: pick()})
		}
		permissions, reaching := pick(), pick()
		plan, err := enforce.Make(permissions, mapping, nil, reaching)
		if err != nil {
			continue
		}
		for _, name := range plan.Primitives {
			for _, primitive := range mapping.Primitives {
				if primitive.Name != name {
					continue
				}
				for _, grant := range primitive.Grants {
					if !contains(permissions, grant) || contains(reaching, grant) {
						t.Fatalf("primitive %s grants %s outside %v (reaching %v)", name, grant, permissions, reaching)
					}
				}
			}
		}
		if mapping.Select == "one" && len(plan.Primitives) != 1 {
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
