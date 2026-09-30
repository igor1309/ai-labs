package schema_test

import (
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
)

const doc = `{"type":"object","required":["verdict"],"properties":{"verdict":{"enum":["yes","no"]}}}`

func TestCompile(t *testing.T) {
	v := schema.Validator{}
	if err := v.Compile([]byte(doc)); err != nil {
		t.Fatal(err)
	}
	if err := v.Compile([]byte(`{"type": 5}`)); err == nil {
		t.Fatal("invalid schema compiled")
	}
	if err := v.Compile([]byte(`not json`)); err == nil || !strings.Contains(err.Error(), "not JSON") {
		t.Fatalf("err = %v", err)
	}
}

func TestValidate(t *testing.T) {
	v := schema.Validator{}
	if err := v.Validate([]byte(doc), []byte(`{"verdict":"yes"}`)); err != nil {
		t.Fatal(err)
	}
	if err := v.Validate([]byte(doc), []byte(`{"verdict":"maybe"}`)); err == nil || !strings.Contains(err.Error(), "/verdict") {
		t.Fatalf("err = %v", err)
	}
	if err := v.Validate([]byte(doc), []byte(`{}`)); err == nil || !strings.Contains(err.Error(), "missing property") {
		t.Fatalf("err = %v", err)
	}
	if err := v.Validate([]byte(doc), nil); err == nil || !strings.Contains(err.Error(), "no structured output") {
		t.Fatalf("err = %v", err)
	}
}
