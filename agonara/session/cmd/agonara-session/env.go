package main

import (
	"fmt"
	"os"
	"strings"
)

// loadEnv sets each KEY=VALUE line of a file (blank lines and # comments
// skipped, one pair of surrounding quotes removed) unless already set.
func loadEnv(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read env file: %w", err)
	}
	for number, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "export "))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			// The line may hold a secret; name only its number.
			return fmt.Errorf("env file line %d: want KEY=VALUE", number+1)
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		if _, set := os.LookupEnv(key); !set {
			if err := os.Setenv(key, value); err != nil {
				return err
			}
		}
	}
	return nil
}
