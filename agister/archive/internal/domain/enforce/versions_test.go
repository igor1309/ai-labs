package enforce_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
)

func TestAnOfferKeepsThePrimitivesVerifiedForAVersion(t *testing.T) {
	t.Parallel()
	offer := enforce.Offer{Primitives: []enforce.Primitive{
		{Name: "X", Grants: []string{"p.one", "p.two"}, Verified: []string{"2.1."}},
		{Name: "Y", Grants: []string{"p.one"}},
	}}
	if !offer.Verified("2.1.283") || offer.Verified("2.2.0") || offer.Verified("12.1.0") {
		t.Fatal("verified prefixes")
	}
	verified, unverified := offer.ForVersion("2.1.283")
	if len(verified.Primitives) != 1 || verified.Primitives[0].Name != "X" || strings.Join(unverified, ",") != "Y" {
		t.Fatalf("for 2.1.283: %+v, unverified %v", verified.Primitives, unverified)
	}
	if verified, unverified := offer.ForVersion("2.2.0"); len(verified.Primitives) != 0 || strings.Join(unverified, ",") != "X,Y" {
		t.Fatalf("for 2.2.0: %+v, unverified %v", verified.Primitives, unverified)
	}
	if verified, unverified := offer.ForAnyVersion(); len(verified.Primitives) != 1 || strings.Join(unverified, ",") != "Y" {
		t.Fatalf("for any version: %+v, unverified %v", verified.Primitives, unverified)
	}
	if versions := offer.Versions(); strings.Join(versions, ",") != "2.1" {
		t.Fatalf("versions = %v", versions)
	}
	// A probe verifies the primitives it names for that version only, and
	// leaves the offer it was given as it was.
	probed := offer.WithVerified("2.2.0", []string{"Y"})
	if verified, unverified := probed.ForVersion("2.2.0"); len(verified.Primitives) != 1 || verified.Primitives[0].Name != "Y" || strings.Join(unverified, ",") != "X" {
		t.Fatalf("probed for 2.2.0: %+v, unverified %v", verified.Primitives, unverified)
	}
	if probed.Primitives[1].VerifiedFor("2.2.1") || offer.Primitives[1].VerifiedFor("2.2.0") || !probed.Primitives[0].VerifiedFor("2.1.283") {
		t.Fatalf("probed = %+v, offer = %+v", probed.Primitives, offer.Primitives)
	}
	// A prefix matches whole version components, with or without the dot.
	for prefix, versions := range map[string]map[string]bool{
		"2.1":  {"2.1.3": true, "2.1": true, "2.10.0": false, "2.11": false, "12.1.0": false},
		"2.1.": {"2.1.3": true, "2.10.0": false},
		"":     {"2.1.3": false},
	} {
		primitive := enforce.Primitive{Verified: []string{prefix}}
		for version, want := range versions {
			if got := primitive.VerifiedFor(version); got != want {
				t.Errorf("prefix %q, version %s: verified %v, want %v", prefix, version, got, want)
			}
		}
	}
	if unknown := offer.UnknownPermissions([]string{"p.one"}); strings.Join(unknown, ",") != "p.two" {
		t.Fatalf("unknown = %v", unknown)
	}
}

// A plan that ties on several versions takes the first the offer lists, so
// the versions are sorted and distinct, however the primitives declare
// their prefixes.
func TestAnOfferListsItsVersionsSorted(t *testing.T) {
	t.Parallel()
	primitives := func(verified ...[]string) enforce.Offer {
		var offer enforce.Offer
		for _, prefixes := range verified {
			offer.Primitives = append(offer.Primitives, enforce.Primitive{Verified: prefixes})
		}
		return offer
	}
	for name, c := range map[string]struct {
		offer enforce.Offer
		want  []string
	}{
		"declared in sorted order":            {primitives([]string{"1.", "2."}), []string{"1", "2"}},
		"declared against sorted order":       {primitives([]string{"2.", "1."}), []string{"1", "2"}},
		"the later primitive sorts first":     {primitives([]string{"2."}, []string{"1."}), []string{"1", "2"}},
		"primitives that interleave":          {primitives([]string{"3.", "1."}, []string{"2.2", "2.1."}), []string{"1", "2.1", "2.2", "3"}},
		"a prefix several primitives share":   {primitives([]string{"2.", "1."}, []string{"1.", "2"}), []string{"1", "2"}},
		"a prefix with and without its dot":   {primitives([]string{"2.1.", "2.1", "2."}), []string{"2", "2.1"}},
		"an empty prefix beside others":       {primitives([]string{"2.", "", "."}, []string{"1."}), []string{"1", "2"}},
		"a primitive verified for no version": {primitives(nil, []string{"2.", "1."}), []string{"1", "2"}},
		"no primitive is verified":            {primitives(nil, nil), nil},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := c.offer.Versions(); !slices.Equal(got, c.want) {
				t.Fatalf("versions = %q, want %q", got, c.want)
			}
		})
	}
}
