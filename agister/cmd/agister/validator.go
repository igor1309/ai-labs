package main

import (
	"bytes"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// schemaValidator answers core/call's validator from jsonschema: output is
// checked against the schema it is given, compiled for that check; a
// schema that does not compile rejects it, as does output that is not
// JSON.
type schemaValidator struct{}

// schemaLocation is where a schema is compiled from: it is given as bytes,
// and read from nowhere.
const schemaLocation = "output.schema.json"

func (schemaValidator) Validate(schema, output []byte) error {
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(schema))
	if err != nil {
		return fmt.Errorf("the schema is not JSON: %w", err)
	}
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource(schemaLocation, document); err != nil {
		return fmt.Errorf("the schema: %w", err)
	}
	compiled, err := compiler.Compile(schemaLocation)
	if err != nil {
		return fmt.Errorf("the schema: %w", err)
	}
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(output))
	if err != nil {
		return fmt.Errorf("the output is not JSON: %w", err)
	}
	return compiled.Validate(instance)
}
