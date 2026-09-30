// Package schema validates output against JSON Schema documents.
package schema

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

var printer = message.NewPrinter(language.English)

type Validator struct{}

func compile(document []byte) (*jsonschema.Schema, error) {
	schemaDoc, err := jsonschema.UnmarshalJSON(bytes.NewReader(document))
	if err != nil {
		return nil, fmt.Errorf("schema is not JSON: %w", err)
	}
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource("output.json", schemaDoc); err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	compiled, err := compiler.Compile("output.json")
	if err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	return compiled, nil
}

func (Validator) Compile(document []byte) error {
	_, err := compile(document)
	return err
}

func (Validator) Validate(document []byte, output json.RawMessage) error {
	if len(output) == 0 {
		return fmt.Errorf("no structured output")
	}
	compiled, err := compile(document)
	if err != nil {
		return err
	}
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(output))
	if err != nil {
		return fmt.Errorf("output is not JSON: %w", err)
	}
	if err := compiled.Validate(instance); err != nil {
		return fmt.Errorf("%s", compact(err))
	}
	return nil
}

// compact flattens the validator's multi-line error into one line.
func compact(err error) string {
	var validation *jsonschema.ValidationError
	if ve, ok := err.(*jsonschema.ValidationError); ok {
		validation = ve
	}
	if validation == nil {
		return err.Error()
	}
	var leaves []string
	var walk func(*jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) == 0 {
			location := "/" + joinPath(e.InstanceLocation)
			leaves = append(leaves, location+": "+e.ErrorKind.LocalizedString(printer))
			return
		}
		for _, cause := range e.Causes {
			walk(cause)
		}
	}
	walk(validation)
	return fmt.Sprint(leaves)
}

func joinPath(parts []string) string {
	var buffer bytes.Buffer
	for i, part := range parts {
		if i > 0 {
			buffer.WriteByte('/')
		}
		buffer.WriteString(part)
	}
	return buffer.String()
}
