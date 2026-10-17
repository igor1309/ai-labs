package inputs_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/inputs"
)

// sourceSpy answers a source with the value and the identity its test
// gives, and keeps the params it is asked with.
type sourceSpy struct {
	value, identity string
	params          []map[string]string
}

func (s *sourceSpy) Value(_ context.Context, _, params map[string]string) (inputs.Fixed, error) {
	s.params = append(s.params, params)
	return inputs.Fixed{Value: s.value, Identity: s.identity}, nil
}

// pathsSpy answers whether a path exists: those its test gives do, as
// written, and no other; err, where its test gives one, is its answer for
// every path. It keeps the paths it is asked.
type pathsSpy struct {
	exist []string
	err   error
	asked []string
}

func (s *pathsSpy) Exists(_ context.Context, path string) (bool, error) {
	s.asked = append(s.asked, path)
	return slices.Contains(s.exist, path), s.err
}

// resolver is a resolver over sources, and paths of which none exists.
func resolver(t *testing.T, sources map[string]inputs.Source) *inputs.Resolver {
	t.Helper()
	return resolverOver(t, sources, &pathsSpy{})
}

// resolverOver is a resolver over sources and paths.
func resolverOver(t *testing.T, sources map[string]inputs.Source, paths inputs.Paths) *inputs.Resolver {
	t.Helper()
	r, err := inputs.New(sources, paths)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func identity(text string) string {
	digest := sha256.Sum256([]byte(text))
	return hex.EncodeToString(digest[:])
}

func text(s string) inputs.Value { return inputs.Value{Text: s} }

func param(name string) inputs.Value {
	return inputs.Value{Reads: &inputs.Reference{Of: inputs.Params, Name: name}}
}

func input(name string) inputs.Value {
	return inputs.Value{Reads: &inputs.Reference{Of: inputs.Inputs, Name: name}}
}

// A resolver is given a source for each name it plugs in, and paths.
func TestNewFailsOnAMissingCollaborator(t *testing.T) {
	t.Parallel()
	_, err := inputs.New(map[string]inputs.Source{"param": nil}, &pathsSpy{})
	if err == nil || err.Error() != `inputs: no source "param"` {
		t.Errorf("New with no source for param: %v", err)
	}
	_, err = inputs.New(nil, nil)
	if err == nil || err.Error() != "inputs: no paths" {
		t.Errorf("New with no paths: %v", err)
	}
}

// inputs.feature, "The param source gives the named param".
func TestTheParamSourceGivesTheNamedParam(t *testing.T) {
	t.Parallel()
	r := resolver(t, map[string]inputs.Source{"param": inputs.ParamSource{}})
	got, err := r.Resolve(context.Background(), inputs.Declared{
		Params: []inputs.Param{{Name: "g"}},
		Inputs: []inputs.Input{{Name: "goal", Source: "param", Arguments: map[string]inputs.Value{"name": text("g")}}},
	}, map[string]string{"g": "ship it"})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]inputs.Fixed{"goal": {Value: "ship it", Identity: identity("ship it")}}
	if !reflect.DeepEqual(got.Inputs, want) {
		t.Errorf("inputs\n got %+v\nwant %+v", got.Inputs, want)
	}
}

// inputs.feature, "A source not plugged in refuses the call before it
// starts", and so does a source that cannot give its value.
func TestWhatCannotBeResolvedRefusesTheCall(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		input inputs.Input
		want  string
	}{
		{"a source not plugged in", inputs.Input{Name: "base", Source: "git.revision"},
			`input "base": no source "git.revision" is plugged in`},
		{"a param not given, with no default", inputs.Input{Name: "b", Source: "param", Arguments: map[string]inputs.Value{"name": text("base")}},
			`input "b": no param "base" is given`},
		{"an argument that reads a param not given", inputs.Input{Name: "b", Source: "param", Arguments: map[string]inputs.Value{"name": param("x")}},
			`input "b": argument "name": no param "x" is given`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			r := resolver(t, map[string]inputs.Source{"param": inputs.ParamSource{}})
			_, err := r.Resolve(context.Background(), inputs.Declared{
				Params: []inputs.Param{{Name: "base"}},
				Inputs: []inputs.Input{c.input},
			}, nil)
			var refusal *inputs.Refusal
			if !errors.As(err, &refusal) || refusal.Reason != c.want {
				t.Fatalf("resolved: %v, want the refusal %q", err, c.want)
			}
			if refusal.Status() != "failed" || refusal.Class() != "refused" {
				t.Errorf("refused %q, class %q; want failed, class refused", refusal.Status(), refusal.Class())
			}
		})
	}
}

// inputs.feature, "A param not given takes its default".
func TestAParamNotGivenTakesItsDefault(t *testing.T) {
	t.Parallel()
	main := "main"
	r := resolver(t, map[string]inputs.Source{"param": inputs.ParamSource{}})
	got, err := r.Resolve(context.Background(), inputs.Declared{
		Params: []inputs.Param{{Name: "base", Default: &main}},
		Inputs: []inputs.Input{{Name: "b", Source: "param", Arguments: map[string]inputs.Value{"name": text("base")}}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if want := map[string]string{"base": "main"}; !reflect.DeepEqual(got.Params, want) {
		t.Errorf("params %v, want %v", got.Params, want)
	}
	if got.Inputs["b"].Value != "main" {
		t.Errorf("b is %q, want main", got.Inputs["b"].Value)
	}
}

// A param given is its value, whatever its default.
func TestAParamGivenIsNotItsDefault(t *testing.T) {
	t.Parallel()
	main := "main"
	got, err := resolver(t, nil).Resolve(context.Background(), inputs.Declared{
		Params: []inputs.Param{{Name: "base", Default: &main}},
	}, map[string]string{"base": "dev"})
	if err != nil {
		t.Fatal(err)
	}
	if want := map[string]string{"base": "dev"}; !reflect.DeepEqual(got.Params, want) {
		t.Errorf("params %v, want %v", got.Params, want)
	}
}

// inputs.feature, "The environment's references are evaluated".
func TestTheEnvironmentsReferencesAreEvaluated(t *testing.T) {
	t.Parallel()
	spy := &sourceSpy{value: "2"}
	r := resolver(t, map[string]inputs.Source{"spy": spy})
	got, err := r.Resolve(context.Background(), inputs.Declared{
		Params: []inputs.Param{{Name: "p"}},
		Inputs: []inputs.Input{{Name: "i", Source: "spy"}},
		Environment: []inputs.Variable{
			{Name: "A", Value: text("x")},
			{Name: "B", Value: param("p")},
			{Name: "C", Value: input("i")},
		},
	}, map[string]string{"p": "1"})
	if err != nil {
		t.Fatal(err)
	}
	if want := map[string]string{"A": "x", "B": "1", "C": "2"}; !reflect.DeepEqual(got.Environment, want) {
		t.Errorf("environment %v, want %v", got.Environment, want)
	}
	if want := []map[string]string{{"p": "1"}}; !reflect.DeepEqual(spy.params, want) {
		t.Errorf("the source was asked with the params %v, want %v", spy.params, want)
	}
}

// A variable that reads what is not resolved refuses the call.
func TestAVariableReadingWhatIsNotResolvedRefusesTheCall(t *testing.T) {
	t.Parallel()
	_, err := resolver(t, nil).Resolve(context.Background(), inputs.Declared{
		Environment: []inputs.Variable{{Name: "C", Value: input("i")}},
	}, nil)
	var refusal *inputs.Refusal
	if want := `environment "C": no input "i" is resolved`; !errors.As(err, &refusal) || refusal.Reason != want {
		t.Errorf("resolved: %v, want the refusal %q", err, want)
	}
}

// inputs.feature, "A source that gives an identity gives the input's".
func TestASourceThatGivesAnIdentityGivesTheInputs(t *testing.T) {
	t.Parallel()
	r := resolver(t, map[string]inputs.Source{"s": &sourceSpy{value: "c1", identity: "c1"}})
	got, err := r.Resolve(context.Background(), inputs.Declared{
		Inputs: []inputs.Input{{Name: "rev", Source: "s"}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if want := map[string]inputs.Fixed{"rev": {Value: "c1", Identity: "c1"}}; !reflect.DeepEqual(got.Inputs, want) {
		t.Errorf("inputs %+v, want %+v", got.Inputs, want)
	}
}
