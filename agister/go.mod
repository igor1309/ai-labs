module github.com/igor1309/ai-labs/agister

go 1.24

toolchain go1.27.1

require (
	github.com/igor1309/ai-labs/gokit v0.0.0
	github.com/igor1309/ai-labs/gokit/tree v0.0.0
)

require (
	github.com/BurntSushi/toml v1.6.0 // indirect
	github.com/santhosh-tekuri/jsonschema/v6 v6.0.3 // indirect
	golang.org/x/text v0.14.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/igor1309/ai-labs/gokit => ../gokit

replace github.com/igor1309/ai-labs/gokit/tree => ../gokit/tree
