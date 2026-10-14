module github.com/igor1309/ai-labs/agister

go 1.24

toolchain go1.27.1

require (
	github.com/BurntSushi/toml v1.6.0
	github.com/igor1309/ai-labs/gokit v0.0.0
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/igor1309/ai-labs/gokit => ../gokit
